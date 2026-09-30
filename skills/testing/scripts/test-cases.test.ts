import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseTestCases, readTestCases, testCaseId, testCasesTesting, type TestCase } from "./test-cases.js";

const IMPORT = 'import test from "node:test";\n';
const parse = (body: string, file = "a.test.ts") => parseTestCases(`${IMPORT}${body}`, file);
const refused = (body: string, file = "a.test.ts") =>
  parse(body, file).errors.map((e) => e.replace(/^[^:]+:\d+: /, ""));

test("a Test Case states what it tests in the literal tests option of its node:test call: kinds, each with ids, in order", () => {
  const { cases, errors } = parse(`
test("works offline", { timeout: 5000, tests: { requirement: ["works-offline", "survives-restart"], defect: ["check-leaves"] } }, () => {});
test("states nothing", () => {});
test("only options", { skip: false }, () => {});
`);
  assert.deepEqual(errors, []);
  assert.deepEqual(cases, [
    {
      carrier: "a.test.ts",
      name: "works offline",
      tests: [
        { kind: "requirement", id: "works-offline" },
        { kind: "requirement", id: "survives-restart" },
        { kind: "defect", id: "check-leaves" },
      ],
    },
    { carrier: "a.test.ts", name: "states nothing", tests: [] },
    { carrier: "a.test.ts", name: "only options", tests: [] },
  ]);
  assert.equal(testCaseId(cases[0]), "a.test.ts::works offline");
});

test("a Test Case's identity is its carrier and its decoded literal name, however the call is written", () => {
  const { cases, errors } = parse(`
test(
  'it says "hi"\\n',
  {
    // a comment in the options is not the trace
    "tests": { "requirement": [ "a" ] },
  },
  async () => {},
);
test(\`a template name\`, { tests: { requirement: ["b"] } }, () => {});
`);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    cases.map((c) => c.name),
    ['it says "hi"\n', "a template name"],
  );
  assert.deepEqual(
    cases.map((c) => c.tests),
    [[{ kind: "requirement", id: "a" }], [{ kind: "requirement", id: "b" }]],
  );
});

test("Test Cases are read from syntax: test calls and tests options inside strings, templates and comments are nothing", () => {
  const { cases, errors } = parse(`
const SRC = 'import test from "node:test";\\ntest("in a string", { tests: { requirement: ["x"] } }, () => {});';
const MORE = \`
test("in a template", { tests: { requirement: ["y"] } }, () => {});
\`;
// test("in a comment", { tests: { requirement: ["z"] } }, () => {});
/*
test("in a block comment", { tests: { requirement: ["w"] } }, () => {});
*/
test("the only one", () => {});
`);
  assert.deepEqual(errors, []);
  assert.deepEqual(cases, [{ carrier: "a.test.ts", name: "the only one", tests: [] }]);
});

test("the node:test binding is resolved, not matched by text: aliases, it, modifiers, require, import equals, namespace", () => {
  const tc = (source: string, file: string) => parseTestCases(source, file).cases.map((c) => c.name);
  const t = '("n", { tests: { requirement: ["r"] } }, () => {});';
  assert.deepEqual(tc(`import tt from "node:test";\ntt${t}`, "a.test.ts"), ["n"]);
  assert.deepEqual(
    tc(`import { test as tt, it } from "node:test";\ntt${t}\nit${t.replace('"n"', '"m"')}`, "a.test.ts"),
    ["n", "m"],
  );
  assert.deepEqual(
    tc(`import test from "node:test";\ntest.skip${t}\ntest.todo${t.replace('"n"', '"m"')}`, "a.test.ts"),
    ["n", "m"],
  );
  assert.deepEqual(tc(`const test = require("node:test");\ntest${t}`, "a.test.cjs"), ["n"]);
  assert.deepEqual(tc(`const { test: tt } = require("node:test");\ntt${t}`, "a.test.cjs"), ["n"]);
  assert.deepEqual(tc(`import test = require("node:test");\ntest${t}`, "a.test.cts"), ["n"]);
  assert.deepEqual(tc(`import * as nt from "node:test";\nnt.test${t}`, "a.test.mts"), ["n"]);
  assert.deepEqual(tc(`function test(a, b, c) {}\ntest${t}`, "a.test.js"), []);
  assert.deepEqual(tc(`import test from "other";\ntest${t}`, "a.test.js"), []);
});

test("a Carrier is JavaScript or TypeScript by its extension", () => {
  const call = 'test("n", { tests: { requirement: ["r"] } }, (t: unknown) => {});\n';
  assert.equal(parseTestCases(`${IMPORT}${call}`, "a.test.ts").cases.length, 1);
  assert.match(parseTestCases(`${IMPORT}${call}`, "a.test.js").errors[0], /^a\.test\.js: unparseable carrier/);
  assert.equal(parseTestCases(`${IMPORT}${call.replace(": unknown", "")}`, "a.test.mjs").cases.length, 1);
});

test("the tests option is admitted by TypeScript and ignored by Node", { tests: { requirement: ["x"] } }, () => {
  assert.ok(true);
});

test("refuses tests where it is not on a top-level Test Case with a literal name", () => {
  const t = "{ tests: { requirement: ['r'] } }";
  assert.deepEqual(refused(`test(\`n \${1}\`, ${t}, () => {});`), [
    "a Test Case that states what it tests must have a literal name",
  ]);
  assert.deepEqual(refused(`const n = "x"; test(n, ${t}, () => {});`), [
    "a Test Case that states what it tests must have a literal name",
  ]);
  const nested = ["tests belongs on a top-level Test Case, not on a nested or other call"];
  assert.deepEqual(refused(`for (const k of [1]) { test("n", ${t}, () => {}); }`), nested);
  assert.deepEqual(refused(`function f() { test("n", ${t}, () => {}); }`), nested);
  assert.deepEqual(refused(`test("p", async (c) => { await c.test("n", ${t}, () => {}); });`), nested);
  assert.deepEqual(refused(`import { describe } from "node:test";\ndescribe("s", ${t}, () => {});`), nested);
  assert.deepEqual(
    refused(`import { describe, it } from "node:test";\ndescribe("s", () => { it("n", ${t}, () => {}); });`),
    nested,
  );
  assert.deepEqual(refused(`(async () => { await test("n", ${t}, () => {}); })();`), nested);
});

test("refuses options that are not a literal object, or that could hide tests", () => {
  assert.deepEqual(refused('const o = {};\ntest("n", o, () => {});'), ["options must be an object literal"]);
  assert.deepEqual(refused('const o = {};\ntest("n", { ...o }, () => {});'), [
    "options must not spread or compute keys, since that could carry tests",
  ]);
  assert.deepEqual(refused('const tests = {};\ntest("n", { tests }, () => {});'), [
    "tests must be an object literal of kinds, each a list of ids",
  ]);
  assert.deepEqual(refused('test("n", { ["tests"]: { requirement: ["r"] } }, () => {});'), [
    "options must not spread or compute keys, since that could carry tests",
  ]);
});

test("refuses tests that is not a literal of kinds, each a non-empty list of distinct string ids", () => {
  const one = (value: string) => refused(`test("n", { tests: ${value} }, () => {});`);
  assert.deepEqual(one("[]"), ["tests must be an object literal of kinds, each a list of ids"]);
  assert.deepEqual(one("{}"), ["tests must name at least one kind"]);
  assert.deepEqual(one("{ requirement: [] }"), ["tests requirement must name at least one id"]);
  assert.deepEqual(one('{ requirement: "a" }'), ["tests requirement must be a list of ids"]);
  assert.deepEqual(one('{ requirement: ["a", "a"] }'), ['tests requirement "a" twice']);
  assert.deepEqual(one('{ requirement: ["a"], requirement: ["b"] }'), ["tests names kind requirement twice"]);
  assert.deepEqual(one("{ requirement: [id] }"), ["tests requirement ids must be string literals without whitespace"]);
  assert.deepEqual(one("{ requirement: [`a${1}`] }"), [
    "tests requirement ids must be string literals without whitespace",
  ]);
  assert.deepEqual(one('{ requirement: ["a b"] }'), [
    "tests requirement ids must be string literals without whitespace",
  ]);
  assert.deepEqual(one('{ requirement: ["", "a"] }'), [
    "tests requirement ids must be string literals without whitespace",
  ]);
  assert.deepEqual(one("{ ...more }"), ["a kind must be a plain name, never computed, spread or blank"]);
  assert.deepEqual(one('{ [k]: ["a"] }'), ["a kind must be a plain name, never computed, spread or blank"]);
  assert.deepEqual(one('{ "": ["a"] }'), ["a kind must be a plain name, never computed, spread or blank"]);
});

test("a name an annotated Test Case shares with another is refused and names no single Test Case", () => {
  const { cases, errors } = parse(`
test("same", { tests: { requirement: ["a"] } }, () => {});
test("same", () => {});
test("alone", () => {});
`);
  assert.deepEqual(
    cases.map((c) => c.name),
    ["alone"],
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^a\.test\.ts:3: Test Case "same" is named more than once$/);
  // Unannotated repeats claim nothing, so they are not an error here; they simply are not referencable.
  const plain = parse('test("same", () => {});\ntest("same", () => {});');
  assert.deepEqual(plain.errors, []);
  assert.deepEqual(plain.cases, []);
});

test("refuses a Carrier that does not parse, and names the line of each error", () => {
  assert.match(parseTestCases("test(", "a.test.ts").errors[0], /^a\.test\.ts: unparseable carrier \(/);
  const { errors } = parse('\n\ntest("n", { tests: { requirement: [] } }, () => {});');
  assert.match(errors[0], /^a\.test\.ts:4: /);
});

test("many Test Cases of one Carrier, and of many, test the same identity; reverse lookup is computed from them", () => {
  const a = parse(`
test("one", { tests: { requirement: ["r"] } }, () => {});
test("two", { tests: { requirement: ["r", "q"], defect: ["r"] } }, () => {});
test("three", () => {});
`).cases;
  const b = parseTestCases(`${IMPORT}test("one", { tests: { requirement: ["r"] } }, () => {});`, "b.test.ts").cases;
  const all: TestCase[] = [...a, ...b];
  assert.deepEqual(testCasesTesting(all, "requirement", "r"), ["a.test.ts::one", "a.test.ts::two", "b.test.ts::one"]);
  assert.deepEqual(testCasesTesting(all, "requirement", "q"), ["a.test.ts::two"]);
  assert.deepEqual(testCasesTesting(all, "defect", "r"), ["a.test.ts::two"]);
  assert.deepEqual(testCasesTesting(all, "requirement", "none"), []);
  assert.deepEqual(testCasesTesting([], "requirement", "r"), []);
});

test("reads a Carrier from its file, and says when it cannot", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "test-cases-"));
  const file = path.join(dir, "a.test.ts");
  fs.writeFileSync(file, `${IMPORT}test("n", { tests: { requirement: ["a"] } }, () => {});\n`);
  assert.deepEqual(readTestCases(file, "x/a.test.ts"), {
    cases: [{ carrier: "x/a.test.ts", name: "n", tests: [{ kind: "requirement", id: "a" }] }],
    errors: [],
  });
  const missing = readTestCases(path.join(dir, "none.test.ts"), "none.test.ts");
  assert.deepEqual(missing.cases, []);
  assert.match(missing.errors[0], /^none\.test\.ts: unreadable carrier \(/);
});

test("Testing keeps no reverse registry, reads without executing or writing, and stays independent of Requirements and Defects", () => {
  const scripts = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  for (const name of fs.readdirSync(scripts).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
    const source = fs.readFileSync(path.join(scripts, name), "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(
      imports.filter((i) => /managing-|requirement|defect/i.test(i)),
      [],
      name,
    );
  }
  const reader = fs.readFileSync(path.join(scripts, "test-cases.ts"), "utf8");
  assert.doesNotMatch(reader, /writeFileSync|writeFile\(|child_process|import\(|\beval\(|new Function/);
  assert.deepEqual(
    fs.readdirSync(scripts).filter((n) => /index|registry|reverse/i.test(n)),
    [],
  );
});
