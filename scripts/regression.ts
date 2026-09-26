import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { learningOf, nodeFiles, parseNode, relativeIdentity } from "../skills/using-brain/scripts/brain.js";

/**
 * KAAL's trusted regression: `main`, the authoritative regression, judges a
 * candidate with `main`'s own cases, chosen by `main`'s own links and run
 * against the candidate's code, so a candidate cannot weaken, remove or
 * relabel one of `main`'s commitments by changing its own tests. How a
 * commitment is legitimately replaced or withdrawn is stated in
 * brain/learning/genesis/26/09/26/02/nodes/testing.md; this applies it.
 */

export const PLAN = "test/regression-plan.md";
export const BRAIN = "brain/learning";
/** Where each skill's cases are kept; they prove its SKILL.md, commitment 7's place. */
export const SKILL_CASES = "skills/*/SKILL.md";

/** The section of a plan under `heading`, up to the next `## ` heading. */
function section(plan: string, heading: string): string {
  const start = plan.indexOf(`\n## ${heading}`);
  if (start < 0) return "";
  const rest = plan.slice(start + 1);
  const end = rest.indexOf("\n## ", 1);
  return end < 0 ? rest : rest.slice(0, end);
}

/** The place each commitment of a plan is stated in, in the plan's order. */
export function planCommitments(plan: string): string[] {
  return [...section(plan, "Commitments").matchAll(/^\d+\. .*?[Ss]tated in (?:each )?`([^`]+)`/gm)].map((m) => m[1]!);
}

export type Ledger = { base?: string; replaces: [string, string][]; withdraws: [string, string][] };

/** What a plan says it was derived from, and what it replaces and withdraws, each with what supersedes it. */
export function planLedger(plan: string): Ledger {
  const text = section(plan, "How this regression differs from the one it was derived from");
  const pairs = (label: string): [string, string][] => {
    const line = new RegExp(`^- ${label}: (.*)$`, "m").exec(text)?.[1] ?? "";
    return [...line.matchAll(/`([^`]+)` by `([^`]+)`/g)].map((m) => [m[1]!, m[2]!]);
  };
  return {
    base: /^Derived from: `main` at `([0-9a-f]{40})`/m.exec(text)?.[1],
    replaces: pairs("Replaces"),
    withdraws: pairs("Withdraws"),
  };
}

export type Case = { file: string; title: string; places: string[] };

/**
 * The cases a test file states, each with the places of the commitments it
 * points at through `// Why:` lines directly above it. Only cases whose title
 * is a plain string literal are found.
 */
export function fileCases(file: string, source: string): Case[] {
  const cases: Case[] = [];
  const lines = source.split(/\r?\n/);
  const text = lines.join("\n");
  for (const m of text.matchAll(/^test\(\s*"((?:[^"\\]|\\.)*)"/gm)) {
    let title: string;
    try {
      title = JSON.parse(`"${m[1]}"`) as string;
    } catch {
      continue; // an escape JSON does not know: a title that cannot be read, like one built at run time
    }
    const places: string[] = [];
    let line = text.slice(0, m.index).split("\n").length - 2;
    for (; line >= 0; line--) {
      const why = /^\/\/ Why: (\S+)$/.exec(lines[line]!);
      if (!why) break;
      places.unshift(why[1]!);
    }
    cases.push({ file, title, places });
  }
  return cases;
}

/** The arguments of a repository's own `npm test` script, unquoted. */
function testArgs(repo: string): string[] {
  const script = (
    JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as { scripts?: { test?: string } }
  ).scripts?.test;
  return (script?.split(/\s+/) ?? []).filter(Boolean).map((arg) => arg.replace(/^(["'])(.*)\1$/, "$2"));
}

/**
 * Why main's `npm test` cannot be replayed faithfully, if it cannot: trusted
 * regression runs main's case files with its own `tsx --test`, so a script
 * that is anything more, such as one that preloads a module, would be judged
 * under other conditions than main's own run.
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
  if (hooks.length) return `main's npm ci or npm test runs ${hooks.join(", ")}, which its cases' replay would not`;
  const [runner, flag, ...rest] = testArgs(repo);
  // Only plain paths and globs: anything a shell could expand ($, `, ~, braces) might name other files on another platform.
  const extra = rest.filter((arg) => !/^[\w.*][\w./*-]*\.test\.ts$/.test(arg));
  if (runner !== "tsx" || flag !== "--test" || extra.length)
    return `main's npm test is not "tsx --test" with case files only ("${testArgs(repo).join(" ")}"), so its cases cannot be run as main runs them`;
  // Inside the checkout, by any name it is checked out under: no . or .. segment.
  const outside = rest.filter((arg) => arg.split("/").some((segment) => segment === "." || segment === ".."));
  if (outside.length) return `main's npm test names case files outside its checkout (${outside.join(", ")})`;
  // A path or glob that names nothing would be dropped without a trace.
  const empty = rest.filter((arg) => !fs.globSync(arg, { cwd: repo }).length);
  if (empty.length) return `main's npm test names case files that do not exist (${empty.join(", ")})`;
  return undefined;
}

/**
 * Every case a repository runs whose title cannot be read, so a later run
 * could not tell that it went missing: a case not at the top of its file, or
 * whose title is not a plain double-quoted string, as `file:line`.
 */
export function unnamedCases(repo: string): string[] {
  return caseFiles(repo).flatMap((file) => {
    const text = fs.readFileSync(path.join(repo, file), "utf8").replace(/\r\n/g, "\n");
    return [...text.matchAll(/^([ \t]*)test\(\s*/gm)].flatMap((m) => {
      const literal = /^"((?:[^"\\]|\\.)*)"/.exec(text.slice(m.index + m[0].length));
      let readable = !m[1] && !!literal;
      try {
        if (literal) JSON.parse(`"${literal[1]}"`);
      } catch {
        readable = false;
      }
      return readable ? [] : [`${file}:${text.slice(0, m.index).split("\n").length}`];
    });
  });
}

/**
 * The case files a repository's own `npm test` runs, by posix path relative to
 * it. KAAL names every case file `*.test.ts`, so only such arguments count:
 * anything else the script names, such as a module it preloads, is not a case.
 */
export function caseFiles(repo: string): string[] {
  const globs = testArgs(repo).filter((arg) => arg.endsWith(".test.ts"));
  return [...new Set(globs.flatMap((glob) => fs.globSync(glob, { cwd: repo })))]
    .map((file) => file.split(path.sep).join("/"))
    .sort();
}

/** Every case a repository keeps, with the commitments it helps prove: a skill's cases prove its SKILL.md. */
export function repoCases(repo: string): Case[] {
  return caseFiles(repo).flatMap((file) => {
    const cases = fileCases(file, fs.readFileSync(path.join(repo, file), "utf8"));
    return file.startsWith("skills/") ? cases.map((c) => ({ ...c, places: [SKILL_CASES] })) : cases;
  });
}

type Node = { place: string; name: string; lineage: string; key: string };

function brainNodes(repo: string): Node[] {
  const root = path.join(repo, BRAIN);
  return nodeFiles(root).map((file) => {
    const { lineage, key } = learningOf(root, file);
    return { place: `${BRAIN}/${relativeIdentity(root, file)}`, name: parseNode(file).name, lineage, key };
  });
}

export type Classification = {
  retained: string[];
  replaced: Map<string, string>;
  withdrawn: Map<string, string>;
  errors: string[];
};

/**
 * Classifies every commitment of the trusted regression against a candidate.
 * A commitment is retained while the candidate's plan still names its place.
 * Otherwise it must have been superseded in BRAIN: a later node with the same
 * name, in the same lineage, is what KAAL means now. If the candidate's plan
 * names that node, the commitment is replaced by it; if not, it is withdrawn
 * by it. A commitment stated outside BRAIN has no succession, so it can only
 * be retained. Anything else is a silent escape. Every place the candidate's
 * plan names, retained or added, must not be superseded already. The plan's own account of
 * what it replaces and withdraws is only checked against this, never trusted.
 */
export function classify(trusted: string, candidate: string, base: string): Classification {
  const errors: string[] = [];
  const planOf = (repo: string) =>
    fs.existsSync(path.join(repo, PLAN)) ? fs.readFileSync(path.join(repo, PLAN), "utf8") : undefined;
  const trustedPlan = planOf(trusted);
  const candidatePlan = planOf(candidate) ?? "";
  const kept = new Set(planCommitments(candidatePlan));
  const nodes = brainNodes(candidate);
  const current = (node: Node) =>
    nodes
      .filter((n) => n.name === node.name && n.lineage === node.lineage && n.key > node.key)
      .sort((a, b) => a.key.localeCompare(b.key))
      .at(-1);
  const retained: string[] = [];
  const replaced = new Map<string, string>();
  const withdrawn = new Map<string, string>();
  const candidateCases = repoCases(candidate);
  for (const place of trustedPlan ? planCommitments(trustedPlan) : []) {
    const node = nodes.find((n) => n.place === place);
    const successor = node && current(node);
    if (kept.has(place)) {
      retained.push(place);
    } else if (!successor) {
      errors.push(`${place}: silent escape: the plan no longer names it, and nothing in BRAIN supersedes it`);
    } else if (kept.has(successor.place)) {
      replaced.set(place, successor.place);
      if (!candidateCases.some((c) => c.places.includes(successor.place)))
        errors.push(`${place}: replaced by ${successor.place}, which no case of the candidate proves`);
    } else {
      withdrawn.set(place, successor.place);
    }
  }
  // Whatever the plan names, retained or new, must be what KAAL means now: the next main's
  // plan must not name a commitment BRAIN has already superseded.
  for (const place of kept) {
    // A place is where the commitment is stated, inside the repository, so it must exist there; a glob, such as
    // each skill's SKILL.md, must match.
    if (path.isAbsolute(place) || /\\|^[a-z]:/i.test(place) || place.split("/").some((s) => s === "." || s === ".."))
      errors.push(`${place}: the plan names it, but it is not a place inside the repository`);
    else if (!fs.globSync(place, { cwd: candidate }).length)
      errors.push(`${place}: the plan names it, but nothing is stated there`);
    const node = nodes.find((n) => n.place === place);
    const successor = node && current(node);
    if (successor) errors.push(`${place}: the plan names it, but ${successor.place} supersedes it`);
  }
  const ledger = planLedger(candidatePlan);
  if (ledger.base !== base) errors.push(`${PLAN}: derived from ${ledger.base ?? "nothing"}, not from main at ${base}`);
  const same = (said: [string, string][], found: Map<string, string>) =>
    JSON.stringify([...said].sort()) === JSON.stringify([...found].sort());
  if (!same(ledger.replaces, replaced))
    errors.push(
      `${PLAN}: says it replaces ${JSON.stringify(ledger.replaces)}, but BRAIN shows ${JSON.stringify([...replaced])}`,
    );
  if (!same(ledger.withdraws, withdrawn))
    errors.push(
      `${PLAN}: says it withdraws ${JSON.stringify(ledger.withdraws)}, but BRAIN shows ${JSON.stringify([...withdrawn])}`,
    );
  return { retained, replaced, withdrawn, errors };
}

export type Result = { file: string; name: string; outcome: "pass" | "fail" | "skip" };

/**
 * Judges the trusted cases' results against the candidate. A case that did not
 * pass (it failed, was skipped, never reported, or its file did not run as a
 * whole) is excused only when every commitment it points at was replaced or
 * withdrawn; a case that points at nothing is never excused. A result no
 * expected case accounts for, such as a case whose title could not be read,
 * points at nothing: it is held too.
 */
export function judge(cases: Case[], results: Result[], superseded: Set<string>): string[] {
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
    if (c.places.length && c.places.every((p) => superseded.has(p))) return [];
    return [`${c.file}: "${c.title}" ${outcome === "fail" ? "failed" : outcome === "skip" ? "was skipped" : outcome}`];
  });
  const unaccounted = left.flatMap((r) => {
    if (isFile(r)) return cases.some((c) => c.file === r.file) ? [] : [`${r.file}: did not run as a whole`];
    if (r.outcome === "pass") return [];
    return [`${r.file}: "${r.name}" ${r.outcome === "fail" ? "failed" : "was skipped"}, and points at nothing`];
  });
  return [...expected, ...unaccounted];
}

const TSX = fileURLToPath(import.meta.resolve("tsx/cli"));
// A URL, not a path: a Windows path such as D:\\… would be read as a URL with the scheme "d:".
const REPORTER = new URL("./regression-reporter.ts", import.meta.url).href;

/**
 * Whether `file`, a posix path, is test data, which travels with the cases: a
 * test-data directory or loader, or any file but code where cases are kept
 * (under `scripts/` or `skills/<skill>/scripts/`), such as a fixture beside them.
 */
function isData(file: string, directory: boolean): boolean {
  const parts = file.split("/");
  if (parts.includes("test-data") || parts.at(-1) === "test-data.ts") return true;
  const inCases = parts[0] === "scripts" || (parts[0] === "skills" && parts[2] === "scripts");
  return !directory && inCases && !/\.(ts|js|mjs|cjs|mts|cts)$/.test(file);
}

/** The test data and test-data loaders of a repository, outside its dependencies and Git's own files. */
function dataOf(repo: string, dir = ""): string[] {
  return fs.readdirSync(path.join(repo, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (rel === "node_modules" || rel === ".git") return [];
    if (isData(rel, e.isDirectory())) return [rel];
    return e.isDirectory() ? dataOf(repo, rel) : [];
  });
}

/** A scratch copy of a checkout to run cases in, sharing its dependencies; without its test data unless `data`. */
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
  if (fs.existsSync(path.join(repo, "node_modules")))
    // Absolute: a relative target would resolve against the copy, not the checkout.
    fs.symlinkSync(path.resolve(repo, "node_modules"), path.join(code, "node_modules"), "junction");
  return code;
}

/** Runs `files` in `code` with the trusted test runner and reporter, never the checkout's own. */
function runFiles(code: string, files: string[]): Result[] {
  const out = path.join(path.dirname(code), "results.jsonl");
  fs.writeFileSync(out, "");
  spawnSync(process.execPath, [TSX, "--test", `--test-reporter=${REPORTER}`, ...files], {
    cwd: code,
    // A run started from within another test run would report to that run instead.
    // No npm_* variable either: they describe whichever package's script started this run, not the one
    // replayed. No NODE_OPTIONS: it could preload anything into the cases.
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith("npm_"))),
      NODE_TEST_CONTEXT: undefined,
      NODE_OPTIONS: undefined,
      KAAL_REGRESSION_RESULTS: out,
    },
    stdio: "ignore",
  });
  return fs
    .readFileSync(out, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const r = JSON.parse(line) as Result;
      return { ...r, file: path.relative(code, r.file).split(path.sep).join("/") };
    });
}

/**
 * Runs the trusted cases, with the trusted test data, against a copy of the
 * candidate's code, using the trusted test runner and reporter, never the
 * candidate's. Returns what each case did.
 */
export function runTrusted(trusted: string, candidate: string): Result[] {
  const code = scratchCopy(candidate, false);
  const files = caseFiles(trusted);
  for (const rel of [...files, ...dataOf(trusted)]) {
    fs.rmSync(path.join(code, rel), { recursive: true, force: true });
    fs.mkdirSync(path.dirname(path.join(code, rel)), { recursive: true });
    fs.cpSync(path.join(trusted, rel), path.join(code, rel), { recursive: true, verbatimSymlinks: true });
  }
  return runFiles(code, files);
}

/**
 * The candidate's own cases, run by the trusted runner and reporter. They
 * prove what the candidate replaces, and they show which cases it really
 * runs, so the next main can name every one of them.
 */
function runCandidate(candidate: string): Result[] {
  const files = caseFiles(candidate);
  return files.length ? runFiles(scratchCopy(candidate, true), files) : [];
}

/**
 * The cases a candidate's source names, checked against what its run did, one
 * to one: a named case that did not run (such as one inside a comment), or a
 * case that ran without being named (such as one registered through `it` or
 * built in a loop), would leave the next main unable to tell when it goes missing.
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

/** The candidate's cases that point at a commitment replacing one of main's must each pass: a skip proves nothing. */
function replacementErrors(cases: Case[], results: Result[], successors: Set<string>): string[] {
  const proving = cases.filter((c) => c.places.some((p) => successors.has(p)));
  return judge(
    proving,
    results.filter((r) => proving.some((c) => c.file === r.file)),
    new Set(),
  ).map((error) => `replacement not proven: ${error}`);
}

/** Everything that stops a candidate from being accepted over the trusted regression at `base`. */
export function regressionErrors(trusted: string, candidate: string, base: string): string[] {
  // No trusted case would judge nothing and accept everything, so that is refused.
  const unfaithful = unreplayable(trusted);
  if (unfaithful) return [unfaithful];
  if (!repoCases(trusted).length)
    return ["main's npm test runs no case it can name, so nothing could judge the candidate"];
  // Once merged, the candidate is the regression that judges the next change, so it must be one that can.
  const successor = [
    ...[unreplayable(candidate)]
      .filter((e) => e !== undefined)
      .map((e) => `as the next main, ${e.slice("main's ".length)}`),
    ...(repoCases(candidate).length ? [] : ["as the next main, its npm test would run no case it can name"]),
    ...unnamedCases(candidate).map((at) => `as the next main, it would run a case it cannot name, at ${at}`),
  ];
  const candidateCases = repoCases(candidate);
  const candidateResults = runCandidate(candidate);
  successor.push(
    ...unmatchedCases(candidateCases, candidateResults).map((error) => `as the next main, ${error}`),
    // As main, its cases are replayed by this runner, so each must pass under it, whatever its own npm test did.
    ...candidateResults
      .filter((r) => r.outcome !== "pass" && r.name.split("\\").join("/") !== r.file)
      .map(
        (r) =>
          `as the next main, ${r.file}: "${r.name}" ${r.outcome === "fail" ? "fails" : "is skipped"} when main replays it`,
      ),
  );
  const { replaced, withdrawn, errors } = classify(trusted, candidate, base);
  const superseded = new Set([...replaced.keys(), ...withdrawn.keys()]);
  return [
    ...successor,
    ...errors,
    ...replacementErrors(candidateCases, candidateResults, new Set(replaced.values())),
    ...judge(repoCases(trusted), runTrusted(trusted, candidate), superseded),
  ];
}
