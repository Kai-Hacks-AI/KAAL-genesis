import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";

/** The file that makes a directory a Suite and states its concern. */
export const SUITE_FILE = "suite.json";

/** A Case is a file whose `node:test` tests Node runs when it executes it: `*.test.js`, `*.test.ts` and their module variants. */
export const CASE = /\.test\.[cm]?[jt]s$/;

/**
 * A Plan: the protection it states (its body), the Suites it collects and the Carriers it collects directly, all
 * as posix paths relative to the testing root. A Plan written before Carriers could be collected has none.
 */
export type Plan = { concern: string; suites: string[]; carriers: string[] };

/** A Suite: its place relative to the testing root, its concern, and its Cases as posix paths relative to it. */
export type Suite = { place: string; concern: string; cases: string[] };

/** What a Run saw of one Case. A Case that ran no test, or skipped one, proves nothing, so it did not pass. */
export type Observation = { case: string; passed: boolean; output: string };

/**
 * One execution of a Plan: which Cases ran against which candidate, under
 * which conditions, with which outcomes. The Plan holds only when every
 * Case of every Suite it collects passed.
 */
export type Run = {
  plan: string;
  candidate: string;
  conditions: string;
  observations: Observation[];
  holds: boolean;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const concernError = (value: Record<string, unknown>): string | undefined =>
  typeof value.concern === "string" && value.concern.trim() ? undefined : "concern must be a non-empty string";

/** A place is a relative posix path that stays beneath the root it is read from. */
function placeError(place: unknown, noun = "suite"): string | undefined {
  if (typeof place !== "string" || !place) return `a ${noun} must be a non-empty path`;
  const parts = place.split("/");
  if (
    place.startsWith("/") ||
    /^[A-Za-z]:/.test(place) ||
    place.includes("\\") ||
    parts.some((p) => !p || p === "." || p === "..")
  )
    return `${noun} "${place}" must be a relative posix path beneath the root`;
  return undefined;
}

function readJson(file: string): { value?: unknown; error?: string } {
  try {
    return { value: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** A Plan's YAML frontmatter, then its body. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * The Plan at `file`, with every way it is not one: Markdown whose YAML
 * frontmatter lists its `suites`, and may list `carriers`, and whose body
 * states its concern. Every other frontmatter key belongs to the using system
 * and is never read.
 */
export function readPlan(file: string): { plan?: Plan; errors: string[] } {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    return { errors: [`${file}: unreadable plan (${e instanceof Error ? e.message : String(e)})`] };
  }
  const match = FRONTMATTER.exec(text);
  if (!match) return { errors: [`${file}: a plan must begin with YAML frontmatter`] };
  let data: unknown;
  try {
    data = YAML.parse(match[1]);
  } catch (e) {
    return { errors: [`${file}: unreadable frontmatter (${e instanceof Error ? e.message : String(e)})`] };
  }
  if (!isObject(data)) return { errors: [`${file}: frontmatter must be a mapping`] };
  const errors: string[] = [];
  const concern = text.slice(match[0].length).trim();
  if (!concern) errors.push(`${file}: the body must state the plan's concern`);
  // A Plan that collects Carriers need not state Suites it does not collect; one that states neither is still refused.
  const suites = data.suites === undefined && data.carriers !== undefined ? [] : data.suites;
  if (!Array.isArray(suites)) errors.push(`${file}: suites must be a list`);
  else {
    for (const place of suites) {
      const invalid = placeError(place);
      if (invalid) errors.push(`${file}: ${invalid}`);
    }
    const seen = new Set<unknown>();
    for (const place of suites) {
      if (seen.has(place)) errors.push(`${file}: suite "${place}" is collected twice`);
      seen.add(place);
    }
  }
  const carriers = data.carriers ?? [];
  if (!Array.isArray(carriers)) errors.push(`${file}: carriers must be a list`);
  else {
    for (const place of carriers) {
      const invalid = placeError(place, "carrier");
      if (invalid) errors.push(`${file}: ${invalid}`);
    }
    const seen = new Set<unknown>();
    for (const place of carriers) {
      if (seen.has(place)) errors.push(`${file}: carrier "${place}" is collected twice`);
      seen.add(place);
    }
  }
  return errors.length
    ? { errors }
    : { plan: { concern, suites: suites as string[], carriers: carriers as string[] }, errors };
}

/** The Suite at `place` beneath `root`: its concern and its Cases, in sorted order. */
export function readSuite(root: string, place: string): { suite?: Suite; errors: string[] } {
  const dir = path.join(root, ...place.split("/"));
  const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) return { errors: [`${place}: not a directory`] };
  const { value, error } = readJson(path.join(dir, SUITE_FILE));
  if (error) return { errors: [`${place}/${SUITE_FILE}: unreadable suite (${error})`] };
  if (!isObject(value)) return { errors: [`${place}/${SUITE_FILE}: a suite must be an object`] };
  const errors: string[] = [];
  const extra = Object.keys(value).filter((key) => key !== "concern");
  if (extra.length) errors.push(`${place}/${SUITE_FILE}: unknown ${extra.map((key) => `"${key}"`).join(", ")}`);
  const concern = concernError(value);
  if (concern) errors.push(`${place}/${SUITE_FILE}: ${concern}`);
  const cases = fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && CASE.test(entry.name))
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (!cases.length) errors.push(`${place}: holds no Case`);
  return errors.length ? { errors } : { suite: { place, concern: value.concern as string, cases }, errors };
}

/** Every Suite the Plan at `plan` (relative to `root`) collects, with every way the Plan, a Suite or a collected Carrier is broken. */
export function readPlanSuites(root: string, plan: string): { plan?: Plan; suites: Suite[]; errors: string[] } {
  const read = readPlan(path.join(root, plan));
  if (!read.plan) return { suites: [], errors: read.errors };
  const suites: Suite[] = [];
  const errors: string[] = [];
  for (const place of read.plan.suites) {
    const { suite, errors: invalid } = readSuite(root, place);
    if (suite) suites.push(suite);
    errors.push(...invalid);
  }
  for (const place of read.plan.carriers) {
    const stat = fs.lstatSync(path.join(root, ...place.split("/")), { throwIfNoEntry: false });
    if (!stat?.isFile() || !CASE.test(place)) errors.push(`${place}: not a Case file`);
  }
  return { plan: read.plan, suites, errors };
}

/**
 * The Cases a Run of the Plan executes, as posix paths relative to the testing
 * root, each once: those of its Suites in order, then the Carriers it collects
 * directly. A Case that a Suite and the Plan both collect is the same Case, and
 * a Run executes it once.
 */
export function planCases(plan: Plan, suites: Suite[]): string[] {
  const cases = new Set<string>();
  for (const suite of suites) for (const file of suite.cases) cases.add(`${suite.place}/${file}`);
  for (const place of plan.carriers) cases.add(place);
  return [...cases];
}

/**
 * The TAP summary count Node's test runner reports under `name`. Read only
 * from the report the runner writes to its own destination, never from what
 * the Case itself prints, so a Case cannot forge it.
 */
const count = (tap: string, name: string): number => Number(new RegExp(`^# ${name} (\\d+)$`, "m").exec(tap)?.[1] ?? 0);

/** Node options that load code before a Case runs, such as a TypeScript loader. */
const LOADERS = ["--import", "--require", "-r", "--loader", "--experimental-loader"];

/**
 * The loader options among Node options `argv`, each with its value, whether
 * given as one argument (`--import=x`) or two (`--import x`). Every other
 * option, and so every test runner option and its value, is left out.
 */
export function loaderArgs(argv: string[]): string[] {
  const kept: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (LOADERS.includes(arg) && i + 1 < argv.length) kept.push(arg, argv[++i]);
    else if (LOADERS.some((loader) => arg.startsWith(`${loader}=`))) kept.push(arg);
  }
  return kept;
}

/**
 * Loader options as they resolve from `from`, the runner's working directory:
 * a loader named by a relative path (`./hook.mjs`, `../x.cjs`) is made
 * absolute there, as a file URL for the ES module options, so it still names
 * the same file when a Case runs in another working directory. Absolute
 * paths, URLs and package names are kept as given.
 */
export function resolveLoaders(args: string[], from: string): string[] {
  const resolved: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const [option, joined] = args[i].includes("=") ? args[i].split(/=(.*)/s) : [args[i], undefined];
    const value = joined ?? args[++i];
    const relative =
      value.startsWith("./") || value.startsWith("../") || value.startsWith(".\\") || value.startsWith("..\\");
    const absolute = path.resolve(from, value);
    const fixed = !relative
      ? value
      : option === "--require" || option === "-r"
        ? absolute
        : pathToFileURL(absolute).href;
    resolved.push(...(joined === undefined ? [option, fixed] : [`${option}=${fixed}`]));
  }
  return resolved;
}

/**
 * `NODE_OPTIONS` split as Node splits it: at spaces, except inside double
 * quotes, where a backslash escapes the next character.
 */
export function nodeOptions(value: string): string[] {
  const options: string[] = [];
  let current = "";
  let quoted = false;
  let started = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quoted && c === "\\" && i + 1 < value.length) current += value[++i];
    else if (c === '"') [quoted, started] = [!quoted, true];
    else if (c === " " && !quoted) {
      if (started || current) options.push(current);
      [current, started] = ["", false];
    } else current += c;
  }
  if (started || current) options.push(current);
  return options;
}

/**
 * Executes one Case in its own Node process, in the candidate as its working
 * directory, under the same Node and loaders this process runs under,
 * whether given on its command line or in `NODE_OPTIONS`, and none of its
 * other options. It passed only if the process succeeded and every test the
 * runner reported ran and passed. The runner reports to a file of its own,
 * apart from what the Case prints, and to it even when this process runs
 * inside a test runner.
 */
export function runCase(file: string, candidate: string): { passed: boolean; output: string } {
  const { NODE_TEST_CONTEXT: _, NODE_OPTIONS, ...env } = process.env;
  const cwd = process.cwd();
  const loaders = [
    ...resolveLoaders(loaderArgs(nodeOptions(NODE_OPTIONS ?? "")), cwd),
    ...resolveLoaders(loaderArgs(process.execArgv), cwd),
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "testing-run-"));
  const report = path.join(dir, "report.tap");
  try {
    const result = spawnSync(
      process.execPath,
      [...loaders, "--test-reporter=tap", `--test-reporter-destination=${report}`, file],
      { cwd: candidate, env, encoding: "utf8" },
    );
    const tap = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : "";
    const output = `${tap}${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error) : ""}`;
    const tests = count(tap, "tests");
    const passed = result.status === 0 && tests > 0 && count(tap, "pass") === tests;
    return { passed, output };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

/**
 * Runs the Plan at `plan`: reads it and its Suites from the testing root
 * `root`, and executes every Case against `candidate`, by default the same
 * directory. Refuses a broken Plan or Suite before running anything.
 */
export function runPlan(plan: string, root = ".", candidate = root): Run {
  const read = readPlanSuites(root, plan);
  if (read.errors.length) throw new Error(`refusing to run ${plan}:\n${read.errors.join("\n")}`);
  const observations: Observation[] = [];
  for (const at of planCases(read.plan!, read.suites)) {
    const { passed, output } = runCase(path.resolve(root, ...at.split("/")), path.resolve(candidate));
    observations.push({ case: at, passed, output });
  }
  return {
    plan,
    candidate: path.resolve(candidate),
    conditions: `node ${process.version} ${process.platform} ${process.arch}`,
    observations,
    holds: observations.every((o) => o.passed),
  };
}

/** A Run as lines: the plan, the candidate, the conditions, one line per Case, then whether the Plan holds. */
export function report(run: Run): string {
  return [
    `plan ${run.plan}`,
    `candidate ${run.candidate}`,
    `conditions ${run.conditions}`,
    ...run.observations.map((o) => `${o.passed ? "pass" : "fail"} ${o.case}`),
    run.holds ? "holds" : "does not hold",
  ].join("\n");
}
