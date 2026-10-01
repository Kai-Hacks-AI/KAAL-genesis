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
 * What one instance is under: parameters by name, each a plain string. Testing knows no parameter, and compares
 * a name and a value only by exact equality with what a Run's conditions state.
 */
export type Parameters = Record<string, string>;

/**
 * One required instance. What is instantiated is the HOW, a Test Case, under the parameters a Run must provide;
 * Testing can name only the file that executes it, so it names the Carrier, a posix path relative to the testing
 * root, and a Run performs that Carrier whole. That is the Runner's projection and its limit, not what an instance
 * means: Test Cases sharing a Carrier are not thereby parameterized together.
 */
export type Instance = { carrier: string; parameters: Parameters };

/**
 * A Plan: the protection it states (its body), the Suites it collects, the Carriers it collects directly and, when it
 * states any, the Carriers it collects under parameters, all as posix paths relative to the testing root. A Plan
 * written before Carriers could be collected has none, and one written before parameters could be stated has no
 * `parameterized`.
 */
export type Plan = { concern: string; suites: string[]; carriers: string[]; parameterized?: Instance[] };

/** A Suite: its place relative to the testing root, its concern, and its Cases as posix paths relative to it. */
export type Suite = { place: string; concern: string; cases: string[] };

/** What a Run saw of one Case. A Case that ran no test, or skipped one, proves nothing, so it did not pass. */
export type Observation = { case: string; passed: boolean; output: string };

/**
 * The conditions a Run executed under, as facts by name: Testing observes the Node version, the platform and the
 * architecture. A name and a value mean nothing to Testing beyond exact equality.
 */
export type Conditions = Record<string, string>;

/** An instance a Run did not perform, because it is under parameters the Run's conditions do not provide: its identity and those parameters. */
export type Unrun = { case: string; parameters: Parameters };

/**
 * One execution of a Plan: which Cases ran against which candidate, under
 * which conditions, with which outcomes. A Run reports only what it executed:
 * an instance under parameters its conditions do not provide is listed as
 * unrun, never as observed. The Plan holds, by this Run, only when every
 * instance it requires was performed and passed; a Run that left some unrun is
 * not shown to hold the Plan, though it need not fail it.
 */
export type Run = {
  plan: string;
  candidate: string;
  facts: Conditions;
  conditions: string;
  observations: Observation[];
  unrun: Unrun[];
  holds: boolean;
};

/** What this process runs under: the conditions a Run observes. */
export const observeConditions = (): Conditions => ({
  node: process.version,
  platform: process.platform,
  arch: process.arch,
});

/** The observed conditions as the Run has always stated them: Node version, platform, architecture. */
const describeConditions = (c: Conditions): string => `node ${c.node} ${c.platform} ${c.arch}`;

/**
 * The names among `parameters` that `conditions` do not provide: every one must
 * be stated by the Run with that very value. A name the Run does not state is
 * never provided, so an instance is never evidence under conditions nothing
 * observed. None unmet means the Run can perform it.
 */
export const unmet = (parameters: Parameters, conditions: Conditions): string[] =>
  Object.keys(parameters).filter((name) => !Object.hasOwn(conditions, name) || conditions[name] !== parameters[name]);

/** A name or a value of a parameter: non-empty, with no whitespace and none of `,`, `=`, `[` and `]`, so an identity is never ambiguous. */
export const PARAMETER = /^[^\s,=[\]]+$/;

/**
 * The identity of a required instance as one line: its Carrier alone when it is
 * under no parameters, exactly as a Case has always been named, and otherwise
 * the Carrier and its parameters sorted by name, `carrier[name=value,name=value]`.
 */
export const instanceId = ({ carrier, parameters }: Instance): string => {
  const names = Object.keys(parameters).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return names.length ? `${carrier}[${names.map((n) => `${n}=${parameters[n]}`).join(",")}]` : carrier;
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
  const listed = data.carriers ?? [];
  const carriers: string[] = [];
  const parameterized: Instance[] = [];
  if (!Array.isArray(listed)) errors.push(`${file}: carriers must be a list`);
  else {
    const stated: { id: string; what: string }[] = [];
    for (const entry of listed) {
      if (!isObject(entry)) {
        const invalid = placeError(entry, "carrier");
        if (invalid) errors.push(`${file}: ${invalid}`);
        else carriers.push(entry as string);
        if (typeof entry === "string") stated.push({ id: entry, what: `carrier "${entry}"` });
        continue;
      }
      const read = readInstance(entry);
      errors.push(...read.errors.map((e) => `${file}: ${e}`));
      if (!read.instance) continue;
      parameterized.push(read.instance);
      const id = instanceId(read.instance);
      stated.push({
        id,
        what: `carrier "${read.instance.carrier}" under ${id.slice(read.instance.carrier.length + 1, -1)}`,
      });
    }
    const seen = new Set<string>();
    for (const { id, what } of stated) {
      if (seen.has(id)) errors.push(`${file}: ${what} is collected twice`);
      seen.add(id);
    }
  }
  return errors.length
    ? { errors }
    : {
        plan: {
          concern,
          suites: suites as string[],
          carriers,
          ...(parameterized.length && { parameterized }),
        },
        errors,
      };
}

/** The required instance a `carriers` entry that is a mapping states: its `carrier` and the non-empty `parameters` it is under, or why it is not one. */
function readInstance(entry: Record<string, unknown>): { instance?: Instance; errors: string[] } {
  const errors: string[] = [];
  const extra = Object.keys(entry).filter((key) => key !== "carrier" && key !== "parameters");
  if (extra.length) errors.push(`a carrier under parameters has unknown ${extra.map((key) => `"${key}"`).join(", ")}`);
  const invalid = placeError(entry.carrier, "carrier");
  if (invalid) errors.push(invalid);
  const parameters = entry.parameters;
  if (!isObject(parameters) || !Object.keys(parameters).length)
    errors.push("a carrier under parameters must state parameters, a non-empty mapping of names to values");
  else
    for (const [name, value] of Object.entries(parameters))
      if (!PARAMETER.test(name) || typeof value !== "string" || !PARAMETER.test(value))
        errors.push(`parameter "${name}" must be a plain name with a plain string value`);
  return errors.length
    ? { errors }
    : { instance: { carrier: entry.carrier as string, parameters: parameters as Parameters }, errors };
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
  for (const place of [...read.plan.carriers, ...(read.plan.parameterized ?? []).map((i) => i.carrier)]) {
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

/**
 * The instances a Run of the Plan performs or leaves unrun, each once: its
 * Cases, which are under no parameters, as `planCases` has them, then the
 * Carriers it collects under parameters, each Carrier with each distinct set of
 * parameters one instance. The same Carrier under different parameters is one
 * HOW, however many instances require it.
 */
export function planInstances(plan: Plan, suites: Suite[]): Instance[] {
  return [...planCases(plan, suites).map((carrier) => ({ carrier, parameters: {} })), ...(plan.parameterized ?? [])];
}

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
 * `root`, and performs every instance it requires that this process's observed
 * conditions provide, against `candidate`, by default the same directory.
 * Refuses a broken Plan or Suite before running anything.
 */
export function runPlan(plan: string, root = ".", candidate = root): Run {
  return runPlanUnder(observeConditions(), plan, root, candidate);
}

/**
 * `runPlan` under the `conditions` it is told rather than the ones it observes:
 * for a using system's own tests of what several Runs together show, to make the
 * Run another environment would have made. Only `runPlan` observes; Testing
 * records the conditions it is given and cannot tell that they are true, so a Run
 * made here is evidence of nothing but what it computes. An instance under
 * parameters these conditions do not provide is not performed.
 */
export function runPlanUnder(conditions: Conditions, plan: string, root = ".", candidate = root): Run {
  const read = readPlanSuites(root, plan);
  if (read.errors.length) throw new Error(`refusing to run ${plan}:\n${read.errors.join("\n")}`);
  const observations: Observation[] = [];
  const unrun: Unrun[] = [];
  for (const instance of planInstances(read.plan!, read.suites)) {
    const id = instanceId(instance);
    if (unmet(instance.parameters, conditions).length) unrun.push({ case: id, parameters: instance.parameters });
    else
      observations.push({
        case: id,
        ...runCase(path.resolve(root, ...instance.carrier.split("/")), path.resolve(candidate)),
      });
  }
  return {
    plan,
    candidate: path.resolve(candidate),
    facts: conditions,
    conditions: describeConditions(conditions),
    observations,
    unrun,
    holds: !unrun.length && observations.every((o) => o.passed),
  };
}

/**
 * What a Run showed of its Plan: `does not hold` if an instance it performed
 * failed, which is so under any conditions; `holds` if every instance the Plan
 * requires was performed and passed; and otherwise `incomplete`: nothing it
 * performed failed, but some required instance is under parameters its
 * conditions do not provide, so it does not show the Plan, and does not show
 * that it fails.
 */
export const verdict = (run: Run): "holds" | "does not hold" | "incomplete" =>
  run.observations.some((o) => !o.passed) ? "does not hold" : run.unrun.length ? "incomplete" : "holds";

/** A Run as lines: the plan, the candidate, the conditions, one line per instance it performed, one per instance it left unrun, then what it showed. */
export function report(run: Run): string {
  return [
    `plan ${run.plan}`,
    `candidate ${run.candidate}`,
    `conditions ${run.conditions}`,
    ...run.observations.map((o) => `${o.passed ? "pass" : "fail"} ${o.case}`),
    ...run.unrun.map((u) => `unrun ${u.case}`),
    verdict(run),
  ].join("\n");
}

/** What each instance a Plan requires came to in one Run: those that passed, those that failed, and those left unrun. */
export type Outcomes = { plan: string; passed: string[]; failed: string[]; unrun: string[] };

/** The outcomes of a Run. */
export const outcomes = (run: Run): Outcomes => ({
  plan: run.plan,
  passed: run.observations.filter((o) => o.passed).map((o) => o.case),
  failed: run.observations.filter((o) => !o.passed).map((o) => o.case),
  unrun: run.unrun.map((u) => u.case),
});

/** The outcomes a Run's `report` states, or why it is not one. Each instance is stated once. */
export function readReport(text: string): { outcomes?: Outcomes; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((line) => line !== "");
  const plan = /^plan (.+)$/.exec(lines[0] ?? "")?.[1];
  if (!plan) return { errors: ["a Run's report begins with its plan"] };
  const result: Outcomes = { plan, passed: [], failed: [], unrun: [] };
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const line of lines.slice(1)) {
    const match = /^(pass|fail|unrun) (.+)$/.exec(line);
    if (!match) continue;
    const [, kind, at] = match;
    if (seen.has(at)) errors.push(`${at} is stated twice`);
    seen.add(at);
    result[kind === "pass" ? "passed" : kind === "fail" ? "failed" : "unrun"].push(at);
  }
  if (!["holds", "does not hold", "incomplete"].includes(lines[lines.length - 1]))
    errors.push("a Run's report ends with what it showed");
  return errors.length ? { errors } : { outcomes: result, errors };
}

/**
 * What several Runs of one Plan together show of it. Whether the Plan holds is
 * what one Run shows; a Plan that requires instances under different parameters
 * is evidenced by Runs whose conditions provide each of them, and no Run is asked
 * to perform what its conditions do not provide. The Plan is **evidenced** when
 * every instance it requires passed in at least one Run and failed in none: a
 * Run that left one unrun neither supports it nor counts against it. One Run that
 * left none unrun is evidenced exactly when it holds.
 */
export type Evidence = { evidenced: boolean; passed: string[]; failed: string[]; unevidenced: string[] };

/**
 * The evidence of `runs`, each the outcomes of one Run, in one pass over them:
 * refused when there is none, or when they do not require the same instances,
 * since they are then not Runs of one Plan. Testing cannot tell that the Runs executed
 * the same candidate, or under the conditions they state: that is the using
 * system's to ensure, as it is for one Run.
 */
export function planEvidence(runs: Outcomes[]): { evidence?: Evidence; errors: string[] } {
  if (!runs.length) return { errors: ["no Run to show anything of the Plan"] };
  const cases = (r: Outcomes) => [...r.passed, ...r.failed, ...r.unrun];
  const universe = new Set(cases(runs[0]));
  const errors: string[] = [];
  const passed = new Set<string>();
  const failed = new Set<string>();
  runs.forEach((run, i) => {
    const these = cases(run);
    if (these.length !== universe.size || these.some((c) => !universe.has(c)))
      errors.push(`Run ${i + 1} (${run.plan}) does not require the instances of Run 1 (${runs[0].plan})`);
    run.passed.forEach((c) => passed.add(c));
    run.failed.forEach((c) => failed.add(c));
  });
  if (errors.length) return { errors };
  const order = (cs: Iterable<string>) => [...cs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const unevidenced = [...universe].filter((c) => !passed.has(c) && !failed.has(c));
  return {
    evidence: {
      evidenced: !failed.size && !unevidenced.length,
      passed: order([...passed].filter((c) => !failed.has(c))),
      failed: order(failed),
      unevidenced: order(unevidenced),
    },
    errors,
  };
}
