import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readChanges, ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";
import { readTestCases, testCasesTesting, type TestCase } from "../skills/testing/scripts/test-cases.js";
import { CASE } from "../skills/testing/scripts/testing.js";
import { kaalDefects } from "./defects.js";
import { kaalRequirements } from "./requirements.js";

/**
 * KAAL's composition of Testing with Requirements and Defects. A Carrier is a
 * `*.test.*` file; a Test Case is one top-level `node:test` call in it, which
 * states what it tests in its literal `tests` option. Testing owns that
 * reference and knows neither managing-requirements nor managing-defects;
 * those know nothing of Testing. This decides which kinds a Test Case of KAAL
 * may test, `requirement` and `defect`, and that each id must name one that
 * exists. A Carrier is found as a file of a Change's `test/`, whether or not
 * any Suite collects it: what a Test Case tests does not wait on where Suites
 * lie. The reference belongs to the Test Case: a Requirement or a Defect never
 * names its Test Cases, and the Test Cases testing one are found by reading
 * them. Traceability is of the Test Case; a Run still observes the Carrier.
 */

/** The Change occurrence directory that holds its Suites: KAAL's Test Strategy, test/strategy.md. */
export const TEST_DIR = "test";

/** What a Test Case of KAAL may test. */
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
 * The Test Cases of the Carriers beneath KAAL's Changes' `test/`, with
 * everything that stops a reference being one: anything Testing refuses in a
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
  return { cases, errors };
}

/** The identities of the Test Cases, among `cases`, that test the Requirement `id`. */
export const testCasesTestingRequirement = (cases: TestCase[], id: string): string[] =>
  testCasesTesting(cases, "requirement", id);

/** The identities of the Test Cases, among `cases`, that test the Defect `id`. */
export const testCasesTestingDefect = (cases: TestCase[], id: string): string[] =>
  testCasesTesting(cases, "defect", id);

// With no arguments, checks every reference. With `<requirement|defect> <id>`,
// prints the Test Cases that test it, one identity per line, after the same check.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [kind, id, ...rest] = process.argv.slice(2);
  if (
    (kind !== undefined && id === undefined) ||
    rest.length ||
    (kind !== undefined && !KINDS.includes(kind as never))
  ) {
    console.error(`usage: test-cases.ts [${KINDS.join("|")} <id>]`);
    process.exitCode = 2;
  } else {
    const { cases, errors } = kaalTestCases();
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else if (kind !== undefined) for (const c of testCasesTesting(cases, kind, id)) console.log(c);
  }
}
