import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { learningOf, nodeFiles, parseNode, relativeIdentity } from "../skills/using-brain/scripts/brain.js";
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

/**
 * KAAL's trusted regression: the accepted regression, a state of KAAL's
 * files, judges a candidate, another state, with its own cases, chosen by its
 * own links and run against the candidate's code, so a candidate cannot
 * weaken, remove or relabel one of its commitments by changing its own tests.
 * Both states are plain directories: which states they are, and where they
 * come from, is decided outside KAAL. How a commitment is legitimately
 * replaced or withdrawn is stated in
 * brain/learning/genesis/26/09/26/03/nodes/testing.md; this applies it.
 */

const BRAIN = "brain/learning";

export type Ledger = { base?: string; replaces: [string, string][]; withdraws: [string, string][] };

/** The accepted regression a plan says it was derived from, by identity, and what it replaces and withdraws, each with what supersedes it. */
export function planLedger(plan: string): Ledger {
  const text = section(plan, "How this regression differs from the one it was derived from");
  const pairs = (label: string): [string, string][] => {
    const line = new RegExp(`^- ${label}: (.*)$`, "m").exec(text)?.[1] ?? "";
    return [...line.matchAll(/`([^`]+)` by `([^`]+)`/g)].map((m) => [m[1]!, m[2]!]);
  };
  return {
    base: /^Derived from: the accepted regression `([0-9a-f]{64})`/m.exec(text)?.[1],
    replaces: pairs("Replaces"),
    withdraws: pairs("Withdraws"),
  };
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
  return undefined;
}

type Node = { place: string; name: string; lineage: string; key: string };

function brainNodes(repo: string): Node[] {
  const root = path.join(repo, BRAIN);
  return nodeFiles(root).map((file) => {
    const { lineage, key } = learningOf(root, file);
    return { place: `${BRAIN}/${relativeIdentity(root, file)}`, name: parseNode(file).name, lineage, key };
  });
}

/** What `plan` says shows the commitment stated at `place`. */
function shownBy(plan: string, place: string): string[] {
  return planEntries(plan).find((e) => e.place === place)?.shownBy ?? [];
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
 * be retained, and a retained commitment keeps everything that showed it, such
 * as its cases. Anything else is a silent escape. Every place the candidate's
 * plan names, retained or added, must not be superseded already; whether it is
 * a place at all is a question of links (see links.ts). The plan's own account of
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
      // A retained commitment is shown at least as it was: dropping what showed it weakens it, which only
      // superseding it in BRAIN may do. Cases in particular are what protect it in the next generation.
      const was = shownBy(trustedPlan!, place);
      const is = shownBy(candidatePlan, place);
      for (const by of was.filter((by) => !is.includes(by)))
        errors.push(`${place}: the accepted regression shows it by ${by}, but the plan no longer does`);
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
  // Whatever the plan names, retained or new, must be what KAAL means now: the next accepted regression's
  // plan must not name a commitment BRAIN has already superseded.
  for (const place of kept) {
    const node = nodes.find((n) => n.place === place);
    const successor = node && current(node);
    if (successor) errors.push(`${place}: the plan names it, but ${successor.place} supersedes it`);
  }
  const ledger = planLedger(candidatePlan);
  if (ledger.base !== base)
    errors.push(`${PLAN}: derived from ${ledger.base ?? "nothing"}, not from the accepted regression ${base}`);
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

/**
 * The identity of the regression a state of KAAL's files holds, from its own
 * content: its plan, the places its commitments are stated, its case files
 * and its test data, entry by entry: each directory as one, each regular file
 * by its bytes, each link by its target, anything else by its kind. Text
 * outside `test-data` directories reads the same whichever line endings a
 * checkout gave it; test data, in a `test-data` directory or beside the cases,
 * is taken byte for byte, as the replay copies it.
 * Any change to what the regression consists of changes it; nothing outside
 * the files, such as where they are kept or how they are versioned, does. A
 * candidate names the regression it derives from by this identity.
 */
export function regressionIdentity(repo: string): string {
  const entries = new Map<string, [kind: string, content: Buffer]>();
  const add = (rel: string) => {
    const at = path.join(repo, rel);
    let entry: fs.Stats;
    try {
      entry = fs.lstatSync(at);
    } catch {
      return;
    }
    // Each entry as what it is, never what it points at: nothing but a regular file is read.
    if (entry.isDirectory()) {
      entries.set(rel, ["directory", Buffer.alloc(0)]);
      for (const e of fs.readdirSync(at)) add(`${rel}/${e}`);
    } else if (entry.isSymbolicLink()) entries.set(rel, ["link", Buffer.from(fs.readlinkSync(at), "utf8")]);
    else if (!entry.isFile()) entries.set(rel, [entry.isFIFO() ? "fifo" : "special", Buffer.alloc(0)]);
    else {
      const bytes = fs.readFileSync(at);
      // Test data as the replay copies it; only code and other text read the same whatever its line endings.
      const data = isData(rel, false) && !/\.(ts|js|mjs|cjs|mts|cts)$/.test(rel);
      entries.set(rel, ["file", data ? bytes : Buffer.from(bytes.toString("latin1").replace(/\r\n/g, "\n"), "latin1")]);
    }
  };
  if (fs.existsSync(path.join(repo, PLAN))) {
    add(PLAN);
    const plan = fs.readFileSync(path.join(repo, PLAN), "utf8");
    for (const place of planCommitments(plan))
      for (const file of fs.globSync(place, { cwd: repo })) add(file.split(path.sep).join("/"));
  }
  for (const file of [...caseFiles(repo), ...dataOf(repo)]) add(file);
  // Every part framed by its length in bytes, so no two different sets of entries hash alike.
  const hash = createHash("sha256");
  const frame = (part: Buffer) => hash.update(`${part.length}:`).update(part);
  for (const [file, [kind, content]] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    frame(Buffer.from(file, "utf8"));
    frame(Buffer.from(kind, "utf8"));
    frame(content);
  }
  return hash.digest("hex");
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
 * runs, so the next accepted regression can name every one of them.
 */
function runCandidate(candidate: string): Result[] {
  const files = caseFiles(candidate);
  return files.length ? runFiles(scratchCopy(candidate, true), files) : [];
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

/** The candidate's cases that point at a commitment replacing one of the accepted regression's must each pass: a skip proves nothing. */
function replacementErrors(cases: Case[], results: Result[], successors: Set<string>): string[] {
  const proving = cases.filter((c) => c.places.some((p) => successors.has(p)));
  return judge(
    proving,
    results.filter((r) => proving.some((c) => c.file === r.file)),
    new Set(),
  ).map((error) => `replacement not proven: ${error}`);
}

/** Everything that stops a candidate from being accepted over the trusted regression, whose identity is `base`. */
export function regressionErrors(trusted: string, candidate: string, base: string): string[] {
  // No trusted case would judge nothing and accept everything, so that is refused.
  const unfaithful = unreplayable(trusted);
  if (unfaithful) return [unfaithful];
  if (!repoCases(trusted).length)
    return ["the accepted regression's npm test runs no case it can name, so nothing could judge the candidate"];
  // Once accepted, the candidate is the regression that judges the next candidate, so it must be one that can.
  const successor = [
    ...[unreplayable(candidate)]
      .filter((e) => e !== undefined)
      .map((e) => `as the next accepted regression, ${e.slice("the accepted regression's ".length)}`),
    ...(repoCases(candidate).length
      ? []
      : ["as the next accepted regression, its npm test would run no case it can name"]),
    // Its links are what choose which of its cases protect which commitment, so they must hold from its files.
    ...linkErrors(candidate).map((error) => `as the next accepted regression, ${error}`),
  ];
  const candidateCases = repoCases(candidate);
  const candidateResults = runCandidate(candidate);
  successor.push(
    ...unmatchedCases(candidateCases, candidateResults).map((error) => `as the next accepted regression, ${error}`),
    // As the accepted regression, its cases are replayed by this runner, so each must pass under it, whatever its own npm test did.
    ...candidateResults
      .filter((r) => r.outcome !== "pass" && r.name.split("\\").join("/") !== r.file)
      .map(
        (r) =>
          `as the next accepted regression, ${r.file}: "${r.name}" ${r.outcome === "fail" ? "fails" : "is skipped"} when the accepted regression replays it`,
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
