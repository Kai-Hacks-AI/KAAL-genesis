import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { birthChange } from "../skills/managing-change/scripts/birth.js";
import { createDefect } from "../skills/managing-defects/scripts/create.js";
import { createRequirement } from "../skills/managing-requirements/scripts/create.js";
import { testCaseId, testCasesTesting } from "../skills/testing/scripts/test-cases.js";
import {
  carrierPlaces,
  currentTestCasesTestingRequirement,
  kaalTestCases,
  TEST_DIR,
  testCasesTestingDefect,
  testCasesTestingRequirement,
} from "./test-cases.js";
import { DEFECT_DIR } from "./defects.js";
import { REQUIREMENT_DIR } from "./requirements.js";

// KAAL composes Testing with Requirements and Defects: a Test Case declares what
// it tests; KAAL checks that what it names exists. Nothing is written into the
// Requirement or the Defect.
const IMPORT = 'import test from "node:test";\n';

/** One canonical declaration, named `name`, declaring `tests` as the option's literal source, or an ordinary test with none. */
const tc = (name: string, tests?: string) => `test("${name}", ${tests ? `{ tests: ${tests} }` : "{}"}, () => {});\n`;

/** A repository with one Change holding Requirements `r1`, `r2`, Defects `d1`, `d2` and a Suite of the given Carriers. */
function repo(carriers: Record<string, string>): { dir: string; born: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-test-cases-"));
  const born = birthChange({ root: path.join(dir, "change"), lineage: "x", occurrence: "26/09/30/01" });
  for (const id of ["r1", "r2"]) createRequirement(path.join(born, REQUIREMENT_DIR), id, `${id} holds.`);
  for (const id of ["d1", "d2"]) createDefect(path.join(born, DEFECT_DIR), id, `${id} holds.`, `${id} did not.`);
  const suite = path.join(born, TEST_DIR, "suite");
  fs.mkdirSync(suite, { recursive: true });
  fs.writeFileSync(path.join(suite, "suite.json"), JSON.stringify({ concern: "Scratch." }));
  for (const [name, body] of Object.entries(carriers)) fs.writeFileSync(path.join(suite, name), `${IMPORT}${body}`);
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

const BASE = "change/x/26/09/30/01/test";
const PLACE = `${BASE}/suite`;
/** A Test Case's identity, as its one line. */
const id = (carrier: string, name: string) => testCaseId({ carrier, name });
/** An error with its Carrier's path and line left out. */
const short = (e: string) => e.replace(`${PLACE}/`, "").replace(/:\d+: /, ": ");

test("KAAL's own Test Cases declare only references to Requirements and Defects that exist", () => {
  assert.deepEqual(kaalTestCases().errors, []);
});

test("a Test Case can declare it tests a Requirement, a Defect, and several of each; several Test Cases can test the same", () => {
  const { dir } = repo({
    "a.test.ts": tc("reqs", '{ requirement: ["r1"] }') + tc("defect", '{ defect: ["d1"] }'),
    "b.test.ts":
      tc("many", '{ requirement: ["r1", "r2"], defect: ["d1", "d2"] }') +
      tc("ordinary") +
      tc("again", '{ requirement: ["r1"] }'),
  });
  const { cases, errors } = kaalTestCases(dir);
  assert.deepEqual(errors, []);
  assert.equal(cases.length, 4);
  assert.deepEqual(testCasesTestingRequirement(cases, "r1"), [
    id(`${PLACE}/a.test.ts`, "reqs"),
    id(`${PLACE}/b.test.ts`, "many"),
    id(`${PLACE}/b.test.ts`, "again"),
  ]);
  assert.deepEqual(testCasesTestingRequirement(cases, "r2"), [id(`${PLACE}/b.test.ts`, "many")]);
  assert.deepEqual(testCasesTestingDefect(cases, "d1"), [
    id(`${PLACE}/a.test.ts`, "defect"),
    id(`${PLACE}/b.test.ts`, "many"),
  ]);
  assert.deepEqual(testCasesTestingDefect(cases, "d2"), [id(`${PLACE}/b.test.ts`, "many")]);
  assert.deepEqual(testCasesTestingRequirement(cases, "d1"), []);
});

test("traceability is of the Test Case: Test Cases of one Carrier declare different things", () => {
  const { dir } = repo({
    "a.test.ts": tc("first", '{ requirement: ["r1"] }') + tc("second", '{ requirement: ["r2"] }'),
  });
  const { cases } = kaalTestCases(dir);
  assert.deepEqual(testCasesTestingRequirement(cases, "r1"), [id(`${PLACE}/a.test.ts`, "first")]);
  assert.deepEqual(testCasesTestingRequirement(cases, "r2"), [id(`${PLACE}/a.test.ts`, "second")]);
});

test("declaring a Requirement or a Defect modifies neither, and leaves no reverse registry behind", () => {
  const { dir, born } = repo({});
  const before = dirTree(dir);
  const suite = path.join(born, TEST_DIR, "suite");
  fs.writeFileSync(path.join(suite, "a.test.ts"), IMPORT + tc("one", '{ requirement: ["r1"], defect: ["d1"] }'));
  const { cases, errors } = kaalTestCases(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(testCasesTestingRequirement(cases, "r1"), [id(`${PLACE}/a.test.ts`, "one")]);
  const after = dirTree(dir);
  // Only the Carrier was added: Requirements, Defects and everything else are byte for byte as they were.
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
      assert.doesNotMatch(after[file], /a\.test|tests/);
});

test("a declaration of a Requirement or a Defect that does not exist is refused", () => {
  const { dir } = repo({ "a.test.ts": tc("bad", '{ requirement: ["nope", "d1"], defect: ["nada", "r1"] }') });
  assert.deepEqual(kaalTestCases(dir).errors, [
    `${PLACE}/a.test.ts: "bad" tests requirement "nope", which names no requirement`,
    `${PLACE}/a.test.ts: "bad" tests requirement "d1", which names no requirement`,
    `${PLACE}/a.test.ts: "bad" tests defect "nada", which names no defect`,
    `${PLACE}/a.test.ts: "bad" tests defect "r1", which names no defect`,
  ]);
});

test("a kind KAAL does not allow is refused, including one that only looks like an object property", () => {
  const { dir } = repo({ "a.test.ts": tc("kinds", '{ plan: ["x"], constructor: ["x"], "__proto__": ["x"] }') });
  assert.deepEqual(
    kaalTestCases(dir).errors.map((e) => e.replace(`${PLACE}/a.test.ts: "kinds" `, "")),
    [
      'tests plan "x", but a Test Case may test only requirement or defect',
      'tests constructor "x", but a Test Case may test only requirement or defect',
      'tests __proto__ "x", but a Test Case may test only requirement or defect',
    ],
  );
});

test("what Testing refuses in a canonical declaration is refused here, with the Carrier's path: malformed, repeated, ambiguous", () => {
  const { dir } = repo({
    "a.test.ts": tc("dup", '{ requirement: ["r1", "r1"] }'),
    "b.test.ts": tc("same", '{ requirement: ["r1"] }') + tc("same", '{ requirement: ["r2"] }'),
    "c.test.ts": 'test("twice", { tests: { requirement: ["r1"] }, tests: { requirement: ["r2"] } }, () => {});\n',
  });
  assert.deepEqual(
    kaalTestCases(dir).errors.map(short).sort(),
    [
      'b.test.ts: Test Case "same" is traced more than once',
      'b.test.ts: Test Case "same" is traced more than once',
      'a.test.ts: tests requirement "r1" twice',
      "c.test.ts: tests is stated twice",
    ].sort(),
  );
});

test("a Requirement id defined twice names no Requirement, so a declaration of it is refused", () => {
  const { dir } = repo({ "a.test.ts": tc("one", '{ requirement: ["r1"] }') });
  const second = birthChange({ root: path.join(dir, "change"), lineage: "y", occurrence: "26/09/30/01" });
  createRequirement(path.join(second, REQUIREMENT_DIR), "r1", "Again.");
  const errors = kaalTestCases(dir).errors;
  assert.ok(errors.some((e) => /id "r1" is already defined/.test(e)));
  assert.ok(errors.includes(`${PLACE}/a.test.ts: "one" tests requirement "r1", which names no requirement`));
});

test("supersession is never followed: a Test Case tests the Requirement it names and nothing it is related to", () => {
  const { dir, born } = repo({ "a.test.ts": tc("one", '{ requirement: ["r1"] }') });
  // r2 states, in frontmatter this skill neither reads nor refuses, that it supersedes r1.
  fs.writeFileSync(path.join(born, REQUIREMENT_DIR, "r2.md"), "---\nid: r2\nsupersedes: r1\n---\n\nr2 holds.\n");
  const { cases, errors } = kaalTestCases(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(testCasesTestingRequirement(cases, "r1"), [id(`${PLACE}/a.test.ts`, "one")]);
  assert.deepEqual(testCasesTestingRequirement(cases, "r2"), []);
});

test("Carriers are found beneath each Change's test directory directly, whether or not a Suite collects them", () => {
  const { dir, born } = repo({ "a.test.ts": tc("in suite", '{ requirement: ["r1"] }') });
  const root = path.join(born, TEST_DIR);
  // Inside a Suite's subdirectory, with no suite.json of its own.
  fs.mkdirSync(path.join(root, "suite", "inner"));
  fs.writeFileSync(path.join(root, "suite", "inner", "b.test.mjs"), IMPORT + tc("inner", '{ defect: ["d1"] }'));
  // Outside any Suite, with no suite.json anywhere near it.
  fs.mkdirSync(path.join(root, "loose", "deep"), { recursive: true });
  fs.writeFileSync(path.join(root, "loose", "deep", "c.test.mts"), IMPORT + tc("loose", '{ requirement: ["r2"] }'));
  fs.writeFileSync(path.join(root, "d.test.js"), IMPORT + tc("bad", '{ requirement: ["nope"] }'));
  fs.writeFileSync(path.join(root, "not-a-carrier.ts"), IMPORT + tc("ignored", '{ requirement: ["nope2"] }'));
  assert.deepEqual(carrierPlaces(dir), [
    `${BASE}/d.test.js`,
    `${BASE}/loose/deep/c.test.mts`,
    `${BASE}/suite/a.test.ts`,
    `${BASE}/suite/inner/b.test.mjs`,
  ]);
  const { cases, errors } = kaalTestCases(dir);
  assert.deepEqual(errors, [`${BASE}/d.test.js: "bad" tests requirement "nope", which names no requirement`]);
  assert.deepEqual(testCasesTestingRequirement(cases, "r2"), [id(`${BASE}/loose/deep/c.test.mts`, "loose")]);
  assert.deepEqual(testCasesTestingDefect(cases, "d1"), [id(`${BASE}/suite/inner/b.test.mjs`, "inner")]);
  assert.deepEqual(testCasesTestingRequirement(cases, "r1"), [id(`${PLACE}/a.test.ts`, "in suite")]);
});

test("a broken Suite does not hide its Test Cases' declarations, and no Suite is needed to see them", () => {
  const { dir, born } = repo({ "a.test.ts": tc("one", '{ requirement: ["missing"] }') });
  fs.rmSync(path.join(born, TEST_DIR, "suite", "suite.json"));
  assert.deepEqual(kaalTestCases(dir).errors, [
    `${PLACE}/a.test.ts: "one" tests requirement "missing", which names no requirement`,
  ]);
});

test("ordinary Node tests are neither read nor refused, in whatever form: only the canonical declaration is KAAL's concern", () => {
  const { dir, born } = repo({ "a.test.ts": tc("plain") });
  const suite = path.join(born, TEST_DIR, "suite");
  fs.writeFileSync(
    path.join(suite, "b.test.cjs"),
    'const test = require("node:test");\ntest("claim", { tests: { requirement: ["nope"] } }, () => {});\ntest.skip("s", { tests: { defect: ["nope"] } }, () => {});\n',
  );
  fs.writeFileSync(
    path.join(suite, "c.test.ts"),
    'import { it, describe } from "node:test";\nit("claim", { tests: { requirement: ["nope"] } }, () => {});\nawait describe("s", { tests: {} }, () => {});\nconst o = { tests: "anything" };\n',
  );
  const { cases, errors } = kaalTestCases(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(cases, []);
  assert.deepEqual(testCasesTesting(cases, "requirement", "r1"), []);
});

test("Testing is independent of Requirements and Defects, and they of Testing", () => {
  const imports = (dir: string) =>
    fs
      .readdirSync(path.join("skills", dir), { recursive: true, withFileTypes: true })
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

test("a later Change's Test Case supersedes an earlier one: both test the Requirement, the later is current, and the earlier Change is not touched", () => {
  const { dir, born } = repo({ "one.test.ts": tc("how", '{ requirement: ["r1"] }') });
  const earlier = dirTree(born);
  const later = birthChange({ root: path.join(dir, "change"), lineage: "x", occurrence: "26/09/30/02" });
  fs.mkdirSync(path.join(later, TEST_DIR, "next"), { recursive: true });
  fs.writeFileSync(
    path.join(later, TEST_DIR, "next", "two.test.ts"),
    `${IMPORT}test("how again", { tests: { requirement: ["r1"] }, supersedes: ["change/x/26/09/30/01/test/suite/one.test.ts", "how"] }, () => {});\n`,
  );
  const { cases, errors } = kaalTestCases(dir);
  assert.deepEqual(errors, []);
  const [one, two] = cases.map(testCaseId);
  assert.deepEqual(testCasesTestingRequirement(cases, "r1"), [one, two]);
  assert.deepEqual(currentTestCasesTestingRequirement(cases, "r1"), [two]);
  assert.deepEqual(dirTree(born), earlier, "the earlier Change holds exactly what it held");
});

test("a lineage that names no Test Case of any Change, or drops what the earlier tested, is refused", () => {
  const { dir, born } = repo({ "one.test.ts": tc("how", '{ requirement: ["r1"] }') });
  fs.writeFileSync(
    path.join(born, TEST_DIR, "suite", "two.test.ts"),
    `${IMPORT}test("a", { tests: { requirement: ["r2"] }, supersedes: ["change/x/26/09/30/01/test/suite/one.test.ts", "how"] }, () => {});\n` +
      `test("b", { tests: { requirement: ["r1"] }, supersedes: ["nowhere.test.ts", "x"] }, () => {});\n`,
  );
  const { errors } = kaalTestCases(dir);
  assert.ok(
    errors.some((e) => /does not test requirement "r1"/.test(e)),
    errors.join("\n"),
  );
  assert.ok(
    errors.some((e) => /names no Test Case/.test(e)),
    errors.join("\n"),
  );
});
