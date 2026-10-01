import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readChanges, ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";
import {
  carriersCurrentlyTesting,
  currentTestCasesTesting,
  readSupersession,
  testCasesProtecting,
  type PlanEntry,
} from "../skills/testing/scripts/supersession.js";
import { readTestCases, testCasesTesting, type TestCase } from "../skills/testing/scripts/test-cases.js";
import { CASE, instanceId, type Instance } from "../skills/testing/scripts/testing.js";
import { kaalDefects } from "./defects.js";
import { kaalRequiredEvidence, requiredInstances, type RequiredEvidence } from "./required-evidence.js";
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
 * runnable scope, computed from the Test Cases and what they declare, never
 * from a Suite or a stored list. Which identities are protected is for the
 * caller to say; what makes a Test Case active is Testing's.
 */
export const carriersProtecting = (
  cases: TestCase[],
  kind: (typeof KINDS)[number],
  ids: readonly string[],
): { carriers: string[] } | { errors: string[] } =>
  carriersCurrentlyTesting(
    cases,
    ids.map((id) => ({ kind, id })),
  );

/**
 * The Test Plan that demonstrates the protection of the Requirements or
 * Defects `ids` of `kind`: each Test Case active for any of them once, with
 * the ids that select it, and the instances a Run executes, each Carrier under
 * the parameters `evidence` says the Requirement it is selected for must be
 * evidenced under, and under none for a Defect or a Requirement it names no
 * decision of. Derived, never stored: a Plan file made of it is discarded and
 * made again from the sources as it was. Which identities are protected is for
 * the caller to say.
 */
export function testPlanProtecting(
  cases: TestCase[],
  kind: (typeof KINDS)[number],
  ids: readonly string[],
  evidence: readonly RequiredEvidence[] = [],
): { entries: PlanEntry[]; carriers: string[]; instances: Instance[]; plan: string } | { errors: string[] } {
  const answer = testCasesProtecting(
    cases,
    ids.map((id) => ({ kind, id })),
  );
  if ("errors" in answer) return answer;
  const instances = requiredInstances(answer.entries, evidence);
  const carriers = [...new Set(instances.map((i) => i.carrier))];
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
    `Derived, not authored: the Carriers that hold the Test Cases active for each ${kind} below, each Carrier once under each set of parameters its ${kind}'s evidence is required under, computed from the Test Cases, the \`tests\` and \`supersedes\` they declare and the evidence the Changes require. Made again from them, it is the same.`,
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
// Plan file that collects those Carriers, under the parameters the Changes require their Requirements evidenced under, derived from the same material and never stored.
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
    const required = kaalRequiredEvidence();
    const cases = tested.cases;
    const errors = [...tested.errors, ...required.errors];
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else if (carriers) {
      const ids = [id, ...rest];
      const k = kind as (typeof KINDS)[number];
      if (plan) {
        const answer = testPlanProtecting(cases, k, ids, required.evidence);
        if ("errors" in answer) {
          console.error(answer.errors.join("\n"));
          process.exitCode = 1;
        } else process.stdout.write(answer.plan);
      } else {
        const answer = carriersProtecting(cases, k, ids);
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
