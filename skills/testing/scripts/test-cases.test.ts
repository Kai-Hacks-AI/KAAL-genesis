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
    // Top-level await is only for ES modules: a CommonJS Carrier has none.
    for (const awaited of /\.c[jt]s$/.test(file) ? [""] : ["", "await "]) {
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
  assert.match(
    refused(`new test("n", ${T}, () => {});`)[0],
    /^tests belongs on the options of a top-level Test Case, not on another call \(test is used other than by calling it/,
  );
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
  // A computed key built from literals, templates, + and consts is its name too; one that has to be run is not evaluated.
  const moved = ["tests belongs on the options of a top-level Test Case, not on another call"];
  assert.deepEqual(other('["te" + "sts"]'), moved);
  assert.deepEqual(other("[`te${'sts'}`]"), moved);
  assert.deepEqual(refused('const a = "te";\nconst b = a + "sts";\nhelper({ [b]: 1 });'), moved);
  assert.deepEqual(other("[k]"), []);
  assert.deepEqual(other('["te" + x]'), []);
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

// Review round 3 of #121. Each finding was reproduced first, then its class repaired.

test("every modifier node:test offers, expectFailure included, defines a Test Case the same way, and describe's open a context", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const calls = [
    "expectFailure(",
    "test.expectFailure(",
    "it.expectFailure(",
    "nt.expectFailure(",
    "nt.test.expectFailure(",
    "test?.expectFailure(",
  ];
  for (const call of calls) {
    const source = `import test, { it, expectFailure } from "node:test";\nimport * as nt from "node:test";\n${call}"n", ${T}, () => {});`;
    assert.deepEqual(
      parseTestCases(source, "a.test.ts").cases.map((c) => c.name),
      ["n"],
      call,
    );
  }
  const moved = ["tests belongs on the options of a top-level Test Case, not on another call"];
  assert.deepEqual(
    refused(`import { describe } from "node:test";\ndescribe.expectFailure("s", ${T}, () => {});`),
    moved,
  );
  // getTestContext defines nothing: it is no Test Case, and stating tests on it is refused.
  assert.deepEqual(refused(`import { getTestContext } from "node:test";\ngetTestContext("n", ${T}, () => {});`), moved);
});

test("a name of node:test is trusted only if the Carrier uses it by calling it: a write to it or a member of it is refused", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const claim = `test.only("claim", ${T}, () => {});`;
  const reason = / \(test is used other than by calling it, at line \d+, so it is not trusted to be node:test\)$/;
  const uses = [
    "test.only = helper;",
    "test.only += 1;",
    "test.only++;",
    "delete test.only;",
    "({ x: test.only } = { x: helper });",
    "[test.only] = [helper];",
    "for (test.only of [helper]) {}",
    "(test as any).only = helper;",
    "test!.only = helper;",
    'Object.defineProperty(test, "only", { value: helper });',
    "Object.assign(test, { only: helper });",
    'Reflect.set(test, "only", helper);',
    "const t = test;",
    "const { only } = test;",
    "const o = { test };",
    "const a = [test];",
    "patch(test);",
    "patch(test.only);",
    "export { test as t };",
    "globalThis.t = test;",
    "const f = () => test;",
    "void test.only;",
  ];
  for (const use of uses) {
    const read = parse(`${use}\n${claim}`);
    assert.deepEqual(read.cases, [], use);
    assert.equal(read.errors.length, 1, use);
    assert.match(read.errors[0], reason, use);
  }
  // Calls, member calls and shadowing declarations are the ways a Carrier uses them.
  for (const fine of [
    'test("a", () => {});',
    'test.mock.method(console, "log");',
    'test.describe("s", () => { test.it("i", () => {}); });',
    "function f(test) { return test(1); }",
    "const g = (test) => test(1);",
    "try {} catch (test) {}",
    "const o = { test: 1 };",
    "o.test = 1;",
    "o.test.only = helper;",
  ])
    assert.deepEqual(parse(`${fine}\n${claim}`).errors, [], fine);
  // No scopes are tracked, so a shadowing name used otherwise than by calling it also costs the trust: refused, never inferred.
  assert.equal(parse(`function f(test) { return test; }\n${claim}`).errors.length, 1);
  // Untraced, an untrusted name claims nothing and is not an error.
  assert.deepEqual(parse('const t = test;\ntest.only("n", () => {});'), { cases: [], errors: [] });
  // A named export is a name too, and a namespace.
  assert.equal(
    parseTestCases(`import { skip } from "node:test";\nskip = 1;\nskip("n", ${T}, () => {});`, "a.test.ts").cases
      .length,
    0,
  );
  assert.equal(
    parseTestCases(`import * as nt from "node:test";\nObject.freeze(nt);\nnt.skip("n", ${T}, () => {});`, "a.test.ts")
      .cases.length,
    0,
  );
});

test("require names the CommonJS loader only if the Carrier leaves it alone: written, redeclared or passed, it is not trusted", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const cjs = (head: string) =>
    parseTestCases(`${head}\nconst test = require("node:test");\ntest("claim", ${T}, () => {});`, "a.test.cjs");
  assert.deepEqual(cjs("").errors, []);
  assert.deepEqual(
    cjs("").cases.map((c) => c.name),
    ["claim"],
  );
  for (const head of [
    "require = () => helper;",
    "require = helper;",
    "[require] = [helper];",
    "patch(require);",
    "const r = require;",
    "function require() { return helper; }",
    "var require = helper;",
    "let require;",
    "class require {}",
    "const { require } = helper;",
  ]) {
    const read = cjs(head);
    assert.deepEqual(read.cases, [], head);
    assert.equal(read.errors.length, 1, head);
    assert.match(
      read.errors[0],
      /require is (declared in the Carrier|used other than by calling it, at line \d+), so it is not trusted to be node:test\)$/,
      head,
    );
  }
  // Calling it, and its members, are how a Carrier uses it, and a shadow inside a function is another name.
  for (const head of ['require("path");', 'require.resolve("path");', "function f(require) { return require('x'); }"])
    assert.deepEqual(cjs(head).errors, [], head);
  // An ES import does not rest on require at all.
  assert.deepEqual(parse('function require() {}\ntest("n", { tests: { requirement: ["r"] } }, () => {});').errors, []);
});

// Review round 4 of #121. Each finding was reproduced first, then its class repaired.

test("a call that runs before the declaration binding its name is not a Test Case, while a hoisted import is", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const early = / \((test|skip) is used before its declaration at line 2, so it is not trusted to be node:test\)$/;
  const before = (source: string, file: string) => parseTestCases(source, file);
  for (const [source, file] of [
    [`test("claim", ${T}, () => {});\nconst test = require("node:test");`, "a.test.cjs"],
    [`skip("claim", ${T}, () => {});\nconst { skip } = require("node:test");`, "a.test.cjs"],
    [`test("claim", ${T}, () => {});\nimport test = require("node:test");`, "a.test.cts"],
  ]) {
    const read = before(source, file);
    assert.deepEqual(read.cases, [], source);
    assert.equal(read.errors.length, 1, source);
    assert.match(read.errors[0], early, source);
  }
  // After its declaration it is read; an ES import is hoisted, so a call above it is read too.
  assert.equal(
    before(`const test = require("node:test");\ntest("claim", ${T}, () => {});`, "a.test.cjs").cases.length,
    1,
  );
  assert.equal(before(`test("claim", ${T}, () => {});\nimport test from "node:test";`, "a.test.ts").cases.length, 1);
  // Untraced, an early call claims nothing and is not an error.
  assert.deepEqual(before('test("n", () => {});\nconst test = require("node:test");', "a.test.cjs"), {
    cases: [],
    errors: [],
  });
});

test("every name of node:test, and every other route to it, shares one verdict: one used otherwise untrusts all", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const claim = `test.only("claim", ${T}, () => {});`;
  const names = (source: string) => parseTestCases(source, "a.test.ts");
  const mutated = [
    'import test, { test as alias } from "node:test";\nalias.only = helper;',
    'import test, { it } from "node:test";\nit.only = helper;',
    'import test from "node:test";\nimport * as nt from "node:test";\nnt.test.only = helper;',
    'import test from "node:test";\nimport { skip } from "node:test";\nskip.call = helper;',
  ];
  for (const head of mutated) {
    const read = names(`${head}\n${claim}`);
    assert.deepEqual(read.cases, [], head);
    assert.equal(read.errors.length, 1, head);
    assert.match(read.errors[0], /not trusted to be node:test\)$/, head);
  }
  // Any other route to the same functions: another require, a dynamic import, a lookup by name, a re-export.
  const routes = [
    'require("node:test").only = helper;',
    'import("node:test").then((m) => { m.default.only = helper; });',
    'process.getBuiltinModule("node:test").only = helper;',
    'export { skip } from "node:test";',
    'const { mock } = await import("node:test");',
    'let r = require("node:test");',
  ];
  for (const head of routes) {
    const read = names(`import test from "node:test";\n${head}\n${claim}`);
    assert.deepEqual(read.cases, [], head);
    assert.equal(read.errors.length, 1, head);
    assert.match(
      read.errors[0],
      /node:test is reached other than by the Carrier's own import or const require, at line 2, so it is not trusted to be node:test\)$/,
      head,
    );
  }
  // The Carrier's own declarations are not other routes, however many or of whatever kind: a type import, several imports, a const require.
  for (const fine of [
    'import type { TestContext } from "node:test";',
    'import { type TestContext } from "node:test";',
    'import { skip } from "node:test";',
    'import * as nt from "node:test";',
    'import { it } from "node:test";\nconst x = "node:tests";',
    'const note = "see node:test for details";',
    "const t = require(`node:test`);",
  ])
    assert.equal(names(`import test from "node:test";\n${fine}\n${claim}`).cases.length, 1, fine);
  const cjs = parseTestCases(
    `const test = require("node:test");\nconst { mock } = require("node:test");\n${claim}`,
    "a.test.cjs",
  );
  assert.equal(cjs.cases.length, 1);
  assert.deepEqual(cjs.errors, []);
});

// Review round 5 of #121. Each finding was reproduced first, then its class repaired.

test("require is trusted only if the Carrier declares it nowhere in its own scope: exported, hoisted or enum-like declarations all count", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const cjs = (head: string, file = "a.test.cjs") =>
    parseTestCases(`${head}\nconst test = require("node:test");\ntest("claim", ${T}, () => {});`, file);
  const declared = /require is declared in the Carrier, so it is not trusted to be node:test\)$/;
  for (const head of [
    "export const require = () => helper;",
    "export let require;",
    "export var require = 1;",
    "export function require() {}",
    "export default function require() {}",
    "export class require {}",
    "var require = helper;",
    "if (x) { var require = helper; }",
    "for (var require of [1]) {}",
    "try { var require = 1; } catch {}",
    "{ function require() {} }",
    "label: { var { require } = helper; }",
    "const [require] = [helper];",
    'import require from "./helper.js";',
    'import { helper as require } from "./helper.js";',
    "enum require { A }",
    "namespace require { export const a = 1; }",
    "import require = helper.require;",
  ]) {
    const read = cjs(head, "a.test.cts");
    assert.deepEqual(read.cases, [], head);
    assert.equal(read.errors.length, 1, head);
    assert.match(read.errors[0], declared, head);
  }
  // What does not declare it in this scope leaves it trusted: types, blocks' lexical names, other functions, members.
  for (const head of [
    "declare const require: NodeRequire;",
    "declare function require(id: string): any;",
    "declare var require: any;",
    "{ let require = 1; }",
    "{ const require = 1; }",
    "{ class require {} }",
    "function f(require) { var require = 1; return require(2); }",
    "function g() { var require = 1; }",
    "const h = () => { var require = 1; };",
    "try {} catch (require) {}",
    "class C { require() {} }",
    "const o = { require: 1, require2() {} };",
    "o.require = 1;",
  ]) {
    const read = cjs(head, "a.test.cts");
    assert.deepEqual(read.errors, [], head);
    assert.equal(read.cases.length, 1, head);
  }
});

test("a member reached by a literal computed key is the member: duplicates through it are seen, and an unknown member is refused when traced", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const dup = ["same"].flatMap((name) => [
    `test(${JSON.stringify(name)}, ${T}, () => {});\ntest["test"](${JSON.stringify(name)}, () => {});`,
    `test(${JSON.stringify(name)}, ${T}, () => {});\ntest["skip"](${JSON.stringify(name)}, () => {});`,
    `test(${JSON.stringify(name)}, ${T}, () => {});\ntest?.["it"](${JSON.stringify(name)}, () => {});`,
    `test(${JSON.stringify(name)}, ${T}, () => {});\ntest[\`only\`](${JSON.stringify(name)}, () => {});`,
    `test["test"]["skip"](${JSON.stringify(name)}, ${T}, () => {});\ntest(${JSON.stringify(name)}, () => {});`,
  ]);
  for (const body of dup) {
    const read = parse(body);
    assert.deepEqual(read.cases, [], body);
    assert.equal(read.errors.length, 1, body);
    assert.match(read.errors[0], /Test Case "same" is named more than once$/, body);
  }
  // A literal computed key defines a Test Case like the dot.
  assert.deepEqual(
    parse(`test["skip"]("n", ${T}, () => {});`).cases.map((c) => c.name),
    ["n"],
  );
  // A member known only by evaluating it could be any function node:test offers, or an inherited mutator: calling through one
  // costs the name its trust, so a traced Carrier is refused and an untraced one claims nothing.
  const traced = `test("a", ${T}, () => {});\n`;
  const untrusted = /not trusted to be node:test\)$/;
  for (const call of [
    'test[k]("b", () => {});',
    'test["te" + "st"]("b", () => {});',
    'test[`t${x}`]("b", () => {});',
  ]) {
    const read = parse(`${traced}${call}`);
    assert.deepEqual(read.cases, [], call);
    assert.equal(read.errors.length, 1, call);
    assert.match(read.errors[0], untrusted, call);
  }
  assert.deepEqual(parse(`${traced}test.mock[k]("b");`).errors, []);
  // Untraced, the untrusted name claims nothing: no Test Case is listed and nothing is refused.
  assert.deepEqual(parse('test("a", () => {});\ntest[k]("b", () => {});'), { cases: [], errors: [] });
  // An unbound object's computed members are not node:test's.
  assert.deepEqual(parse(`${traced}other[k]("b", () => {});`).errors, []);
});

// Review round 6 of #121. Each finding was reproduced first, then its class repaired.

test("a call to node:test whose arguments are not written out is refused, once, wherever the spread is", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const spread = "arguments must not be spread, since that could carry tests";
  for (const call of [
    `test("claim", ...[${T}, () => {}]);`,
    `test(...["claim", ${T}, () => {}]);`,
    `test("claim", ...[${T}], () => {});`,
    `test(...args);`,
    `test.skip("claim", ...rest);`,
    `test?.("claim", ...rest);`,
    `await test("claim", ...rest);`,
    `function r() { test("claim", ...[${T}, () => {}]); }`,
    `test("p", async (t) => { await t.test("claim", ...rest); });`,
  ]) {
    const read = parse(call);
    // The outer test of a spread subtest is a Test Case of its own; the spread call itself is none.
    assert.deepEqual(
      read.cases.filter((c) => c.name !== "p"),
      [],
      call,
    );
    assert.deepEqual(
      read.errors.map((e) => e.replace(/^[^:]+:\d+: /, "")),
      [spread],
      call,
    );
  }
  // A spread elsewhere is not a test call's argument list, and a written-out list is read as before.
  assert.deepEqual(parse("console.log(...args);\nfoo(...args);\n").errors, []);
  assert.deepEqual(
    parse(`test("claim", ${T}, () => {});`).cases.map((c) => c.name),
    ["claim"],
  );
  // An argument that is a name could be the function or the options: it is taken to be the function, never evaluated.
  assert.deepEqual(
    parse("test('n', handler);").cases.map((c) => c.name),
    ["n"],
  );
});

test("a specifier built from literals, templates, + and program-level consts is node:test, and any other is not evaluated", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const claim = `test.only("claim", ${T}, () => {});`;
  const route =
    /node:test is reached other than by the Carrier's own import or const require, at line \d+, so it is not trusted to be node:test\)$/;
  for (const head of [
    'require("node:" + "test").only = helper;',
    'require("no" + "de:" + "te" + "st").only = helper;',
    'require(`node:${"test"}`).only = helper;',
    "require(`${'node'}:${'test'}`).only = helper;",
    'const a = "node:";\nconst b = a + "test";\nrequire(b).only = helper;',
    'const p = "node";\nconst s = `${p}:test`;\nrequire(s).only = helper;',
    'import("node:" + "test");',
    'process.getBuiltinModule("node:" + "test").only = helper;',
    'const spec = "node:test";',
  ]) {
    const read = parseTestCases(`import test from "node:test";\n${head}\n${claim}`, "a.test.ts");
    assert.deepEqual(read.cases, [], head);
    assert.equal(read.errors.length, 1, head);
    assert.match(read.errors[0], route, head);
  }
  // Not a route: other modules, near misses, and a specifier that would have to be run to be known (the stated limit).
  for (const head of [
    'require("node:" + "fs");',
    'require("node:te" + "sts");',
    'const a = "node:";\nconst b = a + "fs";\nrequire(b);',
    'let a = "node:";\nconst b = a + "test";',
    'require(["node", "test"].join(":"));',
    "process.getBuiltinModule(spec());",
    'function f(x) { return require("node:" + x); }',
    'require("node:" + 1);',
  ])
    assert.equal(parseTestCases(`import test from "node:test";\n${head}\n${claim}`, "a.test.ts").cases.length, 1, head);
});

// Review round 7 of #121. Each finding was reproduced first, then its class repaired.

test("require is the CommonJS loader only in a Carrier whose name settles it as CommonJS, and CommonJS has no import or export", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const source = `const test = require("node:test");\ntest("claim", ${T}, () => {});`;
  // CommonJS by name: read.
  for (const file of ["a.test.cjs", "a.test.cts"])
    assert.deepEqual(
      parseTestCases(source, file).cases.map((c) => c.name),
      ["claim"],
      file,
    );
  // An ES module has no require; a .js or .ts takes its format from a package this reading is not given.
  for (const [file, reason] of [
    ["a.test.mjs", "require is not defined in an ES module"],
    ["a.test.mts", "require is not defined in an ES module"],
    [
      "a.test.js",
      "the module format of a .js Carrier comes from its package and require is not known to be the CommonJS loader",
    ],
    [
      "a.test.ts",
      "the module format of a .ts Carrier comes from its package and require is not known to be the CommonJS loader",
    ],
  ]) {
    const read = parseTestCases(source, file);
    assert.deepEqual(read.cases, [], file);
    assert.equal(read.errors.length, 1, file);
    assert.ok(
      read.errors[0].endsWith(` (${reason}, so it is not trusted to be node:test)`),
      `${file}: ${read.errors[0]}`,
    );
  }
  // Untraced, an untrusted require claims nothing.
  assert.deepEqual(parseTestCases('const test = require("node:test");\ntest("n", () => {});', "a.test.mjs"), {
    cases: [],
    errors: [],
  });
  // An ES import needs no loader, in any format that has imports.
  for (const file of ["a.test.mjs", "a.test.mts", "a.test.js", "a.test.ts", "a.test.cts"])
    assert.equal(
      parseTestCases(`import test from "node:test";\ntest("claim", ${T}, () => {});`, file).cases.length,
      1,
      file,
    );
  // A .cjs has no import or export declarations: it throws before registering anything.
  for (const head of [
    'import test from "node:test";',
    'import "node:test";',
    "export const x = 1;",
    "export default 1;",
    'export * from "node:fs";',
  ])
    assert.deepEqual(parseTestCases(`${head}\ntest("claim", ${T}, () => {});`, "a.test.cjs"), {
      cases: [],
      errors: ["a.test.cjs:1: ES module syntax in a CommonJS Carrier (import or export declaration)"],
    });
});

test("calling through a name of node:test is a use only through members node:test offers there: an inherited member could be a mutator", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const claim = `test.only("claim", ${T}, () => {});`;
  const untrusted =
    / \((test|it|describe|skip|nt) is used other than by calling it, at line \d+, so it is not trusted to be node:test\)$/;
  const mutating = [
    'test.__defineGetter__("only", () => helper);',
    'test.__defineSetter__("only", helper);',
    'test.test.__defineGetter__("only", () => helper);',
    'test.it.__defineGetter__("only", () => helper);',
    'test["__defineGetter__"]("only", () => helper);',
    'test?.["__defineGetter__"]("only", () => helper);',
    'test[k]("only", () => helper);',
    'test.constructor.defineProperty(test, "only", {});',
    'test.hasOwnProperty("only");',
    'test.call(null, "n", () => {});',
    'test.bind(null)("n");',
    'test.only.call(null, "n", () => {});',
    'test.skip.__defineGetter__("x", () => 1);',
    'test.describe.__defineGetter__("skip", () => helper);',
    'test.describe.skip.call(null, "n");',
    "test.toString();",
    'it.__defineGetter__("only", () => helper);',
    'describe.__defineGetter__("skip", () => helper);',
    'skip.call(null, "n");',
    'nt.test.__defineGetter__("only", () => helper);',
    'nt.__defineGetter__("test", () => helper);',
    'nt.default.__defineGetter__("only", () => helper);',
  ];
  for (const use of mutating) {
    const read = parse(
      `import { it, describe, skip } from "node:test";\nimport * as nt from "node:test";\n${use}\n${claim}`,
    );
    assert.deepEqual(read.cases, [], use);
    assert.equal(read.errors.length, 1, use);
    assert.match(read.errors[0], untrusted, use);
  }
  // Members node:test offers are how a Carrier uses it, however deep: tests, contexts, modifiers, hooks, the mock tracker, the runner.
  for (const fine of [
    'test("a", () => {});',
    'test.test("a", () => {});',
    'test.it.skip("a", () => {});',
    'test.describe("s", () => { test.it("i", () => {}); });',
    'test.describe.skip("s", () => {});',
    'test.suite.only("s", () => {});',
    "test.after(() => {});",
    "test.before(() => {});",
    "test.afterEach(() => {});",
    "test.beforeEach(() => {});",
    'test.mock.method(console, "log");',
    "test.mock.fn().mock.calls.length;",
    "test.mock.timers.enable();",
    'test.snapshot.setResolveSnapshotPath(() => "x");',
    "test.run({ files: [] });",
    "test.assert.ok(true);",
    'test.expectFailure("n", () => {});',
    'test["test"]("a", () => {});',
    'nt.default.skip("a", () => {});',
    'nt.test.todo("a", () => {});',
    'nt.mock.method(console, "log");',
    "nt.after(() => {});",
  ])
    assert.deepEqual(
      parse(`import { it } from "node:test";\nimport * as nt from "node:test";\n${fine}\n${claim}`).errors,
      [],
      fine,
    );
});

// Review round 8 of #121. The finding was reproduced first, then its class repaired.

test("each way of binding node:test is what Node makes it: the namespace is an object, the default is the function, and only the namespace has a default", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const names = (source: string, file = "a.test.mjs") => parseTestCases(source, file).cases.map((c) => c.name);
  // The function, however it is imported.
  for (const head of [
    'import test from "node:test";',
    'import { default as test } from "node:test";',
    'import { default as t } from "node:test";\nconst test = t;',
  ])
    assert.deepEqual(names(`${head}\ntest("n", ${T}, () => {});`), head.includes("const test = t") ? [] : ["n"], head);
  assert.deepEqual(names(`import test = require("node:test");\ntest("n", ${T}, () => {});`, "a.test.cts"), ["n"]);
  assert.deepEqual(names(`const test = require("node:test");\ntest("n", ${T}, () => {});`, "a.test.cjs"), ["n"]);
  // The namespace is an object: calling it registers nothing, so it is no Test Case and, stating tests, is refused.
  const called = parseTestCases(`import * as nt from "node:test";\nnt("n", ${T}, () => {});`, "a.test.mjs");
  assert.deepEqual(called.cases, []);
  assert.deepEqual(
    called.errors.map((e) => e.replace(/^[^:]+:\d+: /, "")),
    [
      "tests belongs on the options of a top-level Test Case, not on another call (nt is the namespace of node:test, an object that cannot be called)",
    ],
  );
  // Its members are what Node exports, and its default is the function.
  for (const call of [
    "nt.default",
    "nt.test",
    "nt.it",
    "nt.skip",
    "nt.only",
    "nt.todo",
    "nt.expectFailure",
    "nt.default.skip",
    "nt.default.test",
    "nt.test.skip",
    "nt.it.todo",
  ])
    assert.deepEqual(names(`import * as nt from "node:test";\n${call}("n", ${T}, () => {});`), ["n"], call);
  // The function has no default of its own, and no other binding has members it lacks: such a call is used otherwise and untrusts.
  for (const head of [
    'import test from "node:test";\ntest.default("n", ${T}, () => {});',
    'const test = require("node:test");\ntest.default("n", ${T}, () => {});',
  ])
    assert.equal(
      parseTestCases(head.replace("${T}", T), head.startsWith("const") ? "a.test.cjs" : "a.test.mjs").cases.length,
      0,
      head,
    );
  assert.deepEqual(names('import test from "node:test";\ntest.test.default("n", () => {});'), []);
  // A namespace beside a default import: each is what it is.
  assert.deepEqual(
    names(`import test, * as nt from "node:test";\ntest("a", ${T}, () => {});\nnt.test("b", ${T}, () => {});`),
    ["a", "b"],
  );
});

// Review round 9 of #121. The finding was reproduced first, then its class repaired.

test("syntax that only an ES module has, at the top of a CommonJS Carrier, is refused: it throws before registering anything", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const R = 'const test = require("node:test");\n';
  const claim = `test("claim", ${T}, () => {});`;
  for (const [head, what] of [
    [`await test("claim", ${T}, () => {});`, "top-level await"],
    ["await 1;", "top-level await"],
    ["const x = await y;", "top-level await"],
    ["for await (const x of y) {}", "top-level await"],
    ["if (x) { await y; }", "top-level await"],
    ["label: { await y; }", "top-level await"],
    ["const u = import.meta.url;", "import.meta"],
    ["if (x) { import.meta; }", "import.meta"],
  ]) {
    for (const file of ["a.test.cjs", "a.test.cts"]) {
      const read = parseTestCases(`${R}${head}\n${claim}`, file);
      assert.deepEqual(
        read,
        { cases: [], errors: [`${file}:2: ES module syntax in a CommonJS Carrier (${what})`] },
        `${file}: ${head}`,
      );
    }
  }
  // A function is its own scope, where await is its own; and an ES module has top-level await.
  for (const fine of [
    "async function f() { await 1; for await (const x of y) {} }",
    "const g = async () => { await 1; };",
    "const o = { async m() { await 1; } };",
    "class C { async m() { await 1; } static async s() { await 1; } }",
  ])
    assert.equal(parseTestCases(`${R}${fine}\n${claim}`, "a.test.cjs").cases.length, 1, fine);
  for (const file of ["a.test.mjs", "a.test.mts", "a.test.ts", "a.test.js"])
    assert.deepEqual(
      parseTestCases(`import test from "node:test";\nawait test("claim", ${T}, () => {});`, file).cases.map(
        (c) => c.name,
      ),
      ["claim"],
      file,
    );
  // A .cts may import and export, which TypeScript compiles; a .cjs may not.
  assert.equal(parseTestCases(`import test from "node:test";\n${claim}`, "a.test.cts").cases.length, 1);
});

// Review round 10 of #121. Each finding was reproduced first, then its class repaired.

test("require is trusted only if the Carrier leaves the loader it delegates to alone: module, the module system and the main module", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const C = `const test = require("node:test");\ntest("claim", ${T}, () => {});`;
  const reach =
    /\(the CommonJS loader is reachable and changeable: (module is used other than for its own exports|the module system is named|process\.mainModule is used|process\.getBuiltinModule is used|mainModule is used|getBuiltinModule is used), at line \d+, so it is not trusted to be node:test\)$/;
  for (const head of [
    "module.require = () => helper;",
    "module['require'] = () => helper;",
    "module[`require`] = () => helper;",
    "module[k] = () => helper;",
    "module.constructor._load = () => helper;",
    "module.constructor.prototype.require = () => helper;",
    "module.parent.require = () => helper;",
    "module.__proto__.require = () => helper;",
    "Object.getPrototypeOf(module).require = () => helper;",
    "patch(module);",
    "const m = module;",
    'require("module").prototype.require = () => helper;',
    'require("node:module")._load = () => helper;',
    'require("node:" + "module")._load = () => helper;',
    'const spec = "node:" + "module";\nrequire(spec)._load = () => helper;',
    'process.getBuiltinModule("node:module")._load = () => helper;',
    "process.mainModule.require = () => helper;",
    "process['mainModule'].require = () => helper;",
    "process.mainModule.constructor._load = () => helper;",
  ]) {
    const read = parseTestCases(`${head}\n${C}`, "a.test.cjs");
    assert.deepEqual(read.cases, [], head);
    assert.equal(read.errors.length, 1, head);
    assert.match(read.errors[0], reach, head);
  }
  // No scopes are tracked, so a shadowing module that reaches for require is refused too, never inferred.
  assert.equal(parseTestCases(`function f(module) { return module.require; }\n${C}`, "a.test.cjs").errors.length, 1);
  // A module system imported in a .cts is named too.
  const imported = parseTestCases(
    `import Module from "node:module";\nModule.prototype.require = () => helper;\n${C}`,
    "a.test.cts",
  );
  assert.deepEqual(imported.cases, []);
  assert.match(imported.errors[0], reach);
  // A Carrier's own exports and facts about itself leave the loader alone.
  for (const fine of [
    "module.exports = { a: 1 };",
    "module.exports.a = 1;",
    "const id = module.id;",
    "const f = module.filename + module.path;",
    "if (module.loaded) {}",
    "const ps = module.paths.length + module.children.length;",
    "function f(module) { return module.exports; }",
    "const o = { module: 1, mainModule2: 2 };",
    "o.module = 1;",
    'const note = "see node:modules";',
    "require.resolve('x');",
  ])
    assert.deepEqual(parseTestCases(`${fine}\n${C}`, "a.test.cjs").errors, [], fine);
  // An ES import does not delegate to module.require, so none of this concerns it.
  assert.deepEqual(
    parseTestCases(
      `import test from "node:test";\nmodule.require = () => helper;\ntest("claim", ${T}, () => {});`,
      "a.test.mjs",
    ).errors,
    [],
  );
});

test("an exported declaration binds node:test as the same declaration does without export", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const names = (source: string, file = "a.test.cts") => parseTestCases(source, file).cases.map((c) => c.name);
  assert.deepEqual(names(`export const test = require("node:test");\ntest("n", ${T}, () => {});`), ["n"]);
  assert.deepEqual(
    names(
      `export const { skip, only: o } = require("node:test");\nskip("n", ${T}, () => {});\no("m", ${T}, () => {});`,
    ),
    ["n", "m"],
  );
  assert.deepEqual(names(`export import test = require("node:test");\ntest("n", ${T}, () => {});`), ["n"]);
  assert.deepEqual(
    names(`export const test = require("node:test");\nexport const other = 1;\ntest("n", ${T}, () => {});`),
    ["n"],
  );
  // The same rules apply to it: a call before it, and a write to it, are refused.
  const early = parseTestCases(`test("n", ${T}, () => {});\nexport const test = require("node:test");`, "a.test.cts");
  assert.deepEqual(early.cases, []);
  assert.match(
    early.errors[0],
    /test is used before its declaration at line 2, so it is not trusted to be node:test\)$/,
  );
  const written = parseTestCases(
    `export const test = require("node:test");\ntest.only = helper;\ntest.only("n", ${T}, () => {});`,
    "a.test.cts",
  );
  assert.deepEqual(written.cases, []);
  assert.equal(written.errors.length, 1);
});

// Review round 11 of #121. Each finding was reproduced first, then its class repaired.

test("the module system is named only where a module is loaded: a string that happens to say so reaches nothing", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const R = 'const test = require("node:test");\n';
  // Valid Carriers that merely contain the words: a test named module, an id named module, notes, other calls' arguments.
  for (const [body, file] of [
    [`test("module", ${T}, () => {});`, "a.test.cjs"],
    [`test("node:module", ${T}, () => {});`, "a.test.cjs"],
    ['test("n", { tests: { requirement: ["module", "node:module"] } }, () => {});', "a.test.cts"],
    [`const note = "node:module";\ntest("n", ${T}, () => {});`, "a.test.cjs"],
    [`const spec = "node:" + "module";\ntest("n", ${T}, () => {});`, "a.test.cjs"],
    [`console.log("module", \`node:\${"module"}\`);\ntest("n", ${T}, () => {});`, "a.test.cjs"],
    [`path.join("a", "module");\nassert.equal(x, "node:module");\ntest("n", ${T}, () => {});`, "a.test.cjs"],
    [`const o = { module: "node:module" };\ntest("n", ${T}, () => {});`, "a.test.cjs"],
    [`require("node:path");\nrequire("modules");\ntest("n", ${T}, () => {});`, "a.test.cjs"],
    [`import("node:fs");\ntest("n", ${T}, () => {});`, "a.test.cjs"],
    [`test.describe("module", () => { test.it("node:module", () => {}); });\ntest("n", ${T}, () => {});`, "a.test.cjs"],
  ] as const) {
    const read = parseTestCases(`${R}${body}`, file);
    assert.deepEqual(read.errors, [], body);
    assert.ok(read.cases.length > 0, body);
  }
  // Where a module is loaded, however its specifier is built, it is the module system.
  const named =
    / \(the CommonJS loader is reachable and changeable: the module system is named, at line \d+, so it is not trusted to be node:test\)$/;
  for (const head of [
    'require("module");',
    'require("node:module");',
    "require(`node:module`);",
    'require("node:" + "module");',
    'require(`${"node"}:module`);',
    'const a = "node:";\nconst b = a + "module";\nrequire(b);',
    'import("node:module");',
    'import("node:" + "module");',
    'const { createRequire } = require("node:module");',
    'require?.("module");',
  ]) {
    const read = parseTestCases(`${head}\n${R}test("claim", ${T}, () => {});`, "a.test.cjs");
    assert.deepEqual(read.cases, [], head);
    assert.equal(read.errors.length, 1, head);
    assert.match(read.errors[0], named, head);
  }
  for (const head of [
    'import Module from "node:module";',
    'import { createRequire } from "node:module";',
    'export * from "node:module";',
    'import m = require("node:module");',
  ])
    assert.match(
      parseTestCases(`${head}\n${R}test("claim", ${T}, () => {});`, "a.test.cts").errors[0] ?? "",
      named,
      head,
    );
});

test("a name built from literals, templates, + and consts is its name wherever a name matters: members, keys and tests alike", () => {
  const T = '{ tests: { requirement: ["r"] } }';
  const R = 'const test = require("node:test");\n';
  const reach =
    /\(the CommonJS loader is reachable and changeable: [^)]*, at line \d+, so it is not trusted to be node:test\)$/;
  for (const head of [
    'process["main" + "Module"].constructor._load = () => helper;',
    'const k = "mainModule";\nprocess[k].constructor._load = () => helper;',
    "process[`mainModule`].constructor._load = () => helper;",
    'process[`main${"Module"}`].constructor._load = () => helper;',
    'const p = "main";\nconst q = p + "Module";\nprocess[q].constructor._load = () => helper;',
    'process?.["main" + "Module"]?.constructor;',
    "const { mainModule } = process;",
    "const { getBuiltinModule: g } = process;",
    'const o = { ["main" + "Module"]: 1 };',
    'process.getBuiltinModule("anything");',
    'process["get" + "BuiltinModule"]("x");',
    'module["req" + "uire"] = () => helper;',
    'const k = "require";\nmodule[k] = () => helper;',
  ]) {
    const read = parseTestCases(`${head}\n${R}test("claim", ${T}, () => {});`, "a.test.cjs");
    assert.deepEqual(read.cases, [], head);
    assert.equal(read.errors.length, 1, head);
    assert.match(read.errors[0], reach, head);
  }
  // A name built so is still its name when it is a safe one, and a name built by running something is not evaluated.
  for (const fine of [
    'module["exp" + "orts"] = 1;',
    'const e = "exports";\nmodule[e] = 1;',
    "const m = { mainModule2: 1, main: 2 };",
    'process["main" + x];',
    "process[`main${x}`];",
  ])
    assert.deepEqual(parseTestCases(`${fine}\n${R}test("claim", ${T}, () => {});`, "a.test.cjs").errors, [], fine);
});
