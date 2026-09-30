import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/** The file that makes a directory a Suite and states its concern. */
export const SUITE_FILE = "suite.json";

/** A Case is a file whose `node:test` tests Node runs when it executes it: `*.test.js`, `*.test.ts` and their module variants. */
export const CASE = /\.test\.[cm]?[jt]s$/;

/** A Plan: the protection it states (its body), and the Suites it collects, as posix paths relative to the testing root. */
export type Plan = { concern: string; suites: string[] };

/** A Suite: its place and its Cases as posix paths relative to the testing root, and its concern. */
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
function placeError(place: unknown, what = "suite"): string | undefined {
  if (typeof place !== "string" || !place) return `a ${what} must be a non-empty path`;
  const parts = place.split("/");
  if (
    place.startsWith("/") ||
    /^[A-Za-z]:/.test(place) ||
    place.includes("\\") ||
    parts.some((p) => !p || p === "." || p === "..")
  )
    return `${what} "${place}" must be a relative posix path beneath the root`;
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
 * frontmatter lists its `suites` and whose body states its concern. Every
 * other frontmatter key belongs to the using system and is never read.
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
  if (!Array.isArray(data.suites)) errors.push(`${file}: suites must be a list`);
  else {
    for (const place of data.suites) {
      const invalid = placeError(place);
      if (invalid) errors.push(`${file}: ${invalid}`);
    }
    const seen = new Set<unknown>();
    for (const place of data.suites) {
      if (seen.has(place)) errors.push(`${file}: suite "${place}" is collected twice`);
      seen.add(place);
    }
  }
  return errors.length ? { errors } : { plan: { concern, suites: data.suites as string[] }, errors };
}

/** Every Case file at or beneath `place` in `root`, as posix paths relative to `root`, in sorted order. */
function casesAt(root: string, place: string): string[] | undefined {
  const at = path.join(root, ...place.split("/"));
  const stat = fs.lstatSync(at, { throwIfNoEntry: false });
  if (stat?.isFile()) return CASE.test(place) ? [place] : undefined;
  if (!stat?.isDirectory()) return undefined;
  return fs
    .readdirSync(at, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && CASE.test(entry.name))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The Suite at `place` beneath `root`: its concern and its Cases. Its
 * `cases` name them, each a Case file or a directory contributing every Case
 * file beneath it, as places beneath the root; without `cases`, a Suite
 * names its own directory.
 */
export function readSuite(root: string, place: string): { suite?: Suite; errors: string[] } {
  const dir = path.join(root, ...place.split("/"));
  const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) return { errors: [`${place}: not a directory`] };
  const file = `${place}/${SUITE_FILE}`;
  const { value, error } = readJson(path.join(dir, SUITE_FILE));
  if (error) return { errors: [`${file}: unreadable suite (${error})`] };
  if (!isObject(value)) return { errors: [`${file}: a suite must be an object`] };
  const errors: string[] = [];
  const extra = Object.keys(value).filter((key) => key !== "concern" && key !== "cases");
  if (extra.length) errors.push(`${file}: unknown ${extra.map((key) => `"${key}"`).join(", ")}`);
  const concern = concernError(value);
  if (concern) errors.push(`${file}: ${concern}`);
  const named = value.cases === undefined ? [place] : value.cases;
  const cases: string[] = [];
  if (!Array.isArray(named)) errors.push(`${file}: cases must be a list`);
  else {
    for (const at of named) {
      const invalid = placeError(at, "case");
      if (invalid) {
        errors.push(`${file}: ${invalid}`);
        continue;
      }
      const found = casesAt(root, at as string);
      if (!found) errors.push(`${file}: case "${at}" is neither a Case file nor a directory`);
      for (const one of found ?? []) {
        if (cases.includes(one)) errors.push(`${file}: case "${one}" is named twice`);
        else cases.push(one);
      }
    }
    if (!cases.length && !errors.length) errors.push(`${place}: holds no Case`);
  }
  return errors.length ? { errors } : { suite: { place, concern: value.concern as string, cases }, errors };
}

/** Every Suite the Plan at `plan` (relative to `root`) collects, with every way the Plan or a Suite is broken. */
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
  return { plan: read.plan, suites, errors };
}

/** The TAP summary count Node's test runner reports under `name`. */
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
 * Executes one Case in its own Node process, in the candidate as its working
 * directory, under the same Node and loaders this process runs under, and
 * none of its other options. It
 * passed only if the process succeeded and every test it reported ran and
 * passed. Its tests report to it even when this process runs inside a test
 * runner.
 */
export function runCase(file: string, candidate: string): { passed: boolean; output: string } {
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  const result = spawnSync(process.execPath, [...loaderArgs(process.execArgv), "--test-reporter=tap", file], {
    cwd: candidate,
    env,
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error) : ""}`;
  const tests = count(output, "tests");
  const passed = result.status === 0 && tests > 0 && count(output, "pass") === tests;
  return { passed, output };
}

/**
 * Runs the Plan at `plan`: reads it and its Suites from the testing root
 * `root`, and executes every Case against `candidate`, by default the same
 * directory. Refuses a broken Plan or Suite before running anything.
 */
export function runPlan(plan: string, root = ".", candidate = root): Run {
  const { suites, errors } = readPlanSuites(root, plan);
  if (errors.length) throw new Error(`refusing to run ${plan}:\n${errors.join("\n")}`);
  const observations: Observation[] = [];
  for (const suite of suites) {
    for (const at of suite.cases) {
      const { passed, output } = runCase(path.resolve(root, ...at.split("/")), path.resolve(candidate));
      observations.push({ case: at, passed, output });
    }
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
