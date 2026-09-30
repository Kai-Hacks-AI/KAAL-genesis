import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { birthChange } from "../skills/managing-change/scripts/birth.js";
import { createDefect } from "../skills/managing-defects/scripts/create.js";
import { createRequirement } from "../skills/managing-requirements/scripts/create.js";
import { casesTesting } from "../skills/testing/scripts/case-tests.js";
import { casesTestingDefect, casesTestingRequirement, casePlaces, kaalCaseTests, TEST_DIR } from "./case-tests.js";
import { DEFECT_DIR } from "./defects.js";
import { REQUIREMENT_DIR } from "./requirements.js";

// KAAL composes Testing with Requirements and Defects: a Case states what it
// tests; KAAL checks that what it names exists. Nothing is written into the
// Requirement or the Defect.
const CODE = 'import test from "node:test";\ntest("passes", () => {});\n';

/** A repository with one Change holding Requirements `r1`, `r2`, Defects `d1`, `d2` and a Suite of the given Cases. */
function repo(cases: Record<string, string>): { dir: string; born: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-case-tests-"));
  const born = birthChange({ root: path.join(dir, "change"), lineage: "x", occurrence: "26/09/30/01" });
  for (const id of ["r1", "r2"]) createRequirement(path.join(born, REQUIREMENT_DIR), id, `${id} holds.`);
  for (const id of ["d1", "d2"]) createDefect(path.join(born, DEFECT_DIR), id, `${id} holds.`, `${id} did not.`);
  const suite = path.join(born, TEST_DIR, "suite");
  fs.mkdirSync(suite, { recursive: true });
  fs.writeFileSync(path.join(suite, "suite.json"), JSON.stringify({ concern: "Scratch." }));
  for (const [name, header] of Object.entries(cases)) fs.writeFileSync(path.join(suite, name), `${header}${CODE}`);
  return { dir, born };
}

const dirTree = (root: string): Record<string, string> =>
  Object.fromEntries(
    fs
      .readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => path.join(e.parentPath, e.name))
      .sort()
      .map((f) => [f, fs.readFileSync(f, "utf8")]),
  );

const PLACE = "change/x/26/09/30/01/test/suite";

test("KAAL's own Cases state only references to Requirements and Defects that exist", () => {
  assert.deepEqual(kaalCaseTests().errors, []);
});

test("a Case can test a Requirement, a Defect, and several of each; several Cases can test the same", () => {
  const { dir } = repo({
    "a.test.ts": "// @tests requirement r1\n",
    "b.test.ts": "// @tests defect d1\n",
    "c.test.ts": "// @tests requirement r1\n// @tests requirement r2\n// @tests defect d1\n// @tests defect d2\n",
    "d.test.ts": "",
  });
  const { cases, errors } = kaalCaseTests(dir);
  assert.deepEqual(errors, []);
  assert.equal(cases.length, 4);
  assert.deepEqual(casesTestingRequirement(cases, "r1"), [`${PLACE}/a.test.ts`, `${PLACE}/c.test.ts`]);
  assert.deepEqual(casesTestingRequirement(cases, "r2"), [`${PLACE}/c.test.ts`]);
  assert.deepEqual(casesTestingDefect(cases, "d1"), [`${PLACE}/b.test.ts`, `${PLACE}/c.test.ts`]);
  assert.deepEqual(casesTestingDefect(cases, "d2"), [`${PLACE}/c.test.ts`]);
  assert.deepEqual(casesTestingRequirement(cases, "d1"), []);
});

test("testing a Requirement or a Defect modifies neither, and leaves no reverse registry behind", () => {
  const { dir, born } = repo({});
  const before = dirTree(dir);
  const suite = path.join(born, TEST_DIR, "suite");
  fs.writeFileSync(path.join(suite, "a.test.ts"), `// @tests requirement r1\n// @tests defect d1\n${CODE}`);
  const { cases, errors } = kaalCaseTests(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(casesTestingRequirement(cases, "r1"), [`${PLACE}/a.test.ts`]);
  const after = dirTree(dir);
  // Only the Case was added: Requirements, Defects and everything else are byte for byte as they were.
  assert.deepEqual(
    Object.keys(after).filter((f) => !(f in before)),
    [path.join(suite, "a.test.ts")],
  );
  assert.deepEqual(
    Object.keys(before).filter((f) => before[f] !== after[f]),
    [],
  );
  for (const file of Object.keys(after))
    if (
      file.includes(`${path.sep}${REQUIREMENT_DIR}${path.sep}`) ||
      file.includes(`${path.sep}${DEFECT_DIR}${path.sep}`)
    )
      assert.doesNotMatch(after[file], /a\.test|@tests|tests:/);
});

test("a reference to a Requirement or a Defect that does not exist is refused", () => {
  const { dir } = repo({
    "a.test.ts": "// @tests requirement nope\n// @tests defect nada\n// @tests requirement d1\n// @tests defect r1\n",
  });
  assert.deepEqual(kaalCaseTests(dir).errors, [
    `${PLACE}/a.test.ts: tests requirement "nope", which names no requirement`,
    `${PLACE}/a.test.ts: tests defect "nada", which names no defect`,
    `${PLACE}/a.test.ts: tests requirement "d1", which names no requirement`,
    `${PLACE}/a.test.ts: tests defect "r1", which names no defect`,
  ]);
});

test("a kind KAAL does not test is refused, including one that only looks like an object property", () => {
  const { dir } = repo({ "a.test.ts": "// @tests plan x\n// @tests constructor x\n// @tests __proto__ x\n" });
  assert.deepEqual(kaalCaseTests(dir).errors, [
    `${PLACE}/a.test.ts: tests plan "x", but a Case may test only requirement or defect`,
    `${PLACE}/a.test.ts: tests constructor "x", but a Case may test only requirement or defect`,
    `${PLACE}/a.test.ts: tests __proto__ "x", but a Case may test only requirement or defect`,
  ]);
});

test("a malformed or duplicate reference is refused", () => {
  const { dir } = repo({ "a.test.ts": "// @tests requirement r1\n// @tests requirement r1\n// @tests requirement\n" });
  assert.deepEqual(kaalCaseTests(dir).errors, [
    `${PLACE}/a.test.ts:2: tests requirement "r1" twice`,
    `${PLACE}/a.test.ts:3: a reference must be "// @tests <kind> <id>"`,
  ]);
});

test("a Requirement id defined twice names no Requirement, so a reference to it is refused", () => {
  const { dir } = repo({ "a.test.ts": "// @tests requirement r1\n" });
  const second = birthChange({ root: path.join(dir, "change"), lineage: "y", occurrence: "26/09/30/01" });
  createRequirement(path.join(second, REQUIREMENT_DIR), "r1", "Again.");
  const errors = kaalCaseTests(dir).errors;
  assert.ok(errors.some((e) => /id "r1" is already defined/.test(e)));
  assert.ok(errors.includes(`${PLACE}/a.test.ts: tests requirement "r1", which names no requirement`));
});

test("supersession is never followed: a Case tests the Requirement it names and nothing it is related to", () => {
  const { dir, born } = repo({ "a.test.ts": "// @tests requirement r1\n" });
  // r2 states, in frontmatter this skill neither reads nor refuses, that it supersedes r1.
  fs.writeFileSync(path.join(born, REQUIREMENT_DIR, "r2.md"), "---\nid: r2\nsupersedes: r1\n---\n\nr2 holds.\n");
  const { cases, errors } = kaalCaseTests(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(casesTestingRequirement(cases, "r1"), [`${PLACE}/a.test.ts`]);
  assert.deepEqual(casesTestingRequirement(cases, "r2"), []);
});

test("Cases are found beneath each Change's test directory directly, whether or not a Suite collects them", () => {
  const { dir, born } = repo({ "a.test.ts": "// @tests requirement r1\n" });
  const test = path.join(born, TEST_DIR);
  // Inside a Suite's subdirectory, with no suite.json of its own.
  fs.mkdirSync(path.join(test, "suite", "inner"));
  fs.writeFileSync(path.join(test, "suite", "inner", "b.test.mjs"), `// @tests defect d1\n${CODE}`);
  // Outside any Suite, with no suite.json anywhere near it.
  fs.mkdirSync(path.join(test, "loose", "deep"), { recursive: true });
  fs.writeFileSync(path.join(test, "loose", "deep", "c.test.cts"), `// @tests requirement r2\n${CODE}`);
  fs.writeFileSync(path.join(test, "d.test.js"), `// @tests requirement nope\n${CODE}`);
  fs.writeFileSync(path.join(test, "not-a-case.ts"), "// @tests requirement nope2\n");
  const base = "change/x/26/09/30/01/test";
  assert.deepEqual(casePlaces(dir), [
    `${base}/d.test.js`,
    `${base}/loose/deep/c.test.cts`,
    `${base}/suite/a.test.ts`,
    `${base}/suite/inner/b.test.mjs`,
  ]);
  const { cases, errors } = kaalCaseTests(dir);
  assert.deepEqual(errors, [`${base}/d.test.js: tests requirement "nope", which names no requirement`]);
  assert.deepEqual(casesTestingRequirement(cases, "r2"), [`${base}/loose/deep/c.test.cts`]);
  assert.deepEqual(casesTestingDefect(cases, "d1"), [`${base}/suite/inner/b.test.mjs`]);
  assert.deepEqual(casesTestingRequirement(cases, "r1"), [`${PLACE}/a.test.ts`]);
});

test("a broken Suite does not hide its Cases' references, and no Suite is needed to see them", () => {
  const { dir, born } = repo({ "a.test.ts": "// @tests requirement missing\n" });
  fs.rmSync(path.join(born, TEST_DIR, "suite", "suite.json"));
  assert.deepEqual(kaalCaseTests(dir).errors, [
    `${PLACE}/a.test.ts: tests requirement "missing", which names no requirement`,
  ]);
});

test("Cases without references are unaffected: they test nothing KAAL knows of and raise no error", () => {
  const { dir } = repo({ "a.test.ts": "// Just prose.\n" });
  const { cases, errors } = kaalCaseTests(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(cases, [{ case: `${PLACE}/a.test.ts`, tests: [] }]);
  assert.deepEqual(casesTesting(cases, "requirement", "r1"), []);
});

test("Testing is independent of Requirements and Defects, and they of Testing", () => {
  const skills = "skills";
  const imports = (dir: string) =>
    fs
      .readdirSync(path.join(skills, dir), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".ts"))
      .flatMap((e) =>
        [...fs.readFileSync(path.join(e.parentPath, e.name), "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]),
      );
  assert.deepEqual(
    imports("testing").filter((i) => /managing-/.test(i)),
    [],
  );
  for (const other of ["managing-requirements", "managing-defects"])
    assert.deepEqual(
      imports(other).filter((i) => /testing/.test(i)),
      [],
      other,
    );
});
