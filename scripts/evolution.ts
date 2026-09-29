import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type BuildOptions, buildSync, type Loader, transformSync } from "esbuild";
import type { Conditions } from "../skills/testing/scripts/plan.js";
import { caseDefects, caseFiles, caseStarts, PLAN } from "./links.js";
import type { Held, Protection } from "./next-regression.js";
import { isData, type Result, runTrusted, typescriptConfig } from "./regression.js";
import {
  code,
  codeTokens,
  interpolations,
  statements,
  stringValue,
  templatePrefix,
  type Token,
  tokens,
} from "./source.js";
import { entriesIn, entryAt, entryBytes } from "./state.js";

/**
 * How Testing's protection definition may change between accepted
 * regressions without silently weakening what the accepted regression
 * protected. FAR decides the protected meaning: what is inherited, what is
 * explicitly given up, what is newly promised. How Testing demonstrates that
 * meaning, its cases, their claims, the data they read, their links and
 * memberships, the suites serving the plan and the conditions it requires, may
 * also change, and each change is classified from the files and from
 * evidence, never from what the candidate says of it:
 *
 * - preserved: every inherited case is still there as it was, or what it
 *   protected is shown to be kept by the cases that now carry each of its
 *   obligations;
 * - strengthened: something is added that detects or requires more, and
 *   nothing inherited is lost;
 * - reduced: something inherited is shown to be lost, which only an
 *   acceptance record may give up;
 * - unresolved: the change cannot be shown to preserve or strengthen what was
 *   protected.
 *
 * Reduced and unresolved changes cannot enter the next regression. What this
 * is for KAAL is stated in requirements/protection-evolution/requirement.md.
 */

export type Verdict = "preserved" | "strengthened" | "reduced" | "unresolved";
/** A change to the protection definition: what changed, how it is classified, and on what grounds. */
export type Change = { verdict: Verdict; what: string; why: string };

/**
 * The most witnesses a change is judged by. Each one runs the cases involved
 * twice, so beyond this, preservation is left unresolved rather than shown by
 * a sample the candidate could see coming.
 */
export const MAX_WITNESSES = 100;
/** How long one run against a witness may take before it is stopped, and read as not passing. */
const WITNESS_TIMEOUT = 120_000;

/** Sorted, once each. */
const sorted = (values: string[]) => [...new Set(values)].sort();
/** A case's address, the same for every case at it. */
export const address = (c: { file: string; title: string }) => `${c.file}\0${c.title}`;
/** A case as it is named for reading. */
const named = (c: { file: string; title: string }) => `${c.file}: ${JSON.stringify(c.title)}`;

/**
 * A complete one-to-one pairing of `left` with `right`, as large as can be,
 * where each pair `fits`: for each of `left`, the index of its partner in
 * `right`, or nothing. Grown by augmenting paths, so it does not depend on the
 * order either is listed in, and with as many partners that are `preferred`
 * as a complete pairing can have.
 */
export function pairing<L, R>(
  left: L[],
  right: R[],
  fits: (l: L, r: R) => boolean,
  preferred: (r: R) => boolean = () => true,
): (number | undefined)[] {
  const owner: (number | undefined)[] = right.map(() => undefined);
  const assign = (l: number, seen: Set<number>, may: (r: R) => boolean): boolean =>
    right.some((r, k) => {
      if (seen.has(k) || !may(r) || !fits(left[l]!, r)) return false;
      seen.add(k);
      if (owner[k] === undefined || assign(owner[k]!, seen, may)) return ((owner[k] = l), true);
      return false;
    });
  // First among the preferred alone, then among all: a path that grows a matching never frees what it has matched,
  // so as many preferred as can be are kept, and the matching is still complete where one can be.
  left.forEach((_, l) => assign(l, new Set(), preferred));
  left.forEach((_, l) => owner.includes(l) || assign(l, new Set(), () => true));
  return left.map((_, l) => {
    const k = owner.indexOf(l);
    return k < 0 ? undefined : k;
  });
}

/** Values the same once written the same way, whatever order their keys were written in. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );

/** Sets of conditions as the sets they are, in no order. */
export const asSets = (sets: Conditions[]) => [...new Set(sets.map((set) => canonical(set)))].sort();

// ---------------------------------------------------------------------------------------------------------------------
// What a case is defined by

/**
 * What the code around a module's cases states: the bindings its imports
 * make, and every other top-level statement, each as its code. Imports are a
 * set, since one bound beside another changes nothing the other does; the
 * statements are a sequence.
 */
type Frame = {
  imports: string[];
  statements: string[];
  /** Every name the module's code says, its cases included: what an added declaration must not take. */
  names: string[];
  /** The modules its imports load, in the order they are evaluated: the order they are first imported in. */
  loads: string[];
  /** Its export statements as it runs: what makes the namespace a case importing it sees. */
  exports: string[];
};

/**
 * What defines a case, as far as the files show it: its claim, the case's own
 * statement; the frame of the file it is kept in; the code of each test-data
 * loader its file reaches by its imports, as a frame; and the bytes of each
 * entry of test data its file, or a loader, names by a path. Comments and
 * layout are not part of it: they change nothing a case does.
 */
export type Definition = {
  file: string;
  title: string;
  claim: string;
  /** The settings its code is compiled with, as tsx reads them: the state's tsconfig and what it extends, digested. */
  settings: Record<string, string>;
  frame: Frame;
  loaders: Record<string, Frame | string>;
  data: Record<string, string>;
  /** The subject code its file reaches by its imports: what witnesses are made from. */
  subjects: string[];
  /** The modules it reaches that import one named only as they run, whose code nothing can compare. */
  computed: string[];
};

/** The bindings an import statement makes, each as `<specifier>|<imported>|<local>`, or `<specifier>|` for one that binds nothing. */
function bindings(statement: Token[]): string[] {
  const toks = statement.filter((t) => t.kind !== "comment" && !(t.kind === "name" && t.text === "type"));
  // As the transformer prints an import: its module is the string after `from`, or, importing only for its effect,
  // the one string it has.
  const after = toks.findIndex((t) => t.kind === "name" && t.text === "from");
  const spec = after >= 0 ? toks[after + 1] : toks.find((t) => t.kind === "string");
  const from = spec ? stringValue(spec) : undefined;
  if (from === undefined) return [code(statement)];
  const out: string[] = [];
  const end = toks.indexOf(spec!);
  let i = 1;
  while (i < end) {
    const t = toks[i]!;
    if (t.text === "*" && toks[i + 1]?.text === "as") {
      out.push(`${from}|*|${toks[i + 2]?.text}`);
      i += 3;
    } else if (t.text === "{") {
      i++;
      while (i < end && toks[i]!.text !== "}") {
        const imported = toks[i]!.text;
        if (imported === ",") {
          i++;
          continue;
        }
        const local = toks[i + 1]?.text === "as" ? toks[i + 2]!.text : imported;
        out.push(`${from}|${imported}|${local}`);
        i += toks[i + 1]?.text === "as" ? 3 : 1;
      }
      i++;
    } else if (t.kind === "name" && t.text !== "from") {
      out.push(`${from}|default|${t.text}`);
      i++;
    } else i++;
  }
  return out.length ? out : [`${from}|`];
}

/**
 * What `text`, code of the module at `file`, says, as the transformer that
 * runs it reads it: parsed, with its semicolons inserted where a line break
 * ends a statement, and printed back without comments, layout or types. Two
 * texts saying the same are the same here however laid out; a line break that
 * changes what runs, as after `return`, changes it. Text that does not parse
 * alone is kept as it is written, so any change to it is a change.
 */
function spoken(state: string, file: string, text: string): string {
  try {
    return compiled(state, file, text, { minifyWhitespace: true, legalComments: "none" }).trim();
  } catch {
    return `\0${text}`;
  }
}

/**
 * The top-level statements of `text`, the code of the module at `file`, as the
 * transformer that runs it structures them: printed back, with every import it
 * writes kept, each statement begins a line of its own, and nothing nested
 * does. So where one statement ends and the next begins is the transformer's
 * to say, never the layout's. Each is the printed text of one statement, types
 * gone. Text the transformer cannot read is one statement, as it is written,
 * so any change to it is a change.
 */
function topLevel(file: string, text: string): string[] {
  let printed: string;
  try {
    printed = transformSync(text, {
      loader: loaderFor(file),
      format: "esm",
      legalComments: "none",
      tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
    }).code;
  } catch {
    return [`\0${text}`];
  }
  return statements(printed).map((s) => printed.slice(s[0]!.start, s.at(-1)!.end));
}

/** The frame of a module's text: its imports' bindings and its other top-level statements. */
function frameOf(state: string, file: string, text: string, whole = text): Frame {
  const imports: string[] = [];
  const rest: string[] = [];
  for (const statement of topLevel(file, text)) {
    const toks = tokens(statement).filter((t) => t.kind !== "comment");
    if (toks[0]?.kind === "name" && toks[0].text === "import" && toks[1]?.text !== "(" && toks[1]?.text !== ".")
      imports.push(...bindings(toks));
    else rest.push(spoken(state, "printed.js", statement));
  }
  return {
    loads: moduleImports(state, file, whole).loads,
    exports: exportsOf(state, file, whole),
    imports: sorted(imports),
    statements: rest.filter(Boolean),
    names: sorted(codeTokens(whole).flatMap((t) => (t.kind === "name" ? [t.text] : []))),
  };
}

/**
 * How the transformer that runs a module reads it, by its extension, as tsx
 * does: every kind of module tsx runs, TypeScript, whose imports used only as
 * types load nothing, JavaScript, whose every import loads its module, and
 * either with JSX. Any other file is not code: it is read as it is held.
 */
const LOADERS: Record<string, Loader> = {
  ".ts": "ts",
  ".mts": "ts",
  ".cts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".jsx": "jsx",
};

/** The loader the transformer reads `file` with; TypeScript for what is not code, which it is never asked to read. */
export function loaderFor(file: string): Loader {
  return LOADERS[path.posix.extname(file)] ?? "ts";
}

/** Whether `file` is code tsx runs. */
const isCode = (file: string) => path.posix.extname(file) in LOADERS;

/**
 * `text`, the module at `file` in `state`, as the transformer that runs it
 * compiles it: with its loader, and with the state's own \`tsconfig.json\`, and
 * what that extends, as tsx reads it, since those settings decide what runs,
 * such as whether an import used for nothing is kept. Throws where it does not
 * compile.
 */
function compiled(state: string, file: string, text: string, options: BuildOptions = {}): string {
  const tsconfig = path.join(state, "tsconfig.json");
  return buildSync({
    stdin: {
      contents: text,
      loader: loaderFor(file),
      sourcefile: file,
      resolveDir: path.join(state, path.dirname(file)),
    },
    write: false,
    format: "esm",
    logLevel: "silent",
    ...(fs.existsSync(tsconfig) ? { tsconfig } : {}),
    ...options,
  }).outputFiles![0]!.text;
}

/** What a module loads, and whether that is all it can load. */
export type Imports = {
  /** Every module it names to load, statically, by `import()` or by `require()`, as its code runs. */
  specifiers: string[];
  /** The modules its imports load as it is evaluated, in the order it loads them: the order they are first imported. */
  loads: string[];
  /** Whether it can load, or see, what nothing can name before it runs. */
  computed: boolean;
};

/**
 * What `text`, the module at `file`, loads, as the transformer that runs it
 * says, never read from its source by KAAL: the module is compiled as tsx runs
 * it, so an import only of types, or of names used only as types, is gone, and
 * what the compiled module loads is what the bundler finds in it, every module
 * named external. Where the bundler finds no name, as `import(m)`, or a
 * pattern, as `require("./" + m)`, or code evaluated from text, as a direct
 * `eval`, which sees every binding beside it, or where the compiled code says
 * `import(` or `require` more often than the bundler found a module named,
 * what it loads or sees is known only as it runs. A module that does not
 * compile is one nothing can say that of either.
 */
export function moduleImports(state: string, file: string, text: string): Imports {
  const unknown = { specifiers: [], loads: [], computed: true };
  let out: string;
  let found: { path: string; kind: string }[];
  let warned: string[];
  try {
    out = compiled(state, file, text);
    const built = buildSync({
      // As the module it is, as tsx runs a case: the bundler reads code without imports or exports otherwise.
      stdin: { contents: `${out}\nexport {};`, loader: "js", sourcefile: file },
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      external: ["*"],
      metafile: true,
      logLevel: "silent",
    });
    found = Object.values(built.metafile!.inputs).flatMap((input) => input.imports);
    warned = built.warnings.map((w) => w.id);
  } catch {
    return unknown;
  }
  // A pattern, as the bundler reads `require("./" + m)`, names no module.
  const named = found.filter((i) => i.path !== "<runtime>" && !i.path.includes("*"));
  const toks = codeTokens(out);
  // Every place the compiled code reaches a loader by its name, however it does, against the modules found named.
  const reached = toks.filter(
    (t, i) =>
      t.kind === "name" &&
      toks[i - 1]?.text !== "." &&
      toks[i - 1]?.text !== "?." &&
      (t.text === "require" || (t.text === "import" && toks[i + 1]?.text === "(")),
  ).length;
  const computed =
    warned.includes("direct-eval") ||
    reached > named.filter((i) => i.kind === "dynamic-import" || i.kind === "require-call").length;
  const loads: string[] = [];
  for (const i of named) if (i.kind === "import-statement" && !loads.includes(i.path)) loads.push(i.path);
  return { specifiers: [...new Set(named.map((i) => i.path))], loads, computed };
}

/**
 * The export statements of `text`, the module at `file`, as the transformer
 * that runs it compiles them: what makes the namespace a case importing it
 * sees. An export only of types exports nothing. A module that does not
 * compile exports nothing KAAL can know of.
 */
function exportsOf(state: string, file: string, text: string): string[] {
  let out: string;
  try {
    out = compiled(state, file, text);
  } catch {
    return [];
  }
  return sorted(
    statements(out)
      .filter((statement) => statement[0]?.text === "export")
      .map((statement) => code(statement)),
  );
}

/** The top-level tokens of `toks`, each with the depth of brackets it is at. */
function depths(toks: Token[]): { t: Token; depth: number }[] {
  let depth = 0;
  return toks.map((t) => {
    if (t.kind === "punct" && [")", "]", "}"].includes(t.text)) depth--;
    const at = { t, depth };
    if (t.kind === "punct" && ["(", "[", "{"].includes(t.text)) depth++;
    return at;
  });
}

/** The words that come before the one name a declaration binds, in JavaScript as the transformer prints it. */
const DECLARES = new Set(["export", "async", "function", "*", "class"]);

/**
 * Whether `statement`, a top-level statement added beside inherited cases, as
 * the transformer prints it, evaluates nothing as its module loads, and takes
 * no name `used` holds. Whether it evaluates anything is the transformer's to
 * say, not KAAL's: compiled alone, dropping every binding it can drop without
 * changing what runs, nothing is left of it. So a call, an assignment, a value
 * computed or a class with code of its own is kept, and can change what the
 * inherited cases do, however they read. A type declared was never printed. The
 * name it declares, the one after its declaring words, must be new, and it
 * declares only that one: the transformer drops a pure binding whatever name it
 * takes.
 */
function inert(statement: string, used: Set<string>): boolean {
  const toks = tokens(statement).filter((t) => t.kind !== "comment");
  let k = 0;
  while (DECLARES.has(toks[k]?.text ?? "")) k++;
  if (["const", "let", "var"].includes(toks[k]?.text ?? "")) k++;
  if (k > 0) {
    // One plain name, new to the code, and no other: a pattern binds names KAAL does not read, so it is never inert.
    if (toks[k]?.kind !== "name" || used.has(toks[k]!.text)) return false;
    if (depths(toks).some((d) => d.depth === 0 && d.t.text === ",")) return false;
  }
  try {
    // No annotation calling a call pure is trusted: the call still runs.
    const compiled = transformSync(statement, {
      loader: "js",
      format: "esm",
      treeShaking: true,
      ignoreAnnotations: true,
    });
    return compiled.code.trim() === "";
  } catch {
    return false;
  }
}

/**
 * Whether `after` still states all `before` did, and adds nothing that could
 * change it: every binding it imported, and every other statement, in order,
 * as it was. An import added beside them binds from a module the file already
 * loads, or from Node itself, so no module it did not load runs; any other
 * statement added evaluates nothing, as `inert` says. Anything else added is
 * a change to every case of the module, whatever the cases say.
 */
function keepsFrame(before: Frame, after: Frame): boolean {
  if (!before.imports.every((b) => after.imports.includes(b))) return false;
  // Imported modules are evaluated in the order they are first imported, so what they do in that order is kept only
  // where it still is that order.
  // Node's own modules change nothing the cases do by being loaded or not, so they neither keep nor break the order.
  const own = (loads: string[]) => loads.filter((m) => !m.startsWith("node:"));
  if (canonical(own(after.loads).filter((m) => before.loads.includes(m))) !== canonical(own(before.loads)))
    return false;
  // What a module exports is part of what a case importing it sees, as its namespace, however inert the value.
  if (canonical(after.exports) !== canonical(before.exports)) return false;
  const used = new Set(before.names);
  // A module loaded now that was not loaded before runs its code beside the cases, however it came to be loaded: by
  // an import added, or by a name imported only as a type coming to be used as a value. Only Node's own may.
  if (!after.loads.every((m) => before.loads.includes(m) || m.startsWith("node:"))) return false;
  for (const binding of after.imports.filter((b) => !before.imports.includes(b))) {
    const [from, , local] = binding.split("|");
    if (from === undefined) return false;
    if (local && used.has(local)) return false;
  }
  const added: string[] = [];
  let at = 0;
  for (const statement of before.statements) {
    const found = after.statements.indexOf(statement, at);
    if (found < 0) return false;
    added.push(...after.statements.slice(at, found));
    at = found + 1;
  }
  added.push(...after.statements.slice(at));
  return added.every((statement) => inert(statement, used));
}

/** The end of the call opened by the first `(` from `start` in `text`, with the `;` that ends its statement, if any. */
function callEnd(toks: Token[], start: number): number {
  let depth = 0;
  let opened = false;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.start < start || t.kind === "comment") continue;
    if (t.kind === "punct" && ["(", "[", "{"].includes(t.text)) {
      depth++;
      opened = true;
    } else if (t.kind === "punct" && [")", "]", "}"].includes(t.text)) depth--;
    if (opened && depth === 0) {
      const next = toks.slice(i + 1).find((n) => n.kind !== "comment");
      return next?.text === ";" ? next.end : t.end;
    }
  }
  return toks.at(-1)?.end ?? start;
}

/** Each case `text` states, in the order its cases are read, with where its statement is, as `scripts/links.ts` finds them. */
function caseStatements(text: string): { title: string; start: number; end: number }[] {
  const toks = tokens(text);
  return caseStarts(text).map(({ title, index }) => ({ title, start: index, end: callEnd(toks, index) }));
}

/** The module `specifier` names from `file`, a posix path in `state`, if it names one the state holds, as a module loader finds it. */
function resolved(state: string, file: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const at = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  if (at === ".." || at.startsWith("../") || at.split("/")[0] === "node_modules") return undefined;
  // As tsx finds a module: as named, a JavaScript name standing for the TypeScript it compiles from, or with an
  // extension, or the index of a directory, of every kind of module it runs.
  const tries = [
    at,
    at.replace(/\.js$/, ".ts"),
    at.replace(/\.js$/, ".tsx"),
    at.replace(/\.jsx$/, ".tsx"),
    at.replace(/\.mjs$/, ".mts"),
    at.replace(/\.cjs$/, ".cts"),
    ...Object.keys(LOADERS).map((extension) => `${at}${extension}`),
    ...Object.keys(LOADERS).map((extension) => `${at}/index${extension}`),
  ];
  return tries.find((t) => fs.lstatSync(path.join(state, t), { throwIfNoEntry: false })?.isFile());
}

/** What a specifier names that nothing can know before it runs. */
const UNKNOWN = Symbol("unknown");

/**
 * The module a bare `specifier`, not a relative path, names from `file` in
 * `state`, as the transformer that runs it resolves it with the state's
 * tsconfig: none, where it names a package or Node itself, the module it names
 * where the tsconfig's paths map it into the state, and unknown where it
 * cannot be resolved as it would run.
 */
function aliased(state: string, file: string, specifier: string): string | undefined | typeof UNKNOWN {
  if (specifier.startsWith("node:")) return undefined;
  const tsconfig = path.join(state, "tsconfig.json");
  try {
    const built = buildSync({
      stdin: {
        contents: `import ${JSON.stringify(specifier)};`,
        loader: "js",
        sourcefile: "specifier.probe",
        resolveDir: path.join(state, path.dirname(file)),
      },
      absWorkingDir: state,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      write: false,
      metafile: true,
      logLevel: "silent",
      ...(fs.existsSync(tsconfig) ? { tsconfig } : {}),
    });
    // The import asked about, as the bundler read it from beside `file`.
    const probe = Object.entries(built.metafile!.inputs).find(([name]) => name.endsWith("specifier.probe"));
    const found = probe?.[1].imports[0];
    if (!found) return UNKNOWN;
    if (found.external) return undefined;
    const at = found.path.split(path.sep).join("/");
    return at.startsWith("../") || at.split("/")[0] === "node_modules" ? undefined : at;
  } catch {
    return UNKNOWN;
  }
}

/** Every entry under `rel` in `state`, itself included, as the regression's identity reads it, by path, digested. */
function held(state: string, rel: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (at: string | Buffer, name: string) => {
    const entry = entryAt(at);
    if (!entry) return;
    out[name] = createHash("sha256").update(entryBytes(entry)).digest("hex");
    if (entry.kind === "directory") for (const e of entriesIn(at)) walk(e.at, `${name}/${e.name}`);
  };
  walk(path.join(state, rel), rel);
  return out;
}

/** The test data a module's string literals name by a path, from where it is kept or from the state's root. */
function namedData(state: string, file: string, toks: Token[], modules: Set<string>): Record<string, string> {
  let out: Record<string, string> = {};
  toks.forEach((t) => {
    // A template names for certain only what it states before anything it interpolates: where that ends in a
    // directory, what is under it.
    const template = templatePrefix(t);
    const value =
      t.kind === "string"
        ? stringValue(t)
        : template && (template.computed ? template.text.slice(0, template.text.lastIndexOf("/") + 1) : template.text);
    // What names a module the code loads names a module, not data: the module is followed as code.
    if (!value || modules.has(value) || value.includes("\0") || value.length > 512) return;
    for (const base of [path.posix.dirname(file), "."]) {
      const at = path.posix.normalize(path.posix.join(base, value)).replace(/\/+$/, "");
      if (!at || at === "." || at === ".." || at.startsWith("../") || path.posix.isAbsolute(value)) continue;
      const stat = fs.lstatSync(path.join(state, at), { throwIfNoEntry: false });
      if (!stat) continue;
      // What it names that is test data: the entry itself, or, for a directory, every entry of test data under it.
      if (isData(at, stat.isDirectory())) out = { ...out, ...held(state, at) };
      else if (stat.isDirectory())
        for (const [entry, digest] of Object.entries(held(state, at)))
          if (entry !== at && isData(entry, !!fs.lstatSync(path.join(state, entry)).isDirectory())) out[entry] = digest;
    }
  });
  return out;
}

/**
 * What defines each case `state` keeps, in the order its cases are read: its
 * claim, its file's frame, the loaders its file reaches, and the test data
 * its file and those loaders name, with the subject code its file reaches.
 */
export function definitions(state: string): Definition[] {
  return caseFiles(state).flatMap((file) => {
    const text = fs.readFileSync(path.join(state, file), "utf8").replace(/\r\n/g, "\n");
    const cases = caseStatements(text);
    // The file without its cases: what every case of it shares.
    let rest = "";
    let from = 0;
    for (const c of cases) {
      rest += text.slice(from, c.start);
      from = c.end;
    }
    rest += text.slice(from);
    const frame = frameOf(state, file, rest, text);
    const settings = Object.assign({}, ...typescriptConfig(state).files.map((f) => held(state, f)));
    const own = new Set(moduleImports(state, file, text).specifiers);
    const loaders: Record<string, Frame | string> = {};
    const subjects = new Set<string>();
    const computed = new Set<string>();
    let data: Record<string, string> = namedData(state, file, codeTokens(rest), own);
    // The modules the file reaches: a test-data loader is part of what defines its cases, and the data it names;
    // any other code is the subject, what the cases are claims about.
    const seen = new Set<string>([file]);
    const queue = [file];
    while (queue.length) {
      const at = queue.shift()!;
      const source = fs.readFileSync(path.join(state, at), "utf8").replace(/\r\n/g, "\n");
      const read = moduleImports(state, at, source);
      if (read.computed) computed.add(at);
      for (const specifier of read.specifiers) {
        const module = specifier.startsWith(".") ? resolved(state, at, specifier) : aliased(state, at, specifier);
        if (module === UNKNOWN) computed.add(at);
        if (!module || module === UNKNOWN || seen.has(module)) continue;
        seen.add(module);
        if (module.endsWith(".test.ts")) continue;
        if (isData(module, false)) {
          if (isCode(module)) {
            const loader = fs.readFileSync(path.join(state, module), "utf8").replace(/\r\n/g, "\n");
            loaders[module] = frameOf(state, module, loader);
            data = {
              ...data,
              ...namedData(state, module, codeTokens(loader), new Set(moduleImports(state, module, loader).specifiers)),
            };
            queue.push(module);
          } else loaders[module] = held(state, module)[module]!;
        } else if (isCode(module)) {
          subjects.add(module);
          queue.push(module);
        }
      }
    }
    return cases.map((c) => {
      const statement = text.slice(c.start, c.end);
      return {
        file,
        title: c.title,
        claim: spoken(state, file, statement),
        settings,
        frame,
        loaders,
        data: { ...data, ...namedData(state, file, codeTokens(statement), own) },
        subjects: [...subjects].sort(),
        computed: [...computed].sort(),
      };
    });
  });
}

/**
 * Why `after`, a case of the candidate, is not defined as `before`, a case of
 * the accepted regression, was, if it is not: its claim is another, its file
 * no longer states what it did around its cases, a loader it reached no longer
 * states what it did, or test data it named no longer holds what it held.
 * What is only added beside them leaves it as it was.
 */
export function redefined(before: Definition, after: Definition, candidate: string): string | undefined {
  if (before.claim !== after.claim) return "its claim is another";
  // Compiled otherwise, the same code can run otherwise, whatever it reads as: any setting changed changes every case.
  if (canonical(before.settings) !== canonical(after.settings))
    return "the settings its code is compiled with are others";
  if (before.computed.length)
    return `${before.computed.join(", ")} reaches what is named only as it runs, so what defines it cannot be compared`;
  if (!keepsFrame(before.frame, after.frame)) return `${after.file} no longer states what it did around its cases`;
  for (const [module, was] of Object.entries(before.loaders)) {
    const stat = fs.lstatSync(path.join(candidate, module), { throwIfNoEntry: false });
    if (!stat?.isFile()) return `${module}, which it reaches, is gone`;
    if (typeof was === "string") {
      if (held(candidate, module)[module] !== was) return `${module}, which it reaches, holds other than it did`;
    } else if (
      !keepsFrame(
        was,
        frameOf(candidate, module, fs.readFileSync(path.join(candidate, module), "utf8").replace(/\r\n/g, "\n")),
      )
    )
      return `${module}, which it reaches, no longer states what it did`;
  }
  for (const [entry, was] of Object.entries(before.data))
    if (held(candidate, entry)[entry] !== was) return `its data ${entry} holds other than it did`;
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------------
// Witnesses

/** A witness: the subject changed at one place, so a case that detects the change fails against it. */
export type Witness = { module: string; line: number; from: string; to: string; source: string };

/** What a token could be made instead, each a change a case protecting the code should detect. */
function alternatives(t: Token, modules: Set<string>): string[] {
  const swap: Record<string, string[]> = {
    "+": ["-"],
    "-": ["+"],
    "*": ["/"],
    "/": ["*"],
    "%": ["*"],
    "===": ["!=="],
    "!==": ["==="],
    "==": ["!="],
    "!=": ["=="],
    "<": [">="],
    ">": ["<="],
    "<=": [">"],
    ">=": ["<"],
    "&&": ["||"],
    "||": ["&&"],
    "??": ["||"],
  };
  if (t.kind === "punct") return swap[t.text] ?? [];
  if (t.kind === "name" && (t.text === "true" || t.text === "false")) return [t.text === "true" ? "false" : "true"];
  if (t.kind === "number" && /^\d+$/.test(t.text)) return [String(Number(t.text) + 1)];
  // What names a module the code loads is left as it is: changed, the module is not found, which tells nothing apart.
  if (t.kind === "string" && !modules.has(stringValue(t) ?? ""))
    return [t.text.length > 2 ? `${t.text[0]}${t.text[0]}` : '"x"'];
  if (t.kind === "template" && !modules.has(templatePrefix(t)?.text ?? "")) {
    // Its text, without anything it says around what it interpolates.
    const bare = `\`${interpolations(t).join("")}\``;
    return bare !== t.text ? [bare] : [];
  }
  return [];
}

/** Every witness of `modules` in `state`, in order: one change each, only those that are still code the loader reads. */
export function witnesses(state: string, modules: string[]): Witness[] {
  return modules.flatMap((module) => {
    const text = fs.readFileSync(path.join(state, module), "utf8");
    const toks = codeTokens(text);
    const loaded = new Set(moduleImports(state, module, text).specifiers);
    let runs: string;
    try {
      runs = compiled(state, module, text);
    } catch {
      return [];
    }
    return toks.flatMap((t) =>
      alternatives(t, loaded).flatMap((to) => {
        const source = text.slice(0, t.start) + to + text.slice(t.end);
        try {
          // A change the transformer compiles away, as one to a type, changes nothing that runs: no witness.
          if (compiled(state, module, source) === runs) return [];
        } catch {
          return []; // Not code any more: every case reaching it fails alike, which tells nothing apart.
        }
        return [{ module, line: text.slice(0, t.start).split("\n").length, from: t.text, to, source }];
      }),
    );
  });
}

/** A copy of `state` with `witness` in place, sharing its dependencies. */
function withWitness(state: string, witness: Witness): string {
  const copy = copyOf(state, state);
  fs.writeFileSync(path.join(copy, witness.module), witness.source);
  return copy;
}

/**
 * A copy of `state`, the accepted state, sharing the dependencies of `of`, the
 * candidate: a case entering is run against the accepted code as the
 * candidate runs its cases, so what it finds is the accepted code's doing.
 */
function withDependencies(state: string, of: string): string {
  return copyOf(state, of);
}

/** Removes a copy made by \`copyOf\`, with the directory made to hold it. */
function removeCopy(copy: string): void {
  fs.rmSync(path.dirname(copy), { recursive: true, force: true });
}

/** A copy of `state`, without Git's files, sharing the dependencies `of` holds. */
function copyOf(state: string, of: string): string {
  const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kaal-witness-")), "repo");
  fs.cpSync(state, copy, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => {
      const rel = path.relative(state, src).split(path.sep).join("/");
      return rel !== ".git" && rel !== "node_modules";
    },
  });
  if (fs.existsSync(path.join(of, "node_modules")))
    fs.symlinkSync(path.resolve(of, "node_modules"), path.join(copy, "node_modules"), "junction");
  return copy;
}

/** Which of `cases`, occurrences, did not pass in `results`. */
function detected(results: Result[], cases: string[]): Set<string> {
  return new Set(cases.filter((at) => !passed(results, at)));
}

/**
 * A case by its occurrence: its address and which of the cases at it it is,
 * in the order they are read. Two cases at one address are two cases, so each
 * is matched to its own result, never to another's.
 */
export const occurrence = (c: { file: string; title: string }, nth: number) => JSON.stringify([c.file, c.title, nth]);

/** Whether the case at `at`, an occurrence, passed in `results`: the result at its place among those at its address. */
function passed(results: Result[], at: string): boolean {
  const [file, title, nth] = JSON.parse(at) as [string, string, number];
  return results.filter((r) => r.file === file && r.name === title)[nth]?.outcome === "pass";
}

/**
 * Which witnesses each case detects: `old`, cases of the accepted regression,
 * run as its replay runs them, and `now`, cases of the candidate, run with its
 * own data, each against the candidate with the witness in place. A run that
 * does not complete detects it for every case it runs.
 */
function detections(
  accepted: string,
  candidate: string,
  found: Witness[],
  old: string[],
  now: string[],
): { old: Map<string, Set<number>>; now: Map<string, Set<number>> } {
  // Each side's cases are occurrences, each matched to its own result.
  const out = { old: new Map<string, Set<number>>(), now: new Map<string, Set<number>>() };
  for (const at of old) out.old.set(at, new Set());
  for (const at of now) out.now.set(at, new Set());
  const files = (cases: string[]) => new Set(cases.map((at) => (JSON.parse(at) as [string])[0]));
  const run = (subject: string, side: "old" | "now"): Set<string> => {
    const [trusted, addresses] = side === "old" ? [accepted, old] : [candidate, now];
    if (!addresses.length) return new Set();
    const running = files(addresses);
    try {
      return detected(
        runTrusted(trusted, subject, (file) => running.has(file), undefined, WITNESS_TIMEOUT),
        addresses,
      );
    } catch {
      return new Set(addresses);
    }
  };
  // Only a case that holds of the candidate itself detects anything: one that fails without a witness tells none apart.
  const failing = { old: run(candidate, "old"), now: run(candidate, "now") };
  found.forEach((witness, w) => {
    const subject = withWitness(candidate, witness);
    try {
      for (const side of ["old", "now"] as const)
        for (const at of run(subject, side)) if (!failing[side].has(at)) out[side].get(at)!.add(w);
    } finally {
      removeCopy(subject);
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The judgement

/** An obligation a case carries: a commitment it helps prove, or a suite serving the plan it belongs to. */
type Obligation = { kind: "commitment" | "suite"; place: string };
const obligations = (c: Held): Obligation[] => [
  ...c.places.map((place) => ({ kind: "commitment" as const, place })),
  ...c.suites.map((place) => ({ kind: "suite" as const, place })),
];
const carries = (c: Held, o: Obligation) => (o.kind === "commitment" ? c.places : c.suites).includes(o.place);
const saying = (o: Obligation) => (o.kind === "commitment" ? `helps prove ${o.place}` : `belongs to ${o.place}`);

/**
 * How `candidate`'s own regression, `own`, changes the protection definition
 * of `derived`, the regression derived for it from `accepted` by FAR, each
 * change classified, with why it cannot enter the next regression where it
 * cannot. `inherited` are the accepted regression's cases that no acceptance
 * record gives up, as `derived` holds them; `promises` are what the candidate
 * newly promises, whose links FAR brings in; `refused` are the addresses of
 * the candidate's cases that do not pass as the next regression, which the
 * successor checks already refuse. `maxWitnesses` is the most witnesses each
 * retirement is judged by, counted over the code its own cases reach.
 */
export function evolution(
  accepted: string,
  candidate: string,
  derived: Protection,
  own: Protection,
  inherited: Held[],
  promises: string[],
  refused: Set<string> = new Set(),
  maxWitnesses = MAX_WITNESSES,
): { changes: Change[]; errors: string[] } {
  const changes: Change[] = [];
  const errors: string[] = [];
  const add = (verdict: Verdict, what: string, why: string, error?: string) => {
    changes.push({ verdict, what, why });
    if (verdict === "reduced" || verdict === "unresolved") errors.push(error ?? `${what}: ${verdict}: ${why}`);
  };

  // What the regression protects is FAR's to decide: a commitment inherited and not given up, or one newly promised.
  const derivedPlaces = new Set(derived.commitments.map((c) => c.place));
  const ownPlaces = new Set(own.commitments.map((c) => c.place));
  for (const { place } of derived.commitments.filter((c) => !ownPlaces.has(c.place)))
    errors.push(
      promises.includes(place)
        ? `${place}: newly promised and demonstrated, but the candidate's regression does not require it`
        : `${place}: inherited, and no acceptance record gives it up, but the candidate's regression no longer requires it`,
    );
  for (const { place } of own.commitments.filter((c) => !derivedPlaces.has(c.place)))
    errors.push(
      promises.includes(place)
        ? `${place}: newly promised but not demonstrated, so it cannot enter the regression`
        : `${place}: the candidate's regression requires it, but it is neither inherited nor newly promised`,
    );

  // What shows a commitment: more is stronger, less is a loss.
  for (const { place, shownBy: was } of derived.commitments) {
    const is = own.commitments.find((c) => c.place === place)?.shownBy;
    if (!is || canonical(is) === canonical(was)) continue;
    if (was.every((by) => is.includes(by)))
      add("strengthened", place, `shown by ${is.join(", ")}, where the regression shows it by ${was.join(", ")}`);
    else
      add(
        "reduced",
        place,
        "shown by less",
        `${place}: the regression shows it by ${was.join(", ")}, but the candidate's by ${is.join(", ")}`,
      );
  }

  // A suite serving the plan is a concern the plan requires: another one is more, one gone is given up only by a record.
  for (const suite of derived.suites.filter((s) => !own.suites.includes(s)))
    add(
      "reduced",
      suite,
      "no longer serves the plan",
      `${suite}: serves the regression, and no acceptance record gives it up, but no longer serves the candidate's`,
    );
  for (const suite of own.suites.filter((s) => !derived.suites.includes(s)))
    add("strengthened", suite, "a concern that now serves the regression's plan too");

  // The conditions and proof the plan requires: another set is more, one gone has no way to be given up yet.
  const setsChange = (what: string, was: string[], is: string[]) => {
    for (const set of is.filter((s) => !was.includes(s))) add("strengthened", what, `also required under ${set}`);
    return was.every((s) => is.includes(s));
  };
  const [wasConditions, isConditions] = [asSets(derived.conditions), asSets(own.conditions)];
  if (!setsChange(`${PLAN}: its conditions`, wasConditions, isConditions))
    add(
      "reduced",
      `${PLAN}: its conditions`,
      "a set of conditions is no longer required",
      `${PLAN}: its conditions are ${canonical(own.conditions)}, but the regression's are ${canonical(derived.conditions)}, which nothing gives up or adds to`,
    );
  const proofKept = Object.entries(derived.proof).every(([name, under]) =>
    setsChange(`${PLAN}: its proof ${name}`, asSets(under), asSets(own.proof[name] ?? [])),
  );
  for (const [name, under] of Object.entries(own.proof).filter(([name]) => !(name in derived.proof)))
    for (const set of asSets(under)) add("strengthened", `${PLAN}: its proof ${name}`, `also required under ${set}`);
  if (!proofKept)
    add(
      "reduced",
      `${PLAN}: its proof`,
      "proof is no longer required where it was",
      `${PLAN}: its proof are ${canonical(own.proof)}, but the regression's are ${canonical(derived.proof)}, which nothing gives up or adds to`,
    );
  // The data the plan hands every case: another data is another definition of every case, which nothing yet shows kept.
  const data = (p: Protection) => (p.data === undefined ? null : { place: p.data, held: p.dataHeld ?? null });
  if (canonical(data(own)) !== canonical(data(derived)))
    add(
      "unresolved",
      `${PLAN}: its data`,
      "the data it hands every case changed",
      own.data !== undefined && own.data === derived.data
        ? `${PLAN}: its data, ${own.data}, hold other than the regression's, which nothing gives up or adds to`
        : `${PLAN}: its data are ${canonical(own.data ?? null)}, but the regression's are ${canonical(derived.data ?? null)}, which nothing gives up or adds to`,
    );

  // Cases. Each inherited case is paired, at its address, with a case of the candidate: preferably one defined as it
  // was and keeping every obligation, then one defined as it was, then any. What an inherited case is not carried
  // with, it retires, and each obligation it retires must be shown kept by the cases that now carry it.
  const was = new Map<string, Definition[]>();
  for (const d of definitions(accepted)) was.set(address(d), [...(was.get(address(d)) ?? []), d]);
  const is = new Map<string, Definition[]>();
  for (const d of definitions(candidate)) is.set(address(d), [...(is.get(address(d)) ?? []), d]);
  const ownCases = own.cases;
  // Which of the cases at its address a case is, by its place among them: the definition read at that place.
  const nthAt = (list: Held[], k: number) => list.slice(0, k).filter((c) => address(c) === address(list[k]!)).length;
  const inheritedDefs = inherited.map((c, i) => was.get(address(c))?.[nthAt(inherited, i)]);
  const ownDefs = ownCases.map((c, k) => is.get(address(c))?.[nthAt(ownCases, k)]);
  const same = (i: number, k: number) =>
    !!inheritedDefs[i] && !!ownDefs[k] && redefined(inheritedDefs[i]!, ownDefs[k]!, candidate) === undefined;
  const keepsAll = (d: Held, c: Held) =>
    d.places.every((p) => c.places.includes(p)) && d.suites.every((s) => c.suites.includes(s));
  const partner: (number | undefined)[] = inherited.map(() => undefined);
  for (const at of new Set(inherited.map(address))) {
    const ins = inherited.flatMap((c, i) => (address(c) === at ? [i] : []));
    const outs = ownCases.flatMap((c, k) => (address(c) === at ? [k] : []));
    const taken = new Set<number>();
    for (const fits of [
      (i: number, k: number) => same(i, k) && keepsAll(inherited[i]!, ownCases[k]!),
      (i: number, k: number) => same(i, k),
      () => true,
    ]) {
      const left = ins.filter((i) => partner[i] === undefined);
      const right = outs.filter((k) => !taken.has(k));
      pairing(left, right, fits).forEach((p, j) => {
        if (p === undefined) return;
        partner[left[j]!] = right[p];
        taken.add(right[p]!);
      });
    }
  }
  const paired = new Set(partner.filter((k) => k !== undefined));

  // What must be shown kept: each obligation an inherited case no longer carries as it was.
  const retiring: { i: number; o: Obligation; why: string }[] = [];
  const entering: { k: number; why: string }[] = [];
  inherited.forEach((c, i) => {
    const k = partner[i];
    const o = k === undefined ? undefined : ownCases[k]!;
    const change =
      k === undefined
        ? "the candidate no longer has it"
        : same(i, k)
          ? undefined
          : (redefined(inheritedDefs[i]!, ownDefs[k]!, candidate) ?? "it is defined otherwise");
    if (k !== undefined && change) entering.push({ k, why: `redefined: ${change}` });
    for (const ob of obligations(c))
      if (!(o && !change && carries(o, ob)))
        retiring.push({
          i,
          o: ob,
          why: change === undefined ? `it no longer ${saying(ob)}` : k === undefined ? change : `redefined: ${change}`,
        });
    // Carried as it was, with more than it had: an inherited claim, already authorized, now protecting more.
    if (o && !change)
      for (const ob of obligations(o).filter((ob) => !carries(c, ob) && !promised(ob)))
        add("strengthened", named(c), `it now also ${saying(ob)}`);
  });
  function promised(ob: Obligation) {
    return ob.kind === "commitment" && promises.includes(ob.place);
  }
  // A case of the candidate carrying no inherited case: one that demonstrates a new promise enters with it, as FAR
  // says; any obligation it carries besides is more protection, which must be authorized as any case entering is.
  ownCases.forEach((c, k) => {
    if (paired.has(k) || refused.has(address(c))) return;
    const more = obligations(c).filter((ob) => !promised(ob));
    if (more.length) entering.push({ k, why: `added: it ${more.map(saying).join(" and ")}` });
  });

  // A case entering by evolution must hold of the accepted state too: its oracle is authorized by what was accepted,
  // unless it tests a recorded defect, whose record says the accepted state did not hold what it should.
  const enteringCases = entering.filter((e) => !refused.has(address(ownCases[e.k]!)));
  if (enteringCases.length) {
    const files = new Set(enteringCases.map((e) => ownCases[e.k]!.file));
    let results: Result[] = [];
    try {
      const subject = withDependencies(accepted, candidate);
      try {
        results = runTrusted(candidate, subject, (file) => files.has(file));
      } finally {
        removeCopy(subject);
      }
    } catch {
      results = [];
    }
    // Which defects each case tests, by its occurrence, as its result is matched: never another's at its address.
    const defects = caseDefects(candidate);
    const defectsOf = (k: number) =>
      defects.filter((d) => address(d) === address(ownCases[k]!))[nthAt(ownCases, k)]?.defects ?? [];
    for (const { k, why } of enteringCases) {
      const c = ownCases[k]!;
      const holds = passed(results, occurrence(c, nthAt(ownCases, k)));
      const tests = defectsOf(k).filter((d) =>
        fs.lstatSync(path.join(candidate, d, "defect.md"), { throwIfNoEntry: false })?.isFile(),
      );
      if (holds) add("strengthened", named(c), `${why}; it holds of the accepted state too`);
      else if (tests.length) add("strengthened", named(c), `${why}; it tests ${tests.join(", ")}, recorded`);
      else
        add(
          "unresolved",
          named(c),
          `${why}, but it does not hold of the accepted state, so what it expects is not authorized by what was accepted: newly promise it, or name the defect it tests`,
        );
    }
  }

  // Each obligation retired is kept only where every witness the retiring case detected is detected by a case of the
  // candidate's regression carrying that obligation: its closure, over the graph, not the retiring case's own address.
  const accounting = retiring.map(({ i, o, why }) => ({
    i,
    o,
    why,
    by: ownCases.flatMap((c, k) => (carries(c, o) && !refused.has(address(c)) ? [k] : [])),
  }));
  for (const r of accounting.filter((r) => !r.by.length)) {
    const c = inherited[r.i]!;
    add(
      "reduced",
      named(c),
      `${r.why}, and no case of the candidate's regression ${saying(r.o)} any more`,
      partner[r.i] === undefined
        ? `${named(c)}: in the regression, and no acceptance record excludes it, but the candidate no longer has it`
        : `${named(c)}: ${saying(r.o)} in the regression, but no longer does in the candidate's`,
    );
  }
  const toShow = accounting.filter((r) => r.by.length);
  // Each retirement is judged by the witnesses of the code its own cases reach: the retiring case and those now
  // carrying the obligation. Witnesses of code only another retirement reaches neither help nor count against it.
  const held = (m: string) => fs.lstatSync(path.join(candidate, m), { throwIfNoEntry: false })?.isFile();
  const reach = new Map(
    toShow.map((r) => [
      r,
      sorted([...(inheritedDefs[r.i]?.subjects ?? []), ...r.by.flatMap((k) => ownDefs[k]?.subjects ?? [])]).filter(
        held,
      ),
    ]),
  );
  const count = new Map([...new Set([...reach.values()].flat())].map((m) => [m, witnesses(candidate, [m]).length]));
  const judged = toShow.filter((r) => {
    const n = reach.get(r)!.reduce((sum, m) => sum + count.get(m)!, 0);
    if (!n)
      add(
        "unresolved",
        named(inherited[r.i]!),
        `${r.why}; no witness can be made of the code its cases reach, so nothing shows what it protected kept`,
      );
    else if (n > maxWitnesses)
      add(
        "unresolved",
        named(inherited[r.i]!),
        `${r.why}; its cases reach code with ${n} witnesses, more than the ${maxWitnesses} a change is judged by`,
      );
    return n > 0 && n <= maxWitnesses;
  });
  if (judged.length) {
    const found = witnesses(candidate, sorted(judged.flatMap((r) => reach.get(r)!)));
    const oldOf = (i: number) => occurrence(inherited[i]!, nthAt(inherited, i));
    const nowOf = (k: number) => occurrence(ownCases[k]!, nthAt(ownCases, k));
    const oldAt = sorted(judged.map((r) => oldOf(r.i)));
    const nowAt = sorted(judged.flatMap((r) => r.by.map(nowOf)));
    const seen = detections(accepted, candidate, found, oldAt, nowAt);
    const where = (w: number) => `${found[w]!.module}:${found[w]!.line} ${found[w]!.from} → ${found[w]!.to}`;
    for (const r of judged) {
      const retired = inherited[r.i]!;
      const own = new Set(found.flatMap((w, n) => (reach.get(r)!.includes(w.module) ? [n] : [])));
      const before = new Set([...seen.old.get(oldOf(r.i))!].filter((w) => own.has(w)));
      const after = new Set(r.by.flatMap((k) => [...seen.now.get(nowOf(k))!]));
      const lost = [...before].filter((w) => !after.has(w));
      if (!before.size)
        add(
          "unresolved",
          named(retired),
          `${r.why}; it detects none of the ${own.size} witnesses made of the code it reaches, so nothing shows what it protected kept`,
        );
      else if (lost.length)
        add(
          "reduced",
          named(retired),
          `${r.why}; what now ${saying(r.o)} no longer detects ${lost.map(where).join(", ")}, which it detected`,
          `${named(retired)}: ${r.why}, and no acceptance record excludes it, but what now ${saying(r.o)} no longer detects ${lost.map(where).join(", ")}, which it detected`,
        );
      else
        add(
          "preserved",
          named(retired),
          `${r.why}; every one of the ${before.size} witnesses it detected is detected by what now ${saying(r.o)}`,
        );
    }
  }
  return { changes, errors: [...new Set(errors)] };
}
