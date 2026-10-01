import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NODE_TEST, parseTestCases, readTestCases, testCaseId, testCasesTesting, type TestCase } from "./test-cases.js";

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
  assert.equal(testCaseId(cases[0]), '["a.test.ts","works offline"]');
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
    "a Test Case that states what it tests must have a literal, non-empty name",
  ]);
  assert.deepEqual(refused(`const n = "x"; test(n, ${t}, () => {});`), [
    "a Test Case that states what it tests must have a literal, non-empty name",
  ]);
  const nested = ["tests belongs on the options of a top-level Test Case, not on another call"];
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
    "options must not spread, since that could carry tests",
  ]);
  assert.deepEqual(refused('const tests = {};\ntest("n", { tests }, () => {});'), [
    "tests must be an object literal of kinds, each a list of ids",
  ]);
  assert.deepEqual(refused('test("n", { ["tests"]: { requirement: ["r"] } }, () => {});'), [
    "options must not compute keys, since that could carry tests",
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
  assert.deepEqual(testCasesTesting(all, "requirement", "r"), [
    testCaseId({ carrier: "a.test.ts", name: "one" }),
    testCaseId({ carrier: "a.test.ts", name: "two" }),
    testCaseId({ carrier: "b.test.ts", name: "one" }),
  ]);
  assert.deepEqual(testCasesTesting(all, "requirement", "q"), [testCaseId({ carrier: "a.test.ts", name: "two" })]);
  assert.deepEqual(testCasesTesting(all, "defect", "r"), [testCaseId({ carrier: "a.test.ts", name: "two" })]);
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

// Review round 1 of #121. Each finding below was reproduced first, then its class repaired.

test("every export and member of the running node:test is classified, so none this skill cannot read goes unnoticed", async () => {
  const module = await import("node:test");
  const classified = new Set<string>([...NODE_TEST.test, ...NODE_TEST.other, ...NODE_TEST.ignored]);
  const exports = Object.keys(module);
  const members = [...Object.keys(module.test), ...Object.keys(module.it)];
  assert.deepEqual(
    [...new Set([...exports, ...members])].filter((name) => !classified.has(name)),
    [],
  );
  assert.deepEqual(
    Object.keys(module.describe).filter((name) => !["skip", "only", "todo"].includes(name)),
    [],
  );
});

test("every way node:test offers to define a Test Case is read: named exports, members, awaited, each binding", () => {
  const forms: [string, string, string][] = [
    ['import { skip } from "node:test";', "skip", "a.test.ts"],
    ['import { only } from "node:test";', "only", "a.test.ts"],
    ['import { todo } from "node:test";', "todo", "a.test.ts"],
    ['import { skip as s } from "node:test";', "s", "a.test.ts"],
    ['import { it } from "node:test";', "it", "a.test.ts"],
    ['import { it } from "node:test";', "it.skip", "a.test.ts"],
    ['import test from "node:test";', "test.only", "a.test.ts"],
    ['import test from "node:test";', "test.test", "a.test.ts"],
    ['import test from "node:test";', "test.it", "a.test.ts"],
    ['import test from "node:test";', "test.skip", "a.test.ts"],
    ['import * as nt from "node:test";', "nt.skip", "a.test.ts"],
    ['import * as nt from "node:test";', "nt.it", "a.test.ts"],
    ['import * as nt from "node:test";', "nt.test.todo", "a.test.ts"],
    ['const { skip } = require("node:test");', "skip", "a.test.cjs"],
    ['const { only: o, todo } = require("node:test");', "o", "a.test.cjs"],
    ['const nt = require("node:test");', "nt.skip", "a.test.cjs"],
    ['import test = require("node:test");', "test.todo", "a.test.cts"],
  ];
  for (const [head, callee, file] of forms)
    for (const awaited of ["", "await "]) {
      const { cases, errors } = parseTestCases(
        `${head}\n${awaited}${callee}("n", { tests: { requirement: ["r"] } }, () => {});`,
        file,
      );
      assert.deepEqual(
        { form: `${awaited}${callee}`, errors, names: cases.map((c) => c.name) },
        { form: `${awaited}${callee}`, errors: [], names: ["n"] },
      );
    }
});

test("describe and suite open contexts, which are not Test Cases, and their modifiers too", () => {
  for (const callee of ["describe", "describe.skip", "suite", "suite.only"])
    assert.deepEqual(
      refused(
        `import { describe, suite } from "node:test";\n${callee}("s", { tests: { requirement: ["r"] } }, () => {});`,
      ),
      ["tests belongs on the options of a top-level Test Case, not on another call"],
    );
});

test("a call that states tests and is not a recognized Test Case is refused, never silently dropped", () => {
  const moved = "tests belongs on the options of a top-level Test Case, not on another call";
  assert.deepEqual(refused('const t = test;\nt("n", { tests: { requirement: ["r"] } }, () => {});'), [moved]);
  assert.deepEqual(refused('helper("n", { tests: { requirement: ["r"] } });'), [moved]);
  assert.deepEqual(refused('test({ tests: { requirement: ["r"] } }, () => {});'), [moved]);
  assert.deepEqual(
    refused('test("n", { tests: { requirement: ["r"] } }, () => {}, { tests: { requirement: ["q"] } });'),
    [moved],
  );
  assert.deepEqual(refused('void test("n", { tests: { requirement: ["r"] } }, () => {});'), [moved]);
  assert.deepEqual(parse('const t = test;\nt("n", { timeout: 1 }, () => {});').errors, []);
});

test("an options object is read only through plain properties: every other member that could carry tests is refused", () => {
  const one = (options: string) => refused(`test("n", ${options}, () => {});`);
  const plain = '{ requirement: ["r"] }';
  assert.deepEqual(one(`{ tests: ${plain}, tests: ${plain} }`), ["tests is stated twice"]);
  assert.deepEqual(one(`{ tests: ${plain}, "tests": { requirement: ["missing"] } }`), ["tests is stated twice"]);
  assert.deepEqual(one(`{ tests: ${plain}, ["tests"]() {} }`), [
    "options must not compute keys, since that could carry tests",
  ]);
  assert.deepEqual(one(`{ ["tests"]() {} }`), ["options must not compute keys, since that could carry tests"]);
  assert.deepEqual(one(`{ [k]: 1 }`), ["options must not compute keys, since that could carry tests"]);
  assert.deepEqual(one(`{ [k]() {} }`), ["options must not compute keys, since that could carry tests"]);
  assert.deepEqual(one(`{ tests: ${plain}, tests() {} }`), [
    "tests must be a plain property, not a method or accessor",
  ]);
  assert.deepEqual(one(`{ get tests() { return ${plain}; } }`), [
    "tests must be a plain property, not a method or accessor",
  ]);
  assert.deepEqual(one(`{ set tests(v) {} }`), ["tests must be a plain property, not a method or accessor"]);
  assert.deepEqual(one(`{ tests: ${plain}, ...o }`), ["options must not spread, since that could carry tests"]);
  // Plain members other than tests, however written, are Node's and do not matter.
  for (const fine of ["{ timeout: 1 }", "{ skip() {}, get x() { return 1; }, 1: 2, 'a-b': 3 }", "{ async f() {} }"])
    assert.deepEqual(one(fine), []);
});

test("Node reports a test without a literal, non-empty name by its function or as <anonymous>, so traced Test Cases need every test named", () => {
  const traced = 'test("traced", { tests: { requirement: ["r"] } }, () => {});\n';
  const unnamed = "a Carrier with traced Test Cases must give every top-level test a literal, non-empty name";
  assert.deepEqual(refused(`${traced}test("", () => {});`), [unnamed]);
  assert.deepEqual(refused(`${traced}test("<anonymous>", () => {});\ntest("", () => {});`), [unnamed]);
  assert.deepEqual(refused(`${traced}test(() => {});`), [unnamed]);
  assert.deepEqual(refused(`${traced}test(name, () => {});`), [unnamed]);
  assert.deepEqual(refused(`${traced}test(\`a \${x}\`, () => {});`), [unnamed]);
  assert.deepEqual(refused('test("", { tests: { requirement: ["r"] } }, () => {});'), [
    "a Test Case that states what it tests must have a literal, non-empty name",
  ]);
  // No traced Test Case, nothing to identify: such a Carrier is read as before, and names no empty Test Case.
  const untraced = parse('test("", () => {});\ntest(() => {});\ntest(name, () => {});\ntest("named", () => {});');
  assert.deepEqual(untraced.errors, []);
  assert.deepEqual(
    untraced.cases.map((c) => c.name),
    ["named"],
  );
});

test("a Test Case's identity is one line, whatever its name holds, and names its carrier and name exactly", () => {
  const names = [
    "line1\nline2",
    "carriage\rreturn",
    "\u2028separator",
    "\u2029and\u0085next",
    'quote " and \\ backslash',
    "::",
    '", "',
    "tab\tand unicode é\u{1f600}",
  ];
  const { cases, errors } = parse(
    names.map((n) => `test(${JSON.stringify(n)}, { tests: { requirement: ["r"] } }, () => {});`).join("\n"),
    "dir/a::b.test.ts",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(
    cases.map((c) => c.name),
    names,
  );
  const ids = testCasesTesting(cases, "requirement", "r");
  assert.equal(ids.length, names.length);
  for (const [index, line] of ids.entries()) {
    assert.doesNotMatch(line, /[\n\r\u0085\u2028\u2029]/);
    assert.deepEqual(JSON.parse(line), ["dir/a::b.test.ts", names[index]]);
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.join("\n").split("\n").length, names.length);
});

// Review round 2 of #121. Each finding was reproduced first, then its class repaired.

test("an optional call or member of node:test defines a Test Case like the plain one, and one nested or applied by new is refused", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  for (const call of ["test?.(", "test?.skip(", "test.skip?.(", "test?.only?.(", "await test?.("])
    assert.deepEqual(
      parse(`${call}"n", ${T}, () => {});`).cases.map((c) => c.name),
      ["n"],
      call,
    );
  const moved = ["tests belongs on the options of a top-level Test Case, not on another call"];
  assert.deepEqual(refused(`function r() { test?.("n", ${T}, () => {}); }`), moved);
  assert.deepEqual(refused(`new test("n", ${T}, () => {});`), moved);
  assert.deepEqual(refused(`(0, test)("n", ${T}, () => {});`), moved);
  assert.deepEqual(refused(`test("p", async (t) => { await t?.test("n", ${T}, () => {}); });`), moved);
});

test("a key is the name its syntax gives it: literal and template keys, computed or not, cannot hide tests", () => {
  const nested = (key: string) => refused(`function r() { test("n", { ${key}: { requirement: ["r"] } }, () => {}); }`);
  const computed = ["options must not compute keys, since that could carry tests"];
  assert.deepEqual(nested("[`tests`]"), computed);
  assert.deepEqual(nested('["tests"]'), computed);
  assert.deepEqual(nested("['tests']"), computed);
  assert.deepEqual(nested("[tests]"), computed);
  assert.deepEqual(nested('"tests"'), ["tests belongs on the options of a top-level Test Case, not on another call"]);
  // Unregistered calls are read by syntax alone: a literal or template key is the name, any other expression is not evaluated.
  const other = (key: string) => refused(`helper({ ${key}: 1 });`);
  assert.deepEqual(other("[`tests`]"), ["tests belongs on the options of a top-level Test Case, not on another call"]);
  assert.deepEqual(other('["tests"]'), ["tests belongs on the options of a top-level Test Case, not on another call"]);
  assert.deepEqual(other("[k]"), []);
  assert.deepEqual(other('["te" + "sts"]'), []);
  assert.deepEqual(other("[`te${k}`]"), []);
  // A call that registers a test never hides a key behind an expression, evaluated or not.
  assert.deepEqual(nested('["te" + "sts"]'), computed);
  assert.deepEqual(refused('test("n", { ["te" + "sts"]: 1 }, () => {});'), computed);
  assert.deepEqual(refused('test("p", async (t) => { await t.test("n", { ...o }, () => {}); });'), [
    "options must not spread, since that could carry tests",
  ]);
});

test("only a const binding of node:test is trusted: a let, a var, or a reassigned name is not a Test Case and is refused", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const moved = ["tests belongs on the options of a top-level Test Case, not on another call"];
  const cjs = (source: string) => parseTestCases(source, "a.test.cjs");
  const names = (source: string) => cjs(source).cases.map((c) => c.name);
  assert.deepEqual(names(`const test = require("node:test");\ntest("n", ${T}, () => {});`), ["n"]);
  assert.deepEqual(
    names(`const { test, skip: s } = require("node:test");\ntest("n", ${T}, () => {});\ns("m", ${T}, () => {});`),
    ["n", "m"],
  );
  for (const head of [
    'let test = require("node:test");\ntest = helper;',
    'let test = require("node:test");\nfunction swap() { test = helper; }\nswap();',
    'var test = require("node:test");\nvar test = helper;',
    'var test = require("node:test");',
    'let test = require("node:test");',
    'let { test } = require("node:test");',
  ]) {
    const read = cjs(`${head}\ntest("n", ${T}, () => {});`);
    assert.deepEqual(read.cases, [], head);
    assert.deepEqual(
      read.errors.map((e) => e.replace(/^[^:]+:\d+: /, "")),
      moved,
      head,
    );
  }
  // Untraced, an untrusted binding claims nothing and is not an error.
  assert.deepEqual(cjs('let test = require("node:test");\ntest("n", () => {});'), { cases: [], errors: [] });
  // An ES import is immutable, so it is always trusted.
  assert.deepEqual(
    parse(`test("n", ${T}, () => {});`).cases.map((c) => c.name),
    ["n"],
  );
});
