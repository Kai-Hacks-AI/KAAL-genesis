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
  kaalTestCases,
  TEST_DIR,
  testCasesTestingDefect,
  testCasesTestingRequirement,
} from "./test-cases.js";
import { DEFECT_DIR } from "./defects.js";
import { REQUIREMENT_DIR } from "./requirements.js";

// KAAL composes Testing with Requirements and Defects: a Test Case states what
// it tests; KAAL checks that what it names exists. Nothing is written into the
// Requirement or the Defect.
const IMPORT = 'import test from "node:test";\n';

/** One Test Case, named `name`, stating `tests` as the option's literal source, or nothing. */
const tc = (name: string, tests?: string) => `test("${name}", ${tests ? `{ tests: ${tests} }, ` : ""}() => {});\n`;

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
/** A Test Case's identity, as its one line. */
const id = (carrier: string, name: string) => testCaseId({ carrier, name });
const PLACE = `${BASE}/suite`;

test("KAAL's own Test Cases state only references to Requirements and Defects that exist", () => {
  assert.deepEqual(kaalTestCases().errors, []);
});

test("a Test Case can test a Requirement, a Defect, and several of each; several Test Cases can test the same", () => {
  const { dir } = repo({
    "a.test.ts": tc("reqs", '{ requirement: ["r1"] }') + tc("defect", '{ defect: ["d1"] }'),
    "b.test.ts":
      tc("many", '{ requirement: ["r1", "r2"], defect: ["d1", "d2"] }') +
      tc("none") +
      tc("again", '{ requirement: ["r1"] }'),
  });
  const { cases, errors } = kaalTestCases(dir);
  assert.deepEqual(errors, []);
  assert.equal(cases.length, 5);
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

test("traceability is of the Test Case: Test Cases of one Carrier test different things", () => {
  const { dir } = repo({
    "a.test.ts": tc("first", '{ requirement: ["r1"] }') + tc("second", '{ requirement: ["r2"] }'),
  });
  const { cases } = kaalTestCases(dir);
  assert.deepEqual(testCasesTestingRequirement(cases, "r1"), [id(`${PLACE}/a.test.ts`, "first")]);
  assert.deepEqual(testCasesTestingRequirement(cases, "r2"), [id(`${PLACE}/a.test.ts`, "second")]);
});

test("testing a Requirement or a Defect modifies neither, and leaves no reverse registry behind", () => {
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

test("a reference to a Requirement or a Defect that does not exist is refused", () => {
  const { dir } = repo({
    "a.test.ts": tc("bad", '{ requirement: ["nope", "d1"], defect: ["nada", "r1"] }'),
  });
  assert.deepEqual(kaalTestCases(dir).errors, [
    `${PLACE}/a.test.ts: "bad" tests requirement "nope", which names no requirement`,
    `${PLACE}/a.test.ts: "bad" tests requirement "d1", which names no requirement`,
    `${PLACE}/a.test.ts: "bad" tests defect "nada", which names no defect`,
    `${PLACE}/a.test.ts: "bad" tests defect "r1", which names no defect`,
  ]);
});

test("a kind KAAL does not test is refused, including one that only looks like an object property", () => {
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

test("what Testing refuses in a Carrier is refused here, with the Carrier's path: duplicates, nesting, computed metadata", () => {
  const { dir } = repo({
    "a.test.ts": tc("dup", '{ requirement: ["r1", "r1"] }'),
    "b.test.ts": `for (const k of [1]) { ${tc("nested", '{ requirement: ["r1"] }')} }`,
    "c.test.ts": 'const t = { requirement: ["r1"] };\ntest("computed", { tests: t }, () => {});\n',
  });
  const errors = kaalTestCases(dir).errors;
  assert.equal(errors.length, 3);
  assert.match(errors[0], new RegExp(`^${PLACE}/a\\.test\\.ts:2: tests requirement "r1" twice$`));
  assert.match(
    errors[1],
    new RegExp(`^${PLACE}/b\\.test\\.ts:\\d+: tests belongs on the options of a top-level Test Case`),
  );
  assert.match(errors[2], new RegExp(`^${PLACE}/c\\.test\\.ts:3: tests must be an object literal`));
});

test("a Requirement id defined twice names no Requirement, so a reference to it is refused", () => {
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
  fs.writeFileSync(
    path.join(root, "loose", "deep", "c.test.cts"),
    'import test = require("node:test");\n' + tc("loose", '{ requirement: ["r2"] }'),
  );
  fs.writeFileSync(path.join(root, "d.test.js"), IMPORT + tc("bad", '{ requirement: ["nope"] }'));
  fs.writeFileSync(path.join(root, "not-a-carrier.ts"), IMPORT + tc("ignored", '{ requirement: ["nope2"] }'));
  assert.deepEqual(carrierPlaces(dir), [
    `${BASE}/d.test.js`,
    `${BASE}/loose/deep/c.test.cts`,
    `${BASE}/suite/a.test.ts`,
    `${BASE}/suite/inner/b.test.mjs`,
  ]);
  const { cases, errors } = kaalTestCases(dir);
  assert.deepEqual(errors, [`${BASE}/d.test.js: "bad" tests requirement "nope", which names no requirement`]);
  assert.deepEqual(testCasesTestingRequirement(cases, "r2"), [id(`${BASE}/loose/deep/c.test.cts`, "loose")]);
  assert.deepEqual(testCasesTestingDefect(cases, "d1"), [id(`${BASE}/suite/inner/b.test.mjs`, "inner")]);
  assert.deepEqual(testCasesTestingRequirement(cases, "r1"), [id(`${PLACE}/a.test.ts`, "in suite")]);
});

test("a broken Suite does not hide its Test Cases' references, and no Suite is needed to see them", () => {
  const { dir, born } = repo({ "a.test.ts": tc("one", '{ requirement: ["missing"] }') });
  fs.rmSync(path.join(born, TEST_DIR, "suite", "suite.json"));
  assert.deepEqual(kaalTestCases(dir).errors, [
    `${PLACE}/a.test.ts: "one" tests requirement "missing", which names no requirement`,
  ]);
});

test("Test Cases without references are unaffected: they test nothing KAAL knows of and raise no error", () => {
  const { dir } = repo({ "a.test.ts": tc("plain") });
  const { cases, errors } = kaalTestCases(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(cases, [{ carrier: `${PLACE}/a.test.ts`, name: "plain", tests: [] }]);
  assert.deepEqual(testCasesTesting(cases, "requirement", "r1"), []);
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

// Review round 1 of #121: the findings as KAAL meets them.
test("a Test Case defined by a named skip, only or todo export, or awaited, is validated like any other", () => {
  const { dir } = repo({
    "a.test.ts":
      'import { skip, todo } from "node:test";\nskip("skipped", { tests: { requirement: ["missing"] } }, () => {});\nawait todo("later", { tests: { defect: ["r1"] } }, () => {});\n',
  });
  assert.deepEqual(kaalTestCases(dir).errors, [
    `${PLACE}/a.test.ts: "skipped" tests requirement "missing", which names no requirement`,
    `${PLACE}/a.test.ts: "later" tests defect "r1", which names no defect`,
  ]);
});

test("a duplicate or computed tests option cannot hide a reference from validation", () => {
  const { dir } = repo({
    "a.test.ts": tc("n", '{ requirement: ["r1"] }').replace(
      "{ tests:",
      '{ tests: { requirement: ["missing"] }, tests:',
    ),
    "b.test.ts": 'test("m", { tests: { requirement: ["r1"] }, ["tests"]() {} }, () => {});\n',
  });
  const errors = kaalTestCases(dir).errors.map((e) => e.replace(/^.*\/(\w\.test\.ts):\d+: /, "$1: "));
  assert.deepEqual(errors, [
    "a.test.ts: tests is stated twice",
    "b.test.ts: options must not compute keys, since that could carry tests",
  ]);
});

test("reverse lookup prints one identity per line, each naming its carrier and name, whatever the name holds", () => {
  const { dir } = repo({
    "a.test.ts":
      tc("line1\\nline2", '{ requirement: ["r1"] }') +
      tc("plain", '{ requirement: ["r1"] }') +
      tc("\\u2028sep", '{ requirement: ["r1"] }'),
  });
  const { cases, errors } = kaalTestCases(dir);
  assert.deepEqual(errors, []);
  const lines = testCasesTestingRequirement(cases, "r1").join("\n").split("\n");
  assert.equal(lines.length, 3);
  assert.deepEqual(
    lines.map((line) => JSON.parse(line)),
    [
      [`${PLACE}/a.test.ts`, "line1\nline2"],
      [`${PLACE}/a.test.ts`, "plain"],
      [`${PLACE}/a.test.ts`, " sep"],
    ],
  );
});

// Review round 2 of #121: the findings as KAAL meets them.
test("an optional call is validated, and a reassigned binding or a template key cannot make a reference vanish", () => {
  const { dir, born } = repo({
    "a.test.ts": 'test?.("opt", { tests: { requirement: ["missing"] } }, () => {});\n',
    "c.test.ts":
      'function register() { test("n", { [`tests`]: { requirement: ["missing"] } }, () => {}); }\nregister();\n',
  });
  // Written without the import the helper adds, since a CommonJS binding is the point.
  fs.writeFileSync(
    path.join(born, TEST_DIR, "suite", "b.test.cjs"),
    'let test = require("node:test");\ntest = helper;\ntest("c", { tests: { requirement: ["r1"] } }, () => {});\n',
  );
  const errors = kaalTestCases(dir).errors.map((e) =>
    e.replace(/^.*\/(\w\.test\.\w+):\d+: /, "$1: ").replace(`${PLACE}/`, ""),
  );
  assert.deepEqual([...errors].sort(), [
    'a.test.ts: "opt" tests requirement "missing", which names no requirement',
    "b.test.cjs: tests belongs on the options of a top-level Test Case, not on another call",
    "c.test.ts: options must not compute keys, since that could carry tests",
  ]);
});

// Review round 3 of #121: the findings as KAAL meets them.
test("a Test Case defined by expectFailure is validated, and an overwritten node:test member or require cannot vouch for a reference", () => {
  const { dir, born } = repo({
    "a.test.ts":
      'import { expectFailure } from "node:test";\nexpectFailure("fails", { tests: { requirement: ["missing"] } }, () => {});\n',
  });
  const suite = path.join(born, TEST_DIR, "suite");
  fs.writeFileSync(
    path.join(suite, "b.test.ts"),
    'import test from "node:test";\ntest.only = helper;\ntest.only("c", { tests: { requirement: ["r1"] } }, () => {});\n',
  );
  fs.writeFileSync(
    path.join(suite, "c.test.cjs"),
    'require = () => helper;\nconst test = require("node:test");\ntest("d", { tests: { requirement: ["r1"] } }, () => {});\n',
  );
  const errors = kaalTestCases(dir).errors.map((e) => e.replace(`${PLACE}/`, "").replace(/:\d+: /, ": "));
  assert.deepEqual([...errors].sort(), [
    'a.test.ts: "fails" tests requirement "missing", which names no requirement',
    "b.test.ts: tests belongs on the options of a top-level Test Case, not on another call (test is used other than by calling it, at line 2, so it is not trusted to be node:test)",
    "c.test.cjs: tests belongs on the options of a top-level Test Case, not on another call (require is used other than by calling it, at line 1, so it is not trusted to be node:test)",
  ]);
});

// Review round 4 of #121: the findings as KAAL meets them.
test("a call before its const require, or beside a second route to node:test, cannot vouch for a reference", () => {
  const { dir, born } = repo({
    "a.test.ts":
      'import { test as alias } from "node:test";\nalias.only = helper;\ntest.only("c", { tests: { requirement: ["r1"] } }, () => {});\n',
  });
  fs.writeFileSync(
    path.join(born, TEST_DIR, "suite", "b.test.cjs"),
    'test("d", { tests: { requirement: ["r1"] } }, () => {});\nconst test = require("node:test");\n',
  );
  const errors = kaalTestCases(dir).errors.map((e) => e.replace(`${PLACE}/`, "").replace(/:\d+: /, ": "));
  assert.deepEqual([...errors].sort(), [
    "a.test.ts: tests belongs on the options of a top-level Test Case, not on another call (alias is used other than by calling it, at line 3, so it is not trusted to be node:test)",
    "b.test.cjs: tests belongs on the options of a top-level Test Case, not on another call (test is used before its declaration at line 2, so it is not trusted to be node:test)",
  ]);
});

// Review round 5 of #121: the findings as KAAL meets them.
test("an exported require declaration, or a computed member call through node:test, cannot vouch for a reference or hide a duplicate", () => {
  const { dir, born } = repo({
    "a.test.ts": 'test("same", { tests: { requirement: ["r1"] } }, () => {});\ntest["test"]("same", () => {});\n',
  });
  fs.writeFileSync(
    path.join(born, TEST_DIR, "suite", "b.test.cts"),
    'export const require = () => helper;\nconst test = require("node:test");\ntest("c", { tests: { requirement: ["r1"] } }, () => {});\n',
  );
  const errors = kaalTestCases(dir).errors.map((e) => e.replace(`${PLACE}/`, "").replace(/:\d+: /, ": "));
  assert.deepEqual([...errors].sort(), [
    'a.test.ts: Test Case "same" is named more than once',
    "b.test.cts: tests belongs on the options of a top-level Test Case, not on another call (require is declared in the Carrier, so it is not trusted to be node:test)",
  ]);
});

// Review round 6 of #121: the findings as KAAL meets them.
test("a spread argument list or a constant-built route to node:test cannot vouch for a reference", () => {
  const { dir, born } = repo({
    "a.test.ts": 'test("claim", ...[{ tests: { requirement: ["missing"] } }, () => {}]);\n',
  });
  fs.writeFileSync(
    path.join(born, TEST_DIR, "suite", "b.test.cjs"),
    'const test = require("node:test");\nrequire("node:" + "test").only = helper;\ntest.only("c", { tests: { requirement: ["r1"] } }, () => {});\n',
  );
  const errors = kaalTestCases(dir).errors.map((e) => e.replace(`${PLACE}/`, "").replace(/:\d+: /, ": "));
  assert.deepEqual([...errors].sort(), [
    "a.test.ts: arguments must not be spread, since that could carry tests",
    "b.test.cjs: tests belongs on the options of a top-level Test Case, not on another call (node:test is reached other than by the Carrier's own import or const require, at line 2, so it is not trusted to be node:test)",
  ]);
});

// Review round 7 of #121: the findings as KAAL meets them.
test("a require in an ES module, or an inherited mutator called on node:test, cannot vouch for a reference", () => {
  const { dir, born } = repo({
    "a.test.ts":
      'test.__defineGetter__("only", () => helper);\ntest.only("c", { tests: { requirement: ["r1"] } }, () => {});\n',
  });
  fs.writeFileSync(
    path.join(born, TEST_DIR, "suite", "b.test.mjs"),
    'const test = require("node:test");\ntest("d", { tests: { requirement: ["r1"] } }, () => {});\n',
  );
  const errors = kaalTestCases(dir).errors.map((e) => e.replace(`${PLACE}/`, "").replace(/:\d+: /, ": "));
  assert.deepEqual([...errors].sort(), [
    "a.test.ts: tests belongs on the options of a top-level Test Case, not on another call (test is used other than by calling it, at line 2, so it is not trusted to be node:test)",
    "b.test.mjs: tests belongs on the options of a top-level Test Case, not on another call (require is not defined in an ES module, so it is not trusted to be node:test)",
  ]);
});

// Review round 8 of #121: the finding as KAAL meets it.
test("calling the namespace of node:test cannot vouch for a reference", () => {
  const { dir, born } = repo({});
  fs.writeFileSync(
    path.join(born, TEST_DIR, "suite", "a.test.mjs"),
    'import * as nt from "node:test";\nnt("claim", { tests: { requirement: ["r1"] } }, () => {});\n',
  );
  const { cases, errors } = kaalTestCases(dir);
  assert.deepEqual(cases, []);
  assert.deepEqual(
    errors.map((e) => e.replace(`${PLACE}/`, "").replace(/:\d+: /, ": ")),
    [
      "a.test.mjs: tests belongs on the options of a top-level Test Case, not on another call (nt is the namespace of node:test, an object that cannot be called)",
    ],
  );
});

// Review round 9 of #121: the finding as KAAL meets it.
test("a top-level await in a CommonJS Carrier cannot vouch for a reference", () => {
  const { dir, born } = repo({});
  fs.writeFileSync(
    path.join(born, TEST_DIR, "suite", "a.test.cjs"),
    'const test = require("node:test");\nawait test("claim", { tests: { requirement: ["r1"] } }, () => {});\n',
  );
  const { cases, errors } = kaalTestCases(dir);
  assert.deepEqual(cases, []);
  assert.deepEqual(
    errors.map((e) => e.replace(`${PLACE}/`, "")),
    ["a.test.cjs:2: ES module syntax in a CommonJS Carrier (top-level await)"],
  );
});
