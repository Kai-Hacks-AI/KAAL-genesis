import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { readChanges, ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";
import {
  carriersCurrentlyTesting,
  currentTestCasesTesting,
  readSupersession,
  testCasesProtecting,
  type PlanEntry,
} from "../skills/testing/scripts/supersession.js";
import { readTestCases, testCasesTesting, type TestCase } from "../skills/testing/scripts/test-cases.js";
import {
  CASE,
  instanceId,
  PARAMETER,
  readSuite,
  SUITE_FILE,
  suiteCasesTesting,
  type Instance,
  type Parameters,
  type Suite,
} from "../skills/testing/scripts/testing.js";
import { kaalDefects } from "./defects.js";
import { kaalRequirements } from "./requirements.js";

/**
 * KAAL's composition of Testing with Requirements and Defects. A Carrier is a
 * `*.test.*` file; a traceable Test Case is one canonical declaration in it,
 * `test("name", { tests: { requirement: ["id"] } }, fn)` through the Carrier's
 * default import of `node:test`, which declares what the Test Case tests.
 * Testing owns that declaration and knows neither managing-requirements nor
 * managing-defects; those know nothing of Testing. This decides which kinds a
 * Test Case of KAAL may declare, `requirement` and `defect`, and that each id
 * must name one that exists. A Carrier is found as a file of a Change's
 * `test/`, whether or not any Suite collects it: what a Test Case declares does
 * not wait on where Suites lie. The declaration belongs to the Test Case: a
 * Requirement or a Defect never names its Test Cases, and the Test Cases
 * declaring one are found by reading them. It is a declaration of meaning, not
 * evidence that the call ran: a Run observes the Carrier.
 */

/** The Change occurrence directory that holds its Suites: KAAL's Test Strategy, test/strategy.md. */
export const TEST_DIR = "test";

/** What a Test Case of KAAL may declare it tests. */
export const KINDS = ["requirement", "defect"] as const;

/** Every Carrier beneath each Change's `test/`, as posix paths from `repo`, in traversal order. No Suite is consulted. */
export function carrierPlaces(repo = "."): string[] {
  const places: string[] = [];
  for (const change of readChanges(path.join(repo, CHANGE_ROOT)).changes) {
    const dir = path.join(repo, CHANGE_ROOT, change.lineage, ...change.occurrence.split("/"), TEST_DIR);
    if (!fs.lstatSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue;
    const found = fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && CASE.test(e.name))
      .map((e) => path.relative(repo, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    places.push(...found);
  }
  return places;
}

/**
 * The traceable Test Cases of the Carriers beneath KAAL's Changes' `test/`,
 * with everything that stops a reference being one: anything Testing refuses in a
 * Carrier, a kind KAAL does not test, and an id that names no Requirement or
 * Defect.
 */
export function kaalTestCases(repo = "."): { cases: TestCase[]; errors: string[] } {
  const requirements = kaalRequirements(repo);
  const defects = kaalDefects(repo);
  const known: Record<string, Set<string>> = {
    requirement: new Set(requirements.requirements.map((r) => r.id)),
    defect: new Set(defects.defects.map((d) => d.id)),
  };
  const cases: TestCase[] = [];
  const errors: string[] = [...requirements.errors, ...defects.errors];
  for (const place of carrierPlaces(repo)) {
    const read = readTestCases(path.join(repo, ...place.split("/")), place);
    cases.push(...read.cases);
    errors.push(...read.errors);
  }
  for (const c of cases) {
    for (const { kind, id } of c.tests) {
      const who = `${c.carrier}: "${c.name}"`;
      if (!Object.hasOwn(known, kind))
        errors.push(`${who} tests ${kind} "${id}", but a Test Case may test only ${KINDS.join(" or ")}`);
      else if (!known[kind].has(id)) errors.push(`${who} tests ${kind} "${id}", which names no ${kind}`);
    }
  }
  errors.push(...readSupersession(cases).errors);
  return { cases, errors };
}

/**
 * The Suites beneath KAAL's Changes' `test/`, each a directory holding a
 * `suite.json`, at any depth, as places posix from `repo`, with everything that
 * stops one being a Suite: anything Testing refuses in it, a kind KAAL does not
 * test, and an id that names no Requirement or Defect. A Suite's `tests` is the
 * same declaration as a Test Case's and is held to the same kinds and ids.
 */
export function kaalSuites(repo = "."): { suites: Suite[]; errors: string[] } {
  const requirements = kaalRequirements(repo);
  const defects = kaalDefects(repo);
  const known: Record<string, Set<string>> = {
    requirement: new Set(requirements.requirements.map((r) => r.id)),
    defect: new Set(defects.defects.map((d) => d.id)),
  };
  const suites: Suite[] = [];
  const errors: string[] = [...requirements.errors, ...defects.errors];
  for (const change of readChanges(path.join(repo, CHANGE_ROOT)).changes) {
    const dir = path.join(repo, CHANGE_ROOT, change.lineage, ...change.occurrence.split("/"), TEST_DIR);
    if (!fs.lstatSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue;
    const places = fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name === SUITE_FILE)
      .map((e) => path.relative(repo, e.parentPath).split(path.sep).join("/"))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const place of places) {
      const read = readSuite(repo, place);
      errors.push(...read.errors);
      if (!read.suite) continue;
      suites.push(read.suite);
      for (const { kind, id } of read.suite.tests) {
        if (!Object.hasOwn(known, kind))
          errors.push(`${place}/${SUITE_FILE} tests ${kind} "${id}", but a Suite may test only ${KINDS.join(" or ")}`);
        else if (!known[kind].has(id))
          errors.push(`${place}/${SUITE_FILE} tests ${kind} "${id}", which names no ${kind}`);
      }
    }
  }
  return { suites, errors: [...new Set(errors)] };
}

/** The identities of the Test Cases, among `cases`, that test the Requirement `id`. */
export const testCasesTestingRequirement = (cases: TestCase[], id: string): string[] =>
  testCasesTesting(cases, "requirement", id);

/** The identities of the Test Cases, among `cases`, that test the Defect `id`. */
export const testCasesTestingDefect = (cases: TestCase[], id: string): string[] =>
  testCasesTesting(cases, "defect", id);

/** The identities of the Test Cases, among `cases`, that are active for the Requirement `id`: those that test it and that no later Test Case of their own lineage tests too. */
export const currentTestCasesTestingRequirement = (cases: TestCase[], id: string): string[] =>
  currentTestCasesTesting(cases, "requirement", id);

/**
 * The Carriers that hold the Test Cases active for any of the Requirements or
 * Defects `ids` of `kind`, the protection a Run of them demonstrates: derived
 * runnable scope, computed from the Test Cases and the Suites and what they declare, never
 * from a stored list. Which identities are protected is for the
 * caller to say; what makes a Test Case active is Testing's. The Case files beneath a
 * Suite whose `tests` names one of them are Carriers too (in today's representation of a Suite), the evidence the
 * Suite's claim is made of.
 */
export const carriersProtecting = (
  cases: TestCase[],
  kind: (typeof KINDS)[number],
  ids: readonly string[],
  suites: readonly Suite[] = [],
): { carriers: string[] } | { errors: string[] } => {
  const targets = ids.map((id) => ({ kind, id }));
  const answer = carriersCurrentlyTesting(cases, targets);
  if ("errors" in answer) return answer;
  return {
    carriers: [...new Set([...answer.carriers, ...suiteCasesTesting(suites, targets).map((e) => e.carrier)])].sort(
      compare,
    ),
  };
};

/*
 * Which instances a Plan requires is KAAL's decision, and a Change keeps it
 * beneath its `test/`, with the rest of its protection: `test/instances/`, one
 * Markdown file per decision.
 *
 *     ---
 *     requirement: linux-support
 *     parameters:
 *       environment: linux
 *     ---
 *
 *     Why this Requirement's HOW is required under these parameters.
 *
 * A Test Case is generic HOW and carries no environment; Testing compares a
 * parameter only by equality with what a Run observed and knows no name and no
 * value; a Requirement states what must hold, never what demonstrates it. So
 * the decision belongs to the Change's test material, never to a Test Case,
 * to Testing or to the sealed Requirement. A Requirement may be named by any
 * number of decisions, each a parameter set, and each, with every Test Case
 * that tests the Requirement, is one required instance; one no decision names
 * is required as it always was, under none. It is input to deriving a Plan:
 * what the Runs show of those instances is Testing's evidence, and is neither
 * stored nor decided here.
 */

/** Where a Change occurrence keeps, beneath its `test/`, its decisions about the parameters a Requirement's instances are required under. */
export const INSTANCE_DIR = "instances";

/** One decision: the Test Cases that test `requirement` are required under `parameters`, as stated in `file`. */
export type InstanceRequirement = { requirement: string; parameters: Parameters; file: string };

/** Every Change's `test/instances/` directory beneath the repository, in traversal order; a Change with none holds none. */
export function instanceRoots(repo = "."): string[] {
  return readChanges(path.join(repo, CHANGE_ROOT)).changes.map((change) =>
    path.join(repo, CHANGE_ROOT, change.lineage, ...change.occurrence.split("/"), TEST_DIR, INSTANCE_DIR),
  );
}

const INSTANCE_FRONTMATTER = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;

/** Parses one decision, or says why it is not one. `file` only names errors; `known` are the ids of the Requirements that exist. */
export function parseInstanceRequirement(
  text: string,
  file: string,
  known: ReadonlySet<string>,
): InstanceRequirement | string {
  const match = INSTANCE_FRONTMATTER.exec(text);
  if (!match) return `${file}: missing YAML frontmatter`;
  let data: unknown;
  try {
    data = YAML.parse(match[1]);
  } catch {
    return `${file}: frontmatter is not valid YAML`;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return `${file}: frontmatter must be a mapping`;
  const { requirement, parameters } = data as { requirement?: unknown; parameters?: unknown };
  if (typeof requirement !== "string") return `${file}: requirement is required`;
  if (!known.has(requirement)) return `${file}: requirement "${requirement}" names no requirement`;
  if (
    typeof parameters !== "object" ||
    parameters === null ||
    Array.isArray(parameters) ||
    !Object.keys(parameters).length
  )
    return `${file}: parameters must be a non-empty mapping of names to values`;
  for (const [name, value] of Object.entries(parameters))
    if (!PARAMETER.test(name) || typeof value !== "string" || !PARAMETER.test(value))
      return `${file}: parameter "${name}" must be a plain name with a plain string value`;
  if (!match[2].trim()) return `${file}: a decision must state why`;
  return { requirement, parameters: parameters as Parameters, file };
}

/**
 * The decisions across all Changes, with everything that stops them being
 * decisions. The `*.md` entries directly in a `test/instances/` directory are the
 * candidates, each a regular file; anything else there is not this
 * composition's. Two decisions of one Requirement under the same parameters
 * are one: an instance is never required twice.
 */
export function kaalInstanceRequirements(repo = "."): { required: InstanceRequirement[]; errors: string[] } {
  const { requirements, errors } = kaalRequirements(repo);
  const known = new Set(requirements.map((r) => r.id));
  const required = new Map<string, InstanceRequirement>();
  for (const root of instanceRoots(repo)) {
    const stat = fs.lstatSync(root, { throwIfNoEntry: false });
    if (!stat) continue;
    if (!stat.isDirectory()) {
      errors.push(`${root}: not a directory`);
      continue;
    }
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!entry.name.endsWith(".md")) continue;
      const file = path.relative(repo, path.join(root, entry.name)).split(path.sep).join("/");
      if (!entry.isFile()) {
        errors.push(`${file}: not a regular file`);
        continue;
      }
      const read = parseInstanceRequirement(fs.readFileSync(path.join(root, entry.name), "utf8"), file, known);
      if (typeof read === "string") errors.push(read);
      else {
        const key = instanceId({ carrier: read.requirement, parameters: read.parameters });
        if (!required.has(key)) required.set(key, read);
      }
    }
  }
  return { required: [...required.values()], errors };
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The instances the Test Cases of `entries` are required under: each Test
 * Case, once per set of parameters any Requirement it is selected for is
 * required under, and under none when it is selected for a Defect or for a
 * Requirement no decision names. A Test Case is a Carrier here, as Testing can
 * name only the file that executes it. Each instance once, sorted by identity.
 */
export function requiredInstances(
  entries: readonly (Pick<PlanEntry, "carrier" | "targets"> & { name?: string })[],
  required: readonly InstanceRequirement[],
): Instance[] {
  const instances = new Map<string, Instance>();
  for (const { carrier, targets } of entries)
    for (const { kind, id } of targets) {
      const sets = kind === "requirement" ? required.filter((e) => e.requirement === id) : [];
      for (const parameters of sets.length ? sets.map((e) => e.parameters) : [{}]) {
        const instance = { carrier, parameters };
        instances.set(instanceId(instance), instance);
      }
    }
  return [...instances.entries()].sort(([a], [b]) => compare(a, b)).map(([, instance]) => instance);
}

/**
 * What a derived Plan says of itself. A Plan that requires no instance under
 * parameters is worded as it was before instances had parameters, so a Plan
 * stored under an earlier Authorise is made again byte for byte; wording about
 * parameters appears only in a Plan that has some.
 */
const unparameterisedNote = (kind: string): string =>
  `Derived, not authored: the Carriers that hold the Test Cases active for each ${kind} below, each Carrier once, computed from the Test Cases and the \`tests\` and \`supersedes\` they declare. Made again from them, it is the same.`;
const parameterisedNote = (kind: string): string =>
  `Derived, not authored: the Carriers that hold the Test Cases active for each ${kind} below, each Carrier once under each set of parameters its ${kind}'s instances are required under, computed from the Test Cases, the \`tests\` and \`supersedes\` they declare and the instances the Changes require. Made again from them, it is the same.`;

/**
 * The Test Plan that demonstrates the protection of the Requirements or
 * Defects `ids` of `kind`: each Test Case active for any of them once, with
 * the ids that select it, and the instances a Run executes, each Carrier under
 * the parameters `required` says the Requirement it is selected for is
 * required under, and under none for a Defect or a Requirement it names no
 * decision of. A Suite whose `tests` names one of them contributes, in today's representation of a Suite, the Case files beneath it the
 * same way: they are the evidence its claim needs, and a Plan without them would
 * demonstrate nothing of it. Derived, never stored: a Plan file made of it is discarded and
 * made again from the sources as it was. Which identities are protected is for
 * the caller to say.
 */
export function testPlanProtecting(
  cases: TestCase[],
  kind: (typeof KINDS)[number],
  ids: readonly string[],
  required: readonly InstanceRequirement[] = [],
  suites: readonly Suite[] = [],
): { entries: PlanEntry[]; carriers: string[]; instances: Instance[]; plan: string } | { errors: string[] } {
  const targets = ids.map((id) => ({ kind, id }));
  const answer = testCasesProtecting(cases, targets);
  if ("errors" in answer) return answer;
  const instances = requiredInstances([...answer.entries, ...suiteCasesTesting(suites, targets)], required);
  const carriers = [...new Set(instances.map((i) => i.carrier))];
  const parameterised = instances.some((i) => Object.keys(i.parameters).length > 0);
  const protectedIds = [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const plan = [
    "---",
    "carriers:",
    ...instances.map((i) =>
      Object.keys(i.parameters).length
        ? `  - { carrier: ${JSON.stringify(i.carrier)}, parameters: ${JSON.stringify(i.parameters)} }`
        : `  - ${JSON.stringify(i.carrier)}`,
    ),
    "---",
    "",
    parameterised ? parameterisedNote(kind) : unparameterisedNote(kind),
    "",
    ...protectedIds.map((id) => `- ${id}`),
    "",
  ].join("\n");
  return { entries: answer.entries, carriers, instances, plan };
}

/** The identity of each instance, as Testing names it: the Carrier alone, or `carrier[name=value]`. */
export const instanceIds = (instances: readonly Instance[]): string[] => instances.map(instanceId);

// With no arguments, checks every reference and every lineage. With `<requirement|defect> <id>`,
// prints the Test Cases that test it, one identity per line, after the same check; with `current`
// before them, only those active for it: no later Test Case of their own lineage tests it too. With
// `carriers <requirement|defect> <id>...`, prints the Carriers, one path per line, that hold the Test
// Cases active for any of the ids. With `plan <requirement|defect> <id>...`, prints the Test Plan, a
// Plan file that collects those Carriers, under the parameters the Changes require their Requirements' instances under, derived from the same material and never stored.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const usage = `usage: test-cases.ts [current] [${KINDS.join("|")} <id>] | carriers|plan <${KINDS.join("|")}> <id>...`;
  const args = process.argv.slice(2);
  const plan = args[0] === "plan";
  const carriers = args[0] === "carriers" || plan;
  const current = args[0] === "current";
  const [kind, id, ...rest] = carriers || current ? args.slice(1) : args;
  if (
    (current && kind === undefined) ||
    (carriers && (id === undefined || !KINDS.includes(kind as never))) ||
    (!carriers && ((kind !== undefined && id === undefined) || rest.length)) ||
    (kind !== undefined && !KINDS.includes(kind as never))
  ) {
    console.error(usage);
    process.exitCode = 2;
  } else {
    const tested = kaalTestCases();
    const instances = kaalInstanceRequirements();
    const suiteRead = kaalSuites();
    const cases = tested.cases;
    const errors = [...tested.errors, ...instances.errors, ...suiteRead.errors];
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else if (carriers) {
      const ids = [id, ...rest];
      const k = kind as (typeof KINDS)[number];
      if (plan) {
        const answer = testPlanProtecting(cases, k, ids, instances.required, suiteRead.suites);
        if ("errors" in answer) {
          console.error(answer.errors.join("\n"));
          process.exitCode = 1;
        } else process.stdout.write(answer.plan);
      } else {
        const answer = carriersProtecting(cases, k, ids, suiteRead.suites);
        if ("errors" in answer) {
          console.error(answer.errors.join("\n"));
          process.exitCode = 1;
        } else for (const carrier of answer.carriers) console.log(carrier);
      }
    } else if (kind !== undefined)
      for (const c of current ? currentTestCasesTesting(cases, kind, id) : testCasesTesting(cases, kind, id))
        console.log(c);
  }
}
