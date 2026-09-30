import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readChanges, ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";
import { casesTesting, readSuiteTests, type CaseTests } from "../skills/testing/scripts/case-tests.js";
import { SUITE_FILE, readSuite } from "../skills/testing/scripts/testing.js";
import { kaalDefects } from "./defects.js";
import { kaalRequirements } from "./requirements.js";

/**
 * KAAL's composition of Testing with Requirements and Defects. Testing owns
 * the Case-side reference, `// @tests <kind> <id>`, and knows neither
 * managing-requirements nor managing-defects; those know nothing of Testing.
 * This decides which kinds a Case of KAAL may test, `requirement` and
 * `defect`, and that each id must name one that exists. The reference belongs
 * to the Case: a Requirement or a Defect never names its Cases, and Cases
 * testing one are found by reading the Cases.
 */

/** The Change occurrence directory that holds its Suites: KAAL's Test Strategy, test/strategy.md. */
export const TEST_DIR = "test";

/** What a Case of KAAL may test. */
export const KINDS = ["requirement", "defect"] as const;

/** Every Suite place, relative to `repo`, beneath each Change's `test/`: each directory holding `suite.json`, in traversal order. */
export function suitePlaces(repo = "."): string[] {
  const places: string[] = [];
  for (const change of readChanges(path.join(repo, CHANGE_ROOT)).changes) {
    const base = [CHANGE_ROOT, change.lineage, ...change.occurrence.split("/"), TEST_DIR];
    const dir = path.join(repo, ...base);
    if (!fs.lstatSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue;
    const found = fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name === SUITE_FILE)
      .map((e) => path.relative(repo, e.parentPath).split(path.sep).join("/"))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    places.push(...found);
  }
  return places;
}

/**
 * The Cases of KAAL's Suites with what each tests, and everything that stops a
 * reference being one: a malformed or repeated reference, a kind KAAL does not
 * test, and an id that names no Requirement or Defect. A Case in several
 * Suites, being beneath them all, is one Case.
 */
export function kaalCaseTests(repo = "."): { cases: CaseTests[]; errors: string[] } {
  const requirements = kaalRequirements(repo);
  const defects = kaalDefects(repo);
  const known: Record<string, Set<string>> = {
    requirement: new Set(requirements.requirements.map((r) => r.id)),
    defect: new Set(defects.defects.map((d) => d.id)),
  };
  const cases = new Map<string, CaseTests>();
  const errors: string[] = [...requirements.errors, ...defects.errors];
  for (const place of suitePlaces(repo)) {
    const { suite, errors: invalid } = readSuite(repo, place);
    errors.push(...invalid);
    if (!suite) continue;
    const read = readSuiteTests(repo, suite);
    errors.push(...read.errors);
    for (const c of read.cases) if (!cases.has(c.case)) cases.set(c.case, c);
  }
  for (const c of cases.values()) {
    for (const { kind, id } of c.tests) {
      if (!Object.hasOwn(known, kind))
        errors.push(`${c.case}: tests ${kind} "${id}", but a Case may test only ${KINDS.join(" or ")}`);
      else if (!known[kind].has(id)) errors.push(`${c.case}: tests ${kind} "${id}", which names no ${kind}`);
    }
  }
  return { cases: [...cases.values()], errors };
}

/** The Cases of KAAL's Suites that test the Requirement `id`. */
export const casesTestingRequirement = (cases: CaseTests[], id: string): string[] =>
  casesTesting(cases, "requirement", id);

/** The Cases of KAAL's Suites that test the Defect `id`. */
export const casesTestingDefect = (cases: CaseTests[], id: string): string[] => casesTesting(cases, "defect", id);

// With no arguments, checks every reference. With `<requirement|defect> <id>`,
// prints the Cases that test it, one per line, after the same check.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [kind, id, ...rest] = process.argv.slice(2);
  if (
    (kind !== undefined && id === undefined) ||
    rest.length ||
    (kind !== undefined && !KINDS.includes(kind as never))
  ) {
    console.error(`usage: case-tests.ts [${KINDS.join("|")} <id>]`);
    process.exitCode = 2;
  } else {
    const { cases, errors } = kaalCaseTests();
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else if (kind !== undefined) for (const c of casesTesting(cases, kind, id)) console.log(c);
  }
}
