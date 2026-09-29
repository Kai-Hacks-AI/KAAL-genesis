import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import {
  type Case,
  caseFiles,
  linkErrors,
  PLAN,
  planCommitments,
  planEntries,
  repoCases,
  section,
  testArgs,
} from "./links.js";
import { ACCEPTANCE } from "./acceptance.js";
import { REQUIREMENTS } from "./feature.js";
import { REQUIREMENT } from "../skills/managing-requirements/scripts/requirements.js";
import { planDataError, planError, readPlan, suitePlans } from "./plans.js";
import { type Entry, entriesIn, entryAt, entryBytes, recordedModes } from "./state.js";

/**
 * KAAL's trusted regression: the accepted regression, a state of KAAL's
 * files, judges a candidate, another state. This holds the regression's own
 * machinery: its identity, whether it can be replayed faithfully, how its
 * cases are run and judged, and whether a candidate could judge the next one
 * once accepted. Both states are plain directories: which states they are,
 * and where they come from, is decided outside KAAL. How the next regression
 * is derived from the accepted one, what the candidate gives up and what it
 * newly promises, is scripts/next-regression.ts.
 */

/** The accepted regression a plan says it was derived from, by identity, if it says: the regression it succeeds. */
export function derivedFrom(plan: string): string | undefined {
  const text = section(plan, "How this regression differs from the one it was derived from");
  return /^Derived from: the accepted regression `([0-9a-f]{64})`/m.exec(text)?.[1];
}

/**
 * Why the accepted regression's `npm test` cannot be replayed faithfully, if it
 * cannot: trusted regression runs its case files with its own `tsx --test`, so
 * a script that is anything more, such as one that preloads a module, would be
 * judged under other conditions than its own run.
 */
export function unreplayable(repo: string): string | undefined {
  const scripts = (JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as { scripts?: object })
    .scripts;
  // Every script npm ci or npm test would run besides the test itself; the replay runs none of them.
  // Each of those events runs its pre and post script too, so the whole family is refused, not each name.
  const lifecycle = [
    "prepublish",
    ...["install", "prepare", "dependencies", "test"].flatMap((event) => [`pre${event}`, event, `post${event}`]),
  ].filter((hook) => hook !== "test");
  const hooks = lifecycle.filter((hook) => scripts && hook in scripts);
  if (hooks.length)
    return `the accepted regression's npm ci or npm test runs ${hooks.join(", ")}, which its cases' replay would not`;
  const [runner, flag, ...rest] = testArgs(repo);
  // Only plain paths and globs: anything a shell could expand ($, `, ~, braces) might name other files on another platform.
  const extra = rest.filter((arg) => !/^[\w.*][\w./*-]*\.test\.ts$/.test(arg));
  if (runner !== "tsx" || flag !== "--test" || extra.length)
    return `the accepted regression's npm test is not "tsx --test" with case files only ("${testArgs(repo).join(" ")}"), so its cases cannot be run as it runs them`;
  // Inside the checkout, by any name it is checked out under: no . or .. segment.
  const outside = rest.filter((arg) => arg.split("/").some((segment) => segment === "." || segment === ".."));
  if (outside.length)
    return `the accepted regression's npm test names case files outside its checkout (${outside.join(", ")})`;
  // A path or glob that names nothing would be dropped without a trace.
  const empty = rest.filter((arg) => !fs.globSync(arg, { cwd: repo }).length);
  if (empty.length)
    return `the accepted regression's npm test names case files that do not exist (${empty.join(", ")})`;
  // What judges must be in the state's files: an install from local packages, a link out of the state, or checker code
  // imported from outside it, is not.
  const unpinned = unpinnedPackages(repo);
  if (unpinned.length)
    return `the accepted regression's install takes packages other than from the registry as its lockfile pins them (${unpinned.join(", ")}), which its identity does not cover`;
  const escaping = outsideLinks(repo);
  if (escaping.length) return `the accepted regression's inputs link outside its state (${escaping.join(", ")})`;
  // The checker is found from where it starts, so it must start where the command line that runs it says.
  const command = checkCommand(repo);
  if (command !== undefined && command !== CHECK_COMMAND)
    return `the accepted regression's checker is run as "${command}", not "${CHECK_COMMAND}", so its code could not be found`;
  const configured = typescriptConfig(repo).outside;
  if (configured)
    return `the accepted regression's TypeScript configuration extends one outside its state (${configured})`;
  // The replay copies its inputs by name, and a name that is not UTF-8 has none it could be copied by.
  // Nor has a link whose target is not UTF-8 a target that could be followed by name.
  const unnamed = [...regressionInputs(repo)]
    .filter(([file, entry]) => file.includes("\0") || (entry.kind === "link" && !utf8(entry.content)))
    .map(([file]) => file);
  if (unnamed.length)
    return `the accepted regression's inputs have names or link targets that are not UTF-8 (${unnamed.map((f) => f.split("\0")[0]).join(", ")})`;
  // The replay copies each case file and item of test data from the accepted state, and nothing else, so a
  // link among them must lead within the item it is in: anything else would be the candidate's.
  const items = [...caseFiles(repo), ...dataOf(repo).map(([rel]) => rel)];
  const uncopied = [...regressionInputs(repo)].flatMap(([file, entry]) => {
    const item = items.find((i) => file === i || file.startsWith(`${i}/`));
    if (!item || entry.kind !== "link") return [];
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), entry.content.toString("utf8")));
    return target === item || target.startsWith(`${item}/`) ? [] : [file];
  });
  if (uncopied.length)
    return `the accepted regression's cases or test data link to what its replay does not copy (${uncopied.join(", ")})`;
  // The replay copies the plan too, as it is: a plan that is a link, or is reached through one, would lead to the candidate's.
  const planParts = PLAN.split("/");
  if (planParts.some((_, i) => entryAt(path.join(repo, ...planParts.slice(0, i + 1)))?.kind === "link"))
    return `the accepted regression's plan is a link, so its replay would read the candidate's (${PLAN})`;
  // The checker's imports are followed from where its files are named; one reached through a link runs from elsewhere.
  const linked = [
    ...new Set([...CHECKER.filter((file) => fs.existsSync(path.join(repo, file))), ...checkerCode(repo).found]),
  ].filter((file) =>
    file.split("/").some((_, i, parts) => entryAt(path.join(repo, ...parts.slice(0, i + 1)))?.kind === "link"),
  );
  if (linked.length) return `the accepted regression's checker code is reached through a link (${linked.join(", ")})`;
  // A relative import that names no file the state holds could only be satisfied by something the identity does not see.
  const unresolved = checkerCode(repo).unresolved;
  if (unresolved.length)
    return `the accepted regression's checker imports code it does not hold (${unresolved.join(", ")})`;
  const imported = checkerCode(repo).escaping;
  if (imported.length)
    return `the accepted regression's checker imports code outside its state (${imported.join(", ")})`;
  return undefined;
}

/**
 * What fixes how a regression judges: everything that decides what its
 * install puts in place, which selects its runner and packages, and the
 * checker's own code, found from its entry points by following their
 * relative imports. Code the checker loads any other way is not found here.
 */
export function judgeFiles(repo: string): string[] {
  // Everything that decides what the install puts in place: the manifest, either lockfile, and npm's own settings.
  return [
    "package.json",
    "package-lock.json",
    "npm-shrinkwrap.json",
    ".npmrc",
    // How the checker and the cases are compiled.
    ...typescriptConfig(repo).files,
    ...checkerCode(repo).found,
  ];
}

/** Where the checker starts: the command line `regression:check` runs, and the reporter it hands the test runner. */
export const CHECKER = ["scripts/check-regression.ts", "scripts/regression-reporter.ts"];
/** The one command line a state may run its checker by, so the checker is always found where it starts. */
const CHECK_COMMAND = `tsx ${CHECKER[0]}`;

/** The command line a state runs its checker by, if it names one. */
function checkCommand(repo: string): string | undefined {
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  return manifest.scripts?.["regression:check"];
}

/**
 * How TypeScript is compiled for the checker and the cases: a state's
 * `tsconfig.json` and every local configuration it extends, in order, or the
 * first `extends` that leads out of the state, which the identity cannot see.
 */
function typescriptConfig(repo: string): { files: string[]; outside?: string } {
  const files: string[] = [];
  let at = "tsconfig.json";
  while (fs.existsSync(path.join(repo, at)) && !files.includes(at)) {
    files.push(at);
    const base = /"extends"\s*:\s*"(\.{1,2}\/[^"]+)"/.exec(fs.readFileSync(path.join(repo, at), "utf8"))?.[1];
    if (!base) break;
    const next = path.posix.normalize(path.posix.join(path.posix.dirname(at), base));
    if (next === ".." || next.startsWith("../")) return { files, outside: `${at}: ${base}` };
    at = fs.existsSync(path.join(repo, next)) || next.endsWith(".json") ? next : `${next}.json`;
  }
  return { files };
}

type BuildError = { text: string; location?: { file: string } | null };

/**
 * The checker's own code: every file the checker loads from its entry points,
 * as esbuild, which tsx runs on, resolves their imports (comments, extensions
 * and all), and every file one of them names by a relative URL built from
 * its own module URL. Also every import, as `file: specifier`, that leads out of the
 * state, and every one that names nothing the state holds: code either way
 * would run as part of the checker, but is no part of the state it judges with.
 */
function checkerCode(repo: string): { found: string[]; escaping: string[]; unresolved: string[] } {
  const found = new Set<string>();
  const escaping: string[] = [];
  const unresolved: string[] = [];
  const leaves = (from: string, specifier: string) => {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    return target === ".." || target.startsWith("../");
  };
  let entries = CHECKER.filter((file) => fs.existsSync(path.join(repo, file)));
  while (entries.length) {
    let inputs: Record<string, { imports: { path: string; original?: string }[] }>;
    try {
      inputs = buildSync({
        entryPoints: entries,
        absWorkingDir: path.resolve(repo),
        bundle: true,
        write: false,
        outdir: "checker",
        metafile: true,
        platform: "node",
        format: "esm",
        packages: "external",
        preserveSymlinks: true,
        treeShaking: false,
        logLevel: "silent",
      }).metafile.inputs;
    } catch (error) {
      for (const { text, location } of (error as { errors?: BuildError[] }).errors ?? [{ text: String(error) }]) {
        const specifier = /Could not resolve "([^"]+)"/.exec(text)?.[1];
        const from = location?.file ?? "?";
        if (specifier && leaves(from, specifier)) escaping.push(`${from}: ${specifier}`);
        else unresolved.push(specifier ? `${from}: ${specifier}` : `${from}: ${text}`);
      }
      break;
    }
    for (const [input, { imports }] of Object.entries(inputs)) {
      if (input.startsWith("../") || path.isAbsolute(input)) continue;
      found.add(input);
      for (const { path: to, original } of imports)
        if (original && (to.startsWith("../") || path.isAbsolute(to))) escaping.push(`${input}: ${original}`);
    }
    // A file the checker hands on by URL, as it hands the reporter to the test runner, is its code too.
    entries = [...found].flatMap((file) =>
      [...fs.readFileSync(path.join(repo, file), "utf8").matchAll(/new URL\(\s*["'](\.{1,2}\/[^"']+)["']/g)].flatMap(
        ([, specifier]) => {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier!));
          if (leaves(file, specifier!)) return (escaping.push(`${file}: ${specifier}`), []);
          if (!fs.existsSync(path.join(repo, target))) return (unresolved.push(`${file}: ${specifier}`), []);
          return found.has(target) ? [] : [target];
        },
      ),
    );
  }
  return { found: [...found].sort(), escaping: [...new Set(escaping)], unresolved: [...new Set(unresolved)] };
}

/**
 * The identity of the regression a state of KAAL's files holds, from its own
 * content: its plan, the places its commitments are stated, the suites that serve its plan, every Requirement and acceptance record it holds, its case files,
 * its test data, and what fixes how it judges (everything that decides what
 * its install puts in place, and the checker's code, found through its
 * relative imports), entry by entry: each directory as one, each regular file
 * by its bytes and whether it may be executed, each link by its target and
 * what it points at inside the state, anything else by its kind. Every entry is taken
 * byte for byte, as the replay copies it, so a checkout that rewrites line
 * endings has another identity. Any change to what the regression consists of
 * changes it; nothing outside the files, such as where they are kept or how
 * they are versioned, does. A candidate names the regression it derives from
 * by this identity. The identity does not protect the judgement: what does is
 * that the checker judging is always the accepted state's own.
 */
export function regressionIdentity(repo: string): string {
  const hash = createHash("sha256");
  // Every path and entry framed by its length in bytes, so no two different sets of entries hash alike.
  for (const [file, entry] of [...regressionInputs(repo)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const name = Buffer.from(file, "utf8");
    const bytes = entryBytes(entry);
    hash.update(`${name.length}:`).update(name).update(`${bytes.length}:`).update(bytes);
  }
  return hash.digest("hex");
}

/** Whether `bytes` are UTF-8, read back exactly as they are. */
const utf8 = (bytes: Buffer) => Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes);

/** Every entry a regression consists of, by posix path: what its identity is taken from. */
function regressionInputs(repo: string): Map<string, Entry> {
  const root = path.resolve(repo);
  const entries = new Map<string, Entry>();
  // Each entry is read at its path as bytes, so a name that is not UTF-8 is read, and known, as it is.
  const add = (rel: string, at: string | Buffer = path.join(repo, rel)) => {
    // An entry reached through a link above it is read through that link, so the link is part of it too.
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) {
      const above = parts.slice(0, i).join("/");
      if (entryAt(path.join(repo, above))?.kind === "link") add(above);
    }
    const entry = entryAt(at);
    if (!entry || entries.has(rel)) return;
    entries.set(rel, entry);
    if (entry.kind === "directory") for (const { name, at: below } of entriesIn(at)) add(`${rel}/${name}`, below);
    // What a link inside the state points at is read through it, so it is part of the regression too.
    if (entry.kind === "link") {
      const target = path.relative(
        root,
        path.resolve(path.dirname(path.join(root, rel)), entry.content.toString("utf8")),
      );
      const up = target === ".." || target.startsWith(`..${path.sep}`);
      if (target && !up && !path.isAbsolute(target)) add(target.split(path.sep).join("/"));
    }
  };
  if (fs.existsSync(path.join(repo, PLAN))) {
    add(PLAN);
    const plan = fs.readFileSync(path.join(repo, PLAN), "utf8");
    for (const place of planCommitments(plan))
      for (const file of fs.globSync(place, { cwd: repo })) add(file.split(path.sep).join("/"));
  }
  // Which suites serve the plan, and so what it requires, is said by the suites, not the plan: each that serves it is
  // part of it too, and a suite serving no Regression Plan is none of its.
  for (const { suite, serves } of suitePlans(repo)) if (serves.includes(PLAN)) add(suite);
  // Every Requirement it records, named by the plan or not: what it already states decides what a candidate newly
  // promises. And every acceptance record it holds: which of a candidate's records are new, and so give anything up,
  // is read against them. Only what is read as a record is theirs: guidance beside the records, such as AGENTS.md, is
  // none of the regression's.
  const listed = (dir: string) =>
    (fs.lstatSync(path.join(repo, dir), { throwIfNoEntry: false })?.isDirectory()
      ? fs.readdirSync(path.join(repo, dir), { withFileTypes: true })
      : []
    ).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of listed(REQUIREMENTS))
    if (entry.isDirectory()) add(`${REQUIREMENTS}/${entry.name}/${REQUIREMENT}`);
  for (const entry of listed(ACCEPTANCE)) if (entry.name !== "AGENTS.md") add(`${ACCEPTANCE}/${entry.name}`);
  for (const file of caseFiles(repo)) add(file);
  for (const [file, at] of dataOf(repo)) add(file, at);
  // How it judges is part of the regression too: what its install puts in place, and the checker's own code.
  for (const file of judgeFiles(repo)) add(file);
  return entries;
}

/**
 * The links among a regression's inputs that point outside its state: the
 * replay keeps them, so what they point at could change how it judges while
 * nothing in the state, and so nothing in its identity, changes. Whether a
 * link stays inside is read from its target alone, never from where the state
 * is kept now: an absolute target, or one that climbs above the state's top
 * even to come back into it by the name its directory has today, points
 * elsewhere once the state is kept under another name.
 */
function outsideLinks(repo: string): string[] {
  return [...regressionInputs(repo)].flatMap(([file, entry]) => {
    if (entry.kind !== "link") return [];
    const target = entry.content.toString("utf8");
    if (path.posix.isAbsolute(target) || path.win32.isAbsolute(target)) return [file];
    let depth = file.split("/").length - 1;
    for (const segment of target.split(/[\\/]/)) {
      if (segment === "..") depth--;
      else if (segment && segment !== ".") depth++;
      if (depth < 0) return [file];
    }
    return [];
  });
}

/**
 * The packages a repository's install would not take, as its lockfile pins
 * them, from the registry: anything named by a local spec in its manifest, a
 * workspace, or any lockfile entry that is a link or lacks a registry source
 * and integrity, or all of them when there is no lockfile at all. Only the
 * allowed form passes, so what the install puts in place is fixed by files
 * the identity covers.
 */
function unpinnedPackages(repo: string): string[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as Record<string, unknown>;
  const local = /^(file:|link:|workspace:|portal:|\.{0,2}\/)/;
  const named = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].flatMap((field) =>
    Object.entries((manifest[field] as Record<string, string> | undefined) ?? {}).flatMap(([name, spec]) =>
      local.test(spec) ? [name] : [],
    ),
  );
  // npm ci installs from npm-shrinkwrap.json when there is one, from package-lock.json otherwise.
  const lockfile = ["npm-shrinkwrap.json", "package-lock.json"].find((f) => fs.existsSync(path.join(repo, f)));
  const locked: string[] = [];
  // Without one, nothing in the state pins what the install puts in place.
  if (!lockfile) locked.push("no lockfile");
  if (lockfile) {
    const lock = JSON.parse(fs.readFileSync(path.join(repo, lockfile), "utf8")) as {
      packages?: Record<string, { link?: boolean; resolved?: string; integrity?: string }>;
    };
    if (!lock.packages) locked.push(`${lockfile} without package entries`);
    for (const [at, entry] of Object.entries(lock.packages ?? {}))
      if (at && (entry.link || !/^https:\/\//.test(entry.resolved ?? "") || !entry.integrity)) locked.push(at);
  }
  return [...(manifest.workspaces ? ["workspaces"] : []), ...named, ...locked];
}

export type Result = { file: string; name: string; outcome: "pass" | "fail" | "skip" };
/**
 * A result with where the runner reported it, a case where it is declared and a file that did not run as a whole
 * at 1:1, and for a failure, how the runner says it failed.
 */
export type Positioned = Result & { line?: number; column?: number; failureType?: string };

/**
 * Judges the trusted cases' results against the candidate. A case that did not
 * pass (it failed, was skipped, never reported, or its file did not run as a
 * whole) is held, whatever it points at: only an acceptance record gives one
 * up, by keeping it from the cases judged. A result no expected case accounts
 * for, such as a case whose title could not be read, points at nothing: it is
 * held too.
 */
export function judge(cases: Case[], results: Result[]): string[] {
  // A file that does not run as a whole reports one result, named by the path it was run as.
  const isFile = (r: Result) => r.name.split("\\").join("/") === r.file;
  const broken = new Set(results.filter(isFile).map((r) => r.file));
  // Results are matched to cases one to one, in order, so two cases with the same title need two results.
  const left = [...results];
  const take = (c: Case) => {
    const i = left.findIndex((r) => r.file === c.file && r.name === c.title);
    return i < 0 ? undefined : left.splice(i, 1)[0];
  };
  const expected = cases.flatMap((c) => {
    const result = take(c);
    const outcome = broken.has(c.file) ? "did not run as a whole" : !result ? "not run" : result.outcome;
    if (outcome === "pass") return [];
    return [`${c.file}: "${c.title}" ${outcome === "fail" ? "failed" : outcome === "skip" ? "was skipped" : outcome}`];
  });
  const unaccounted = left.flatMap((r) => {
    if (isFile(r)) return cases.some((c) => c.file === r.file) ? [] : [`${r.file}: did not run as a whole`];
    if (r.outcome === "pass") return [];
    return [`${r.file}: "${r.name}" ${r.outcome === "fail" ? "failed" : "was skipped"}, and points at nothing`];
  });
  return [...expected, ...unaccounted];
}

/**
 * Whether the runner can be told to pass over a case by its title: not when it
 * is titled with nothing at all, which the runner runs under another name, and
 * reads a pattern matching nothing as matching every case of its file.
 */
export const skippable = (title: string): boolean => title !== "";

/** The most the runner's command line may spend naming the cases it passes over: well within what every platform carries. */
export const SKIP_LIMIT = 8192;

/**
 * The runner's arguments passing over each case titled as `skip` says, and
 * no other: each title whole, as the runner reads it.
 */
export function skipArguments(skip: string[]): string[] {
  // Every character but printable ASCII is written as the escape of each UTF-16 unit, as the runner reads the title:
  // a command line can carry no NUL, and would carry half a surrogate pair as something else. The title ends where the
  // pattern does, and not before a line break closing it, as $ would allow. The runner also tries each pattern on a
  // title with the space around it trimmed, so a case whose title differs only by that is skipped too: acceptance
  // excludes such cases together or not at all.
  return skip.map(
    (title) =>
      `--test-skip-pattern=^${title
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)}(?![\\s\\S])`,
  );
}

const TSX = fileURLToPath(import.meta.resolve("tsx/cli"));
// A URL, not a path: a Windows path such as D:\\… would be read as a URL with the scheme "d:".
const REPORTER = new URL("./regression-reporter.ts", import.meta.url).href;

/**
 * Whether `file`, a posix path, is test data, which travels with the cases: a
 * test-data directory or loader, or any file but code where cases are kept
 * (under `scripts/` or `skills/<skill>/scripts/`), such as a fixture beside them.
 */
export function isData(file: string, directory: boolean): boolean {
  const parts = file.split("/");
  if (parts.includes("test-data") || parts.at(-1) === "test-data.ts") return true;
  const inCases = parts[0] === "scripts" || (parts[0] === "skills" && parts[2] === "scripts");
  return !directory && inCases && !/\.(ts|js|mjs|cjs|mts|cts)$/.test(file);
}

/** Where the regression's identity never looks: a repository's dependencies and Git's own files. */
const UNLOOKED = ["node_modules", ".git"];

/** Whether a directory, by its path from the repository's root, is test data the regression's identity finds. */
export function keptAsData(directory: string): boolean {
  const parts = directory.split("/");
  return !UNLOOKED.includes(parts[0]!) && isData(directory, true);
}

/** The test data and test-data loaders of a repository, outside its dependencies and Git's own files. */
function dataOf(repo: string | Buffer, dir = ""): [string, Buffer][] {
  return entriesIn(repo).flatMap(({ name, at }): [string, Buffer][] => {
    const rel = dir ? `${dir}/${name}` : name;
    if (UNLOOKED.includes(rel)) return [];
    const directory = fs.lstatSync(at).isDirectory();
    if (isData(rel, directory)) return [[rel, at]];
    return directory ? dataOf(at, rel) : [];
  });
}

/**
 * A copy of `state` to run its own cases in, with its test data and sharing
 * its dependencies, so nothing its cases write, beside them or anywhere under
 * the state, reaches the state they are judging.
 */
export function snapshot(state: string): string {
  return scratchCopy(state, true);
}

/** A scratch copy of a checkout to run cases in, sharing its dependencies, with only the permissions its identity records; without its test data unless `data`. */
function scratchCopy(repo: string, data: boolean): string {
  const code = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kaal-regression-")), "repo");
  fs.cpSync(repo, code, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => {
      const rel = path.relative(repo, src).split(path.sep).join("/");
      return rel !== ".git" && rel !== "node_modules" && (data || !isData(rel, fs.lstatSync(src).isDirectory()));
    },
  });
  recordedModes(code);
  if (fs.existsSync(path.join(repo, "node_modules")))
    // Absolute: a relative target would resolve against the copy, not the checkout.
    fs.symlinkSync(path.resolve(repo, "node_modules"), path.join(code, "node_modules"), "junction");
  return code;
}

/** The environment variables through which a run hands its cases the tested state, and says which testing state it is handed to. */
/** How a run hands the cases it reaches the test data their plan provides: a directory, by its absolute path. */
export const PLAN_DATA = "KAAL_PLAN_DATA";
export const TESTED_STATE = "KAAL_TESTED_STATE";
export const TESTING_STATE = "KAAL_TESTING_STATE";

/**
 * Runs `files`, cases kept in `code`, with the trusted test runner and
 * reporter, never the checkout's own, handing them `tested` as the state they
 * test: a case asks the run for its subject rather than taking the state it
 * happens to be kept or run in. What the runner reports is written outside
 * both states. With no files, nothing is run. A runner that does not
 * complete is refused, never read as having nothing more to report.
 */
export function execute(
  code: string,
  files: string[],
  tested: string,
  positions?: false,
  handed?: Record<string, string>,
  skip?: string[],
  timeout?: number,
): Result[];
export function execute(
  code: string,
  files: string[],
  tested: string,
  positions: true,
  handed?: Record<string, string>,
  skip?: string[],
  timeout?: number,
): Positioned[];
export function execute(
  code: string,
  files: string[],
  tested: string,
  positions = false,
  handed: Record<string, string> = {},
  skip: string[] = [],
  timeout?: number,
): Positioned[] {
  // With no files to run, the test runner would look for cases of its own, which no state named: run nothing.
  if (!files.length) return [];
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kaal-run-")), "results.jsonl");
  fs.writeFileSync(out, "");
  // A case to skip is named by its whole title, so no other case whose title only contains it is skipped with it. An
  // empty title names no case: the runner runs such a case under another name, and reads a pattern matching nothing as
  // matching every case of the file.
  if (!skip.every(skippable)) throw new Error("a case titled with nothing at all cannot be skipped by its title");
  const skipping = skipArguments(skip);
  const run = spawnSync(process.execPath, [TSX, "--test", `--test-reporter=${REPORTER}`, ...skipping, ...files], {
    cwd: code,
    // A run started from within another test run would report to that run instead.
    // No npm_* variable either: they describe whichever package's script started this run, not the one
    // replayed. No NODE_OPTIONS: it could preload anything into the cases.
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith("npm_"))),
      NODE_TEST_CONTEXT: undefined,
      NODE_OPTIONS: undefined,
      KAAL_REGRESSION_RESULTS: out,
      // What else the run hands its cases, such as the test data a plan provides, and nothing a run it was started
      // from handed its own.
      [PLAN_DATA]: undefined,
      ...handed,
      [TESTING_STATE]: path.resolve(code),
      [TESTED_STATE]: path.resolve(tested),
    },
    stdio: "ignore",
    // A run that must end, such as one against code made to do something else, which may never finish, is stopped.
    ...(timeout === undefined ? {} : { timeout, killSignal: "SIGKILL" as const }),
  });
  const lines = fs.readFileSync(out, "utf8").split("\n").filter(Boolean);
  // What the runner reported is read: the directory made to hold it is not kept.
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
  // A runner that could not start, was stopped, or did not report to its end has not said what every case did.
  if (run.error || run.signal || lines.at(-1) !== JSON.stringify({ end: true }))
    throw new Error(
      `the test runner did not complete: ${run.error?.message ?? (run.signal ? `stopped by ${run.signal}` : "its report has no end")}`,
    );
  // The runner reports where each file really is, so reports are read against where the cases really are.
  const root = fs.realpathSync(code);
  return lines.slice(0, -1).map((line) => {
    const { file, name, outcome, line: at, column, failureType } = JSON.parse(line) as Positioned;
    const result = { file: path.relative(root, file).split(path.sep).join("/"), name, outcome };
    return positions ? { ...result, line: at, column, failureType } : result;
  });
}

/**
 * Runs the trusted cases, with the trusted test data and the trusted plan,
 * against a copy of the candidate's code, using the trusted test runner and
 * reporter, never the candidate's, and hands them the candidate itself as the
 * state they test. Returns what each case did. The plan is
 * the accepted regression's own, as its identity says, so a case that reads
 * it reads what its links were written against, not a plan that has since
 * replaced or withdrawn what they point at. Given `only`, only the case files
 * it keeps are run, as when every case of the others has been given up; given
 * `skip`, each file it names cases of is run on its own, without those cases,
 * so a case given up never runs beside the cases kept.
 */
export function runTrusted(
  trusted: string,
  candidate: string,
  only?: (file: string) => boolean,
  skip?: (file: string) => string[],
  timeout?: number,
): Result[] {
  const code = scratchCopy(candidate, false);
  // The copies the cases run in and are handed are the run's own: none is kept once it has reported.
  let tested: string | undefined;
  try {
    const files = caseFiles(trusted).filter((file) => !only || only(file));
    // Only the accepted regression's cases are replayed, so none of the candidate's own is left for a case that reads
    // the cases, such as the check of the regression's links, to find and judge against the accepted plan.
    // A path that climbs out of the copy names none of its files, so nothing is removed for it.
    for (const rel of [...caseFiles(candidate), PLAN].filter((rel) => inside(code, rel)))
      fs.rmSync(within(code, rel), { force: true });
    const plan = fs.existsSync(path.join(trusted, PLAN)) ? [PLAN] : [];
    if (plan.length) {
      // What a place of the accepted plan reaches by a wildcard, it knew by that place: anything there the accepted
      // state does not have is the candidate's addition, which its own cases prove, so the accepted cases do not see it.
      for (const place of planCommitments(fs.readFileSync(path.join(trusted, PLAN), "utf8")).filter((p) =>
        p.includes("*"),
      )) {
        const depth = place.split("/").reduce((last, part, i) => (part.includes("*") ? i + 1 : last), 0);
        for (const match of fs.globSync(place, { cwd: code }).map((m) => m.split(path.sep).join("/"))) {
          if (fs.existsSync(path.join(trusted, match))) continue;
          // A match the accepted state lacks: all of it that is new, the wildcard's directory if that is new too.
          const top = match.split("/").slice(0, depth).join("/");
          const at = fs.existsSync(path.join(trusted, top)) ? match : top;
          if (inside(code, at)) fs.rmSync(within(code, at), { recursive: true, force: true });
        }
      }
    }
    // Which cases the regression has is the accepted regression's own selection, not the candidate's.
    // The manifest is written afresh, never through a link the candidate may have made of it.
    const manifest = within(code, "package.json");
    const test = (
      JSON.parse(fs.readFileSync(path.join(trusted, "package.json"), "utf8")) as { scripts?: { test?: string } }
    ).scripts?.test;
    const own = (
      fs.statSync(manifest, { throwIfNoEntry: false })?.isFile() ? JSON.parse(fs.readFileSync(manifest, "utf8")) : {}
    ) as { scripts?: Record<string, string> };
    fs.rmSync(manifest, { recursive: true, force: true });
    fs.writeFileSync(manifest, `${JSON.stringify({ ...own, scripts: { ...own.scripts, test } }, null, 2)}\n`);
    for (const rel of [...files, ...plan, ...dataOf(trusted).map(([rel]) => rel)]) {
      const to = within(code, rel);
      fs.rmSync(to, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.cpSync(path.join(trusted, rel), to, { recursive: true, verbatimSymlinks: true });
      // Only the permissions the identity records reach the cases: whatever else the copy kept, they cannot see.
      recordedModes(to);
    }
    // The state the accepted cases judge is the candidate itself, as it is, not the copy they are run in, which
    // holds the accepted regression's cases, data and plan beside the candidate's code. It is handed as the replay
    // gives any state to cases: its files, with only the permissions its identity records, without Git's, in a copy of
    // its own, so no case sees more of it than the regression judges, or writes into it.
    const handedState = scratchCopy(candidate, true);
    tested = handedState;
    const handed = plannedData(trusted, code);
    // A title is skipped in every file a run executes, so each file with cases to skip is run on its own, where its
    // titles, each unique there, name only its own cases.
    const alone = skip ? files.filter((file) => skip(file).length) : [];
    return [
      ...execute(
        code,
        files.filter((file) => !alone.includes(file)),
        handedState,
        false,
        handed,
        [],
        timeout,
      ),
      ...alone.flatMap((file) => execute(code, [file], handedState, false, handed, skip!(file), timeout)),
    ];
  } finally {
    for (const copy of [code, tested]) if (copy) fs.rmSync(path.dirname(copy), { recursive: true, force: true });
  }
}

/**
 * What a run of `repo`'s regression hands its cases in `code`, a copy of it
 * with its test data: the directory the Regression Plan provides as data, in
 * that copy, where the plan provides one, as a run of the plan hands it. Data
 * no run could hand, a plan's links check refuses, so its cases are handed
 * none, and the regression says what is wrong rather than failing to run.
 */
function plannedData(repo: string, code: string): Record<string, string> {
  if (!fs.existsSync(path.join(repo, PLAN)) || planError(repo, PLAN)) return {};
  let data: string | undefined;
  try {
    data = readPlan(repo, PLAN).data;
  } catch {
    return {};
  }
  if (data === undefined || planDataError(repo, PLAN, data) || !keptAsData(data.replace(/\/+$/, ""))) return {};
  return { [PLAN_DATA]: path.resolve(within(code, data.replace(/\/+$/, ""))) };
}

/** Whether `rel`, read as a path, stays inside `code` rather than climbing out of it. */
function inside(code: string, rel: string): boolean {
  const at = path.relative(path.resolve(code), path.resolve(code, rel));
  return !!at && at !== ".." && !at.startsWith(`..${path.sep}`) && !path.isAbsolute(at);
}

/**
 * `rel` inside the scratch copy `code`, with every directory above it inside
 * the copy too: one the candidate kept as a link leading out of the copy is
 * made a real directory, so writing at `rel` can never write anywhere else.
 */
function within(code: string, rel: string): string {
  if (!inside(code, rel)) throw new Error(`${rel}: climbs out of the replay's copy`);
  const root = fs.realpathSync(code);
  const parts = rel.split("/");
  for (let i = 1; i < parts.length; i++) {
    const at = path.join(code, ...parts.slice(0, i));
    const stat = fs.lstatSync(at, { throwIfNoEntry: false });
    // Anything but a directory in the way, such as a file the candidate put there, is made one.
    if (stat && !stat.isDirectory() && !stat.isSymbolicLink()) {
      fs.rmSync(at, { force: true });
      fs.mkdirSync(at);
      continue;
    }
    if (!stat?.isSymbolicLink()) continue;
    let real: string | undefined;
    try {
      real = fs.realpathSync(at);
    } catch {
      real = undefined; // A link to nothing leads nowhere inside the copy.
    }
    if (real && (real === root || real.startsWith(root + path.sep))) continue;
    fs.unlinkSync(at);
    fs.mkdirSync(at);
  }
  return path.join(code, ...parts);
}

/**
 * The candidate's own cases, run by the trusted runner and reporter. They
 * prove what the candidate replaces, and they show which cases it really
 * runs, so the next accepted regression can name every one of them. Only
 * `files` of them, where given.
 */
export function runCandidate(candidate: string, files = caseFiles(candidate)): Result[] {
  if (!files.length) return [];
  const code = scratchCopy(candidate, true);
  return execute(code, files, code, false, plannedData(candidate, code));
}

/**
 * The cases a candidate's source names, checked against what its run did, one
 * to one: a named case that did not run (such as one inside a comment), or a
 * case that ran without being named (such as one registered through `it` or
 * built in a loop), would leave the next accepted regression unable to tell when it goes missing.
 */
export function unmatchedCases(cases: Case[], results: Result[]): string[] {
  const left = [...results];
  const ghosts = cases.flatMap((c) => {
    const i = left.findIndex((r) => r.file === c.file && r.name === c.title);
    if (i >= 0) {
      left.splice(i, 1);
      return [];
    }
    return [`${c.file}: "${c.title}" is named but does not run`];
  });
  const unnamed = left.map((r) =>
    r.name.split("\\").join("/") === r.file
      ? `${r.file}: does not run as a whole`
      : `${r.file}: "${r.name}" runs but is not named`,
  );
  return [...ghosts, ...unnamed];
}

/**
 * The cases `state` has, as a regression knows them: those its source names,
 * each shown by the state's own run, by the trusted runner and reporter, to be
 * one test run under that name, one to one. With that run's results and, where
 * what it names and what it runs disagree, each disagreement. A regression KAAL
 * accepts has none, so the cases of an accepted state are exactly those it
 * names, and a case's address says which test it is.
 */
export function caseInventory(state: string): { cases: Case[]; results: Result[]; errors: string[] } {
  const cases = repoCases(state);
  const results = runCandidate(state);
  return { cases, results, errors: unmatchedCases(cases, results) };
}

/**
 * Why `candidate` could not judge the next candidate once accepted, if it
 * could not: it becomes the regression that judges every later candidate, so
 * it must be one that can be replayed, name every case it runs, hold its own
 * checker, run as it is run, keep links that hold from its files, and have
 * each of its cases pass under this runner, whatever its own npm test did.
 * With its case inventory, the run that showed it.
 */
export function successorErrors(candidate: string): {
  errors: string[];
  inventory: ReturnType<typeof caseInventory>;
} {
  const errors = [
    ...[unreplayable(candidate)]
      .filter((e) => e !== undefined)
      .map((e) => `as the next accepted regression, ${e.slice("the accepted regression's ".length)}`),
    ...(repoCases(candidate).length
      ? []
      : ["as the next accepted regression, its npm test would run no case it can name"]),
    // Once accepted, its own checker judges every later candidate, so it must hold one, run as it is run.
    ...(fs.existsSync(path.join(candidate, CHECKER[0])) && checkCommand(candidate) === CHECK_COMMAND
      ? []
      : [
          `as the next accepted regression, it has no checker to judge the next candidate with: ${CHECKER[0]}, run by "regression:check": "${CHECK_COMMAND}"`,
        ]),
    // Its links are what choose which of its cases protect which commitment, so they must hold from its files.
    ...linkErrors(candidate).map((error) => `as the next accepted regression, ${error}`),
  ];
  const inventory = caseInventory(candidate);
  errors.push(
    ...inventory.errors.map((error) => `as the next accepted regression, ${error}`),
    // As the accepted regression, its cases are replayed by this runner, so each must pass under it, whatever its own npm test did.
    ...inventory.results
      .filter((r) => r.outcome !== "pass" && r.name.split("\\").join("/") !== r.file)
      .map(
        (r) =>
          `as the next accepted regression, ${r.file}: "${r.name}" ${r.outcome === "fail" ? "fails" : "is skipped"} when the accepted regression replays it`,
      ),
  );
  return { errors, inventory };
}

// The judgement composed from the derivation of the next regression, where the regression's own cases have always found it.
export { regressionErrors } from "./next-regression.js";
// The account a plan once gave of what it replaced and withdrew, which no checker reads, but cases the regression keeps do.
export { type Classification, classify, type Ledger, planLedger } from "./ledger.js";
