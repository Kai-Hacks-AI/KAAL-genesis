import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { Conditions, Requirement } from "../skills/testing/scripts/plan.js";
import { portableNameError } from "../skills/using-brain/scripts/brain.js";
import { PLAN, planCommitments, planEntries, planEntryErrors, section, SUITES, suiteError } from "./links.js";
import { keptAsData } from "./regression.js";

/**
 * KAAL's test plans, read from a state's files alone. A plan states a testing
 * purpose in a file of its own, whose place is its identity: KAAL's Regression
 * Plan, and any other in `plans/<name>.md`. What carries a plan out is stated
 * beneath it: each suite says which plans it serves with a `Serves: <place>`
 * line, as each case says which suites it belongs to, so a plan never lists
 * its suites or its cases. A plan says how runs read what it requires in a
 * `yaml` block under `## As runs read it`: the sets of conditions its testing
 * must be shown under, the proof other than cases it requires and under which
 * of them, and the test data it provides. What KAAL's plans are is stated in
 * brain/learning/genesis/26/09/27/07/nodes/plan.md.
 */

export const PLANS = "plans";
const PLAN_PLACE = /^plans\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
/**
 * What is at `at`: a directory, a file, something else, or nothing. What
 * cannot be read, such as a link that loops back on itself, is something else:
 * neither directory nor file, so nothing is stated there.
 */
export function kindAt(at: string): "directory" | "file" | "other" | undefined {
  try {
    const stat = fs.statSync(at, { throwIfNoEntry: false });
    return stat === undefined
      ? fs.lstatSync(at, { throwIfNoEntry: false })
        ? "other"
        : undefined
      : stat.isDirectory()
        ? "directory"
        : stat.isFile()
          ? "file"
          : "other";
  } catch {
    return "other";
  }
}

/** A line meant to say its suite serves a plan, strictly written or not: any line that starts with "Serves". */
const SERVES_LIKE = /^\s*serves\b/i;
const SERVES = /^Serves: (\S+)$/;
/** The section of a plan that says how runs read what it requires. */
export const AS_RUNS_READ_IT = "As runs read it";

/**
 * Why `place` is not a plan `repo` states, if it is not: the Regression Plan,
 * or a file of its own in `plans/`, with a portable name, that is really a
 * file there, not a link.
 */
export function planError(repo: string, place: string): string | undefined {
  if (place !== PLAN && !PLAN_PLACE.test(place)) return `${place}: not a plan's place, which is ${PLANS}/<name>.md`;
  const portable = place === PLAN ? undefined : portableNameError(path.posix.basename(place, ".md"), "a plan's name");
  if (portable) return `${place}: ${portable}`;
  const file = path.join(repo, place);
  const real = fs.existsSync(file) ? path.relative(fs.realpathSync(repo), fs.realpathSync(file)) : undefined;
  if (real === undefined || !fs.statSync(file).isFile()) return `${place}: no plan is stated there`;
  if (real.split(path.sep).join("/") !== place) return `${place}: a plan stated through a link`;
  return undefined;
}

/** The entries where `repo` states its suites, by place: none where that is no directory. */
function suiteEntries(repo: string): string[] {
  const dir = path.join(repo, SUITES);
  return kindAt(dir) === "directory"
    ? fs
        .readdirSync(dir)
        .sort()
        .map((name) => `${SUITES}/${name}`)
    : [];
}

/**
 * Every suite `repo` states, by place, with the plans it says it serves and the
 * lines that look like it but are not. Only a suite stated in its own place is
 * read: an entry that is no suite's place, states nothing, or is reached
 * through a link is refused where suites are checked, before anything reads
 * where it leads.
 */
export function suitePlans(repo: string): { suite: string; serves: string[]; stray: number[] }[] {
  return suiteEntries(repo)
    .filter((suite) => !suiteError(repo, suite))
    .map((suite) => {
      const lines = fs.readFileSync(path.join(repo, suite), "utf8").split(/\r?\n/);
      const serves = lines.flatMap((line) => SERVES.exec(line)?.[1] ?? []);
      const stray = lines.flatMap((line, i) => (SERVES_LIKE.test(line) && !SERVES.test(line) ? [i + 1] : []));
      return { suite, serves, stray };
    });
}

/** What a plan says runs read of it: its sets of conditions, the proof other than cases it requires, and its data. */
export type PlanReading = {
  conditions: Conditions[];
  proof: Record<string, Conditions[]>;
  data?: string;
};

/**
 * Why `plan` may not name the commitments it does, if it names any: only the
 * Regression Plan does, since the links of KAAL's cases are checked against its
 * commitments alone, so one another plan named would be checked by nothing.
 */
function commitmentsError(repo: string, plan: string): string | undefined {
  return plan !== PLAN && section(planText(repo, plan), "Commitments")
    ? `${plan}: names commitments, which only the Regression Plan does; it is carried by the suites that serve it`
    : undefined;
}

/** A plan's text as its sections are read: a section it begins with is read as any other. */
const planText = (repo: string, plan: string) =>
  `\n${fs.readFileSync(path.join(repo, plan), "utf8").replace(/\r\n/g, "\n")}`;

const conditionSets = (value: unknown, what: string): Conditions[] => {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    !value.every(
      (set) =>
        set &&
        typeof set === "object" &&
        !Array.isArray(set) &&
        Object.values(set as object).every((v) => typeof v === "string"),
    )
  )
    throw new Error(`${what}: not a list of sets of conditions, each naming its conditions' values`);
  // A run is given a condition as name=value, so a condition a plan requires is named by a plain word.
  for (const name of (value as Conditions[]).flatMap((set) => Object.keys(set)))
    if (!/^[A-Za-z][\w-]*$/.test(name))
      throw new Error(`${what}: ${JSON.stringify(name)} is no name a run can be given as a condition`);
  return value as Conditions[];
};

/**
 * What `plan`, in `repo`, says runs read of it, from the `yaml` block under its
 * `## As runs read it`; a plan without one requires no conditions, no other
 * proof and provides no data. Refused when that block cannot be read so.
 */
export function readPlan(repo: string, plan: string): PlanReading {
  const part = section(planText(repo, plan), AS_RUNS_READ_IT);
  if (!part) return { conditions: [], proof: {} };
  // The fence may close directly after it opens: a block with nothing in it.
  const found = /\n```yaml\n(?:([\s\S]*?)\n)?```/.exec(part);
  const block = found ? (found[1] ?? "") : undefined;
  if (block === undefined) throw new Error(`${plan}: ${AS_RUNS_READ_IT} holds no yaml block`);
  // A block that says nothing, or holds only comments, requires nothing; anything else must say what runs read.
  const says = block.split("\n").some((line) => line.trim() && !line.trim().startsWith("#"));
  const parsed: unknown = says ? YAML.parse(block) : {};
  // Anything but a mapping of what runs read would read as requiring nothing, so it is refused.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error(`${plan}: ${AS_RUNS_READ_IT} holds no mapping of what runs read`);
  const read = parsed as Record<string, unknown>;
  for (const key of Object.keys(read))
    if (!["conditions", "proof", "data"].includes(key)) throw new Error(`${plan}: runs read no ${key} of a plan`);
  // What a plan leaves out it does not require; what it says, even null, must be what runs read.
  const proof = read.proof === undefined ? {} : read.proof;
  if (typeof proof !== "object" || proof === null || Array.isArray(proof))
    throw new Error(`${plan}: proof: not proofs by name`);
  if (read.data !== undefined && typeof read.data !== "string") throw new Error(`${plan}: data: not a place`);
  return {
    conditions: conditionSets(read.conditions, `${plan}: conditions`),
    proof: Object.fromEntries(
      Object.entries(proof).map(([name, under]) => [name, conditionSets(under, `${plan}: proof: ${name}`)]),
    ),
    ...(read.data === undefined ? {} : { data: read.data as string }),
  };
}

/**
 * Why the data `plan` provides is not a place its runs can hand its cases, if
 * it is not: a directory inside the state, it and all it holds reached through no link.
 */
export function planDataError(repo: string, plan: string, data: string): string | undefined {
  // A place of its own: plain path segments, none of them . or .., so never the state itself nor anything above it.
  const segments = data.replace(/\/+$/, "").split("/");
  if (!data || path.isAbsolute(data) || segments.some((s) => !s || s === "." || s === ".."))
    return `${plan}: data: ${data} is not a place of its own in the state`;
  const at = path.join(repo, data);
  const real = fs.existsSync(at) ? path.relative(fs.realpathSync(repo), fs.realpathSync(at)) : undefined;
  if (real === undefined || !fs.statSync(at).isDirectory())
    return `${plan}: data: ${data} is no directory inside the state`;
  if (real.split(path.sep).join("/") !== data.replace(/\/+$/, ""))
    return `${plan}: data: ${data} is reached through a link`;
  // Nor is anything within it, however deep, or a case could read what the state does not hold.
  // Each directory is listed only once it is known to be no link, so what a link leads to is never read.
  const linked = (within: string): string | undefined => {
    for (const name of fs.readdirSync(path.join(at, within)).sort()) {
      const entry = within ? `${within}/${name}` : name;
      const stat = fs.lstatSync(path.join(at, entry));
      if (stat.isSymbolicLink()) return entry;
      const deeper = stat.isDirectory() ? linked(entry) : undefined;
      if (deeper !== undefined) return deeper;
    }
    return undefined;
  };
  const link = linked("");
  if (link !== undefined) return `${plan}: data: ${data} holds ${link}, reached through a link`;
  return undefined;
}

/** What a plan requires, as KAAL reads it: each requirement with what kind it is, and under which sets of conditions. */
export type PlanRequirement = Requirement & { kind: "commitment" | "suite" | "proof" };

/**
 * What `plan` requires shown, read from `repo`'s files: the commitments it
 * names, the suites that say they serve it, both under the plan's sets of
 * conditions, and the proof other than cases it names, each under the sets
 * it states for it or else the plan's. A suite that says it serves the plan
 * must be one the state states in its own place, never through a link, or
 * what the plan requires would be chosen by a file the state does not hold.
 */
export function planRequirements(repo: string, plan: string): PlanRequirement[] {
  // Only a plan the state states has requirements, however they are asked for.
  const notPlan = planError(repo, plan);
  if (notPlan) throw new Error(notPlan);
  // A run reads plans as the links check reads them, so what the check refuses of a state's plans, such as a
  // Regression Plan entry that says not where its commitment is stated, a plan naming commitments it may not, a check
  // it names but does not require, or a suite's line that serves no plan, a run refuses too, whichever plan it runs,
  // before anything runs, rather than require less than the plans say.
  // Its entries are read only once it is known to be stated in its own place; one that is not, planErrors refuses.
  const hasPlan = fs.existsSync(path.join(repo, PLAN)) && planError(repo, PLAN) === undefined;
  const incoherent = [...(hasPlan ? planEntryErrors(repo).errors : []), ...planErrors(repo)];
  if (incoherent.length) throw new Error(incoherent.join("\n"));
  const { conditions, proof } = readPlan(repo, plan);
  const text = planText(repo, plan);
  return [
    ...planCommitments(text).map((name) => ({ name, kind: "commitment" as const, under: conditions })),
    ...suitePlans(repo)
      .filter((s) => s.serves.includes(plan))
      .map(({ suite }) => {
        const wrong = suiteError(repo, suite);
        if (wrong) throw new Error(wrong);
        return { name: suite, kind: "suite" as const, under: conditions };
      }),
    ...Object.entries(proof).map(([name, under]) => ({
      name,
      kind: "proof" as const,
      under: under.length ? under : conditions,
    })),
  ];
}

/**
 * Everything that makes `repo`'s plans incoherent, read from its files: every
 * file in `plans/` is a plan's place; every suite's `Serves:` line is strictly
 * written and names a plan the state states; and every plan says how runs read
 * it in a way they can, with data they can hand, and names, as proof it
 * requires, every check other than cases it says shows a commitment.
 */
export function planErrors(repo: string): string[] {
  const errors: string[] = [];
  // What is not a directory states no suite and no plan, so no suite or plan a run should require goes unread.
  const suites = kindAt(path.join(repo, SUITES));
  if (suites !== undefined && suites !== "directory")
    errors.push(`${SUITES}: not a directory, where KAAL states its suites`);
  for (const suite of suiteEntries(repo)) {
    const wrong = suiteError(repo, suite);
    if (wrong) errors.push(wrong);
  }
  const where = kindAt(path.join(repo, PLANS));
  if (where !== undefined && where !== "directory")
    errors.push(`${PLANS}: not a directory, where KAAL states its plans`);
  const plans = [
    ...(fs.existsSync(path.join(repo, PLAN)) ? [PLAN] : []),
    ...(where === "directory"
      ? fs
          .readdirSync(path.join(repo, PLANS))
          .sort()
          .map((name) => `${PLANS}/${name}`)
      : []),
  ];
  for (const plan of plans) {
    const wrong = planError(repo, plan);
    if (wrong) {
      errors.push(wrong);
      continue;
    }
    const naming = commitmentsError(repo, plan);
    if (naming) errors.push(naming);
    try {
      const { proof, data } = readPlan(repo, plan);
      const dataWrong = data === undefined ? undefined : planDataError(repo, plan, data);
      if (dataWrong) errors.push(dataWrong);
      // The Regression Plan's data is kept where the regression's identity finds test data, under a test-data/
      // directory outside the dependencies and Git's own files, so a change to it is a change to the regression, never
      // one its identity misses.
      else if (plan === PLAN && data !== undefined && !keptAsData(data.replace(/\/+$/, "")))
        errors.push(
          `${PLAN}: data: ${data} is not kept where the regression's identity finds test data: under a test-data/ directory, outside node_modules and .git`,
        );
      // A plan that says how runs read it says it in full: every check it names as showing a commitment is proof it
      // requires. One that does not yet say how runs read it requires no proof of them.
      const text = planText(repo, plan);
      const checks = section(text, AS_RUNS_READ_IT) ? planEntries(text).flatMap((e) => e.shownBy ?? []) : [];
      for (const check of [...new Set(checks)].filter((c) => c !== "its cases" && !Object.hasOwn(proof, c)))
        errors.push(`${plan}: says ${check} show a commitment, but does not require them as proof`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  for (const { suite, serves, stray } of suitePlans(repo)) {
    errors.push(...stray.map((at) => `${suite}:${at}: a line that serves no plan, written as "Serves: <place>"`));
    for (const plan of serves) {
      const wrong = planError(repo, plan);
      if (wrong) errors.push(`${suite}: serves ${wrong}`);
    }
  }
  return errors;
}
