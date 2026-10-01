import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseTestCases, readTestCases, testCaseId, testCasesTesting, type TestCase } from "./test-cases.js";

const IMPORT = 'import test from "node:test";\n';
const T = '{ tests: { requirement: ["r"] } }';
const parse = (body: string, file = "a.test.ts") => parseTestCases(`${IMPORT}${body}`, file);
const read = (source: string, file = "a.test.ts") => parseTestCases(source, file);
const names = (source: string, file = "a.test.ts") => read(source, file).cases.map((c) => c.name);
const bare = (message: string) => message.replace(/^[^:]+:\d+: /, "");

test("a Test Case declares what it tests in the literal tests option of a canonical call: kinds, each with ids, in order", () => {
  const { cases, errors } = parse(`
test("works offline", { timeout: 5000, tests: { requirement: ["works-offline", "survives-restart"], defect: ["check-leaves"] } }, () => {});
test("states nothing", { timeout: 1 }, () => {});
test("also", { tests: { "requirement": ["x"] } }, async function () {});
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
    { carrier: "a.test.ts", name: "also", tests: [{ kind: "requirement", id: "x" }] },
  ]);
  assert.equal(testCaseId(cases[0]), '["a.test.ts","works offline"]');
});

test("a Test Case's identity is its carrier and its decoded string-literal name, however the call is written", () => {
  const { cases, errors } = parse(`
test(
  'it says "hi"\\n',
  {
    // a comment in the options is not the trace
    "tests": { "requirement": [ "a" ] },
  },
  () => {},
);
`);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    cases.map((c) => c.name),
    ['it says "hi"\n'],
  );
});

test("the canonical form is a direct top-level call of the value default import of node:test: any local name, any third argument, any other options", () => {
  for (const source of [
    `import t from "node:test";\nt("n", ${T}, () => {});`,
    `import test, { type TestContext } from "node:test";\ntest("n", ${T}, (t: TestContext) => {});`,
    `import test from "node:test";\nimport other from "node:test";\nother("n", ${T}, handler);`,
    `import test from "node:test";\ntest("n", { ...base, tests: { requirement: ["r"] }, ...more }, () => {});`,
    `import test from "node:test";\ntest("n", { tests: { requirement: ["r"] } }, 5);`,
    `import test from "node:test";\ntest("n", { async tests2() {}, tests: { requirement: ["r"] } }, () => {});`,
  ])
    assert.deepEqual(names(source), ["n"], source);
});

test("a declaration says what a Test Case tests, not that Node ran it: what else the Carrier does with node:test is not examined", () => {
  for (const extra of [
    "test.only = helper;",
    'test.__defineGetter__("only", () => helper);',
    "const t = test;",
    "patch(test);",
    'import("node:test");',
    'process.getBuiltinModule("node:test");',
    'const spec = "node:test";',
    "module.require = () => helper;",
    "throw new Error('before');",
    "if (x) { test('inner', {}, () => {}); }",
  ])
    assert.deepEqual(names(`${IMPORT}${extra}\ntest("n", ${T}, () => {});`), ["n"], extra);
});

test("anything but the canonical form is ordinary syntax: not read, and not refused", () => {
  for (const body of [
    `test(\`n\`, ${T}, () => {});`,
    `test("", ${T}, () => {});`,
    `test(name, ${T}, () => {});`,
    `test("n" + "m", ${T}, () => {});`,
    `test("n", ${T});`,
    `test("n", ${T}, () => {}, extra);`,
    `test("n", ...[${T}, () => {}]);`,
    `test(...["n", ${T}, () => {}]);`,
    `test("n", opts, () => {});`,
    `test("n", () => {});`,
    `await test("n", ${T}, () => {});`,
    `void test("n", ${T}, () => {});`,
    `test?.("n", ${T}, () => {});`,
    `new test("n", ${T}, () => {});`,
    `test.skip("n", ${T}, () => {});`,
    `test.only("n", ${T}, () => {});`,
    `test.todo("n", ${T}, () => {});`,
    `test.expectFailure("n", ${T}, () => {});`,
    `test["skip"]("n", ${T}, () => {});`,
    `(0, test)("n", ${T}, () => {});`,
    `const t = test;\nt("n", ${T}, () => {});`,
    `function f() { test("n", ${T}, () => {}); }`,
    `if (x) { test("n", ${T}, () => {}); }`,
    `for (const k of [1]) test("n", ${T}, () => {});`,
    `test("p", async (t) => { await t.test("n", ${T}, () => {}); });`,
    `test.describe("s", () => { test.it("n", ${T}, () => {}); });`,
    `test("n", { ["tests"]: { requirement: ["r"] } }, () => {});`,
    `test("n", { tests() {} }, () => {});`,
    `test("n", { get tests() { return 1; } }, () => {});`,
    `test("n", { [\`tests\`]: { requirement: ["r"] } }, () => {});`,
    `helper("n", ${T}, () => {});`,
    `helper(${T});`,
    `const o = { tests: { requirement: ["r"] } };`,
  ]) {
    const result = parse(body);
    assert.deepEqual(result, { cases: [], errors: [] }, body);
  }
  // Other imports and other module formats are not the canonical import.
  for (const [source, file] of [
    [`import { test } from "node:test";\ntest("n", ${T}, () => {});`, "a.test.ts"],
    [`import { default as test } from "node:test";\ntest("n", ${T}, () => {});`, "a.test.ts"],
    [`import * as test from "node:test";\ntest("n", ${T}, () => {});`, "a.test.ts"],
    [`import { it } from "node:test";\nit("n", ${T}, () => {});`, "a.test.ts"],
    [`import type test from "node:test";\ntest("n", ${T}, () => {});`, "a.test.ts"],
    [`import test from "node:assert";\ntest("n", ${T}, () => {});`, "a.test.ts"],
    [`import test from "test";\ntest("n", ${T}, () => {});`, "a.test.ts"],
    [`const test = require("node:test");\ntest("n", ${T}, () => {});`, "a.test.cjs"],
    [`import test = require("node:test");\ntest("n", ${T}, () => {});`, "a.test.cts"],
    [`test("n", ${T}, () => {});`, "a.test.ts"],
  ] as const)
    assert.deepEqual(read(source, file), { cases: [], errors: [] }, source);
});

test("text that only looks like a declaration, in a string, a template or a comment, is nothing", () => {
  const body = `
const SRC = 'import test from "node:test";\\ntest("in a string", ${T}, () => {});';
const MORE = \`
test("in a template", ${T}, () => {});
\`;
// test("in a comment", ${T}, () => {});
/*
test("in a block comment", ${T}, () => {});
*/
test("the only one", ${T}, () => {});
`;
  assert.deepEqual(names(`${IMPORT}${body}`), ["the only one"]);
});

test("refuses a canonical declaration whose tests is not a literal of kinds, each a non-empty list of distinct string-literal ids", () => {
  const one = (value: string) => parse(`test("n", { tests: ${value} }, () => {});`);
  for (const [value, message] of [
    ["[]", "tests must be an object literal of kinds, each a list of ids"],
    ["tests", "tests must be an object literal of kinds, each a list of ids"],
    ["{}", "tests must name at least one kind"],
    ["{ requirement: [] }", "tests requirement must name at least one id"],
    ['{ requirement: "a" }', "tests requirement must be a list of ids"],
    ['{ requirement: ["a", "a"] }', 'tests requirement "a" twice'],
    ['{ requirement: ["a"], requirement: ["b"] }', "tests names kind requirement twice"],
    ['{ requirement: ["a"], "requirement": ["b"] }', "tests names kind requirement twice"],
    ["{ requirement: [id] }", "tests requirement ids must be string literals without whitespace"],
    ["{ requirement: [`a`] }", "tests requirement ids must be string literals without whitespace"],
    ["{ requirement: [`a${1}`] }", "tests requirement ids must be string literals without whitespace"],
    ['{ requirement: ["a b"] }', "tests requirement ids must be string literals without whitespace"],
    ['{ requirement: ["", "a"] }', "tests requirement ids must be string literals without whitespace"],
    ['{ requirement: ["a", ...more] }', "tests requirement ids must be string literals without whitespace"],
    ["{ ...more }", "a kind must be a plain name, never computed, spread or blank"],
    ['{ [k]: ["a"] }', "a kind must be a plain name, never computed, spread or blank"],
    ['{ ["requirement"]: ["a"] }', "a kind must be a plain name, never computed, spread or blank"],
    ['{ "": ["a"] }', "a kind must be a plain name, never computed, spread or blank"],
    ['{ "a b": ["a"] }', "a kind must be a plain name, never computed, spread or blank"],
    ["{ f() {} }", "a kind must be a plain name, never computed, spread or blank"],
  ] as const) {
    const result = one(value);
    assert.deepEqual(result.cases, [], value);
    assert.equal(result.errors.length, 1, value);
    assert.equal(bare(result.errors[0]), message, value);
  }
  // A shorthand tests is a plain property too, and not a literal.
  const shorthand = parse('const tests = {};\ntest("n", { tests }, () => {});');
  assert.deepEqual(shorthand.errors.map(bare), ["tests must be an object literal of kinds, each a list of ids"]);
});

test("refuses tests stated twice in one options object, and a traced name declared twice, each naming its line", () => {
  const twice = parse(`test("n", { tests: { requirement: ["a"] }, "tests": { requirement: ["b"] } }, () => {});`);
  assert.deepEqual(twice.cases, []);
  assert.deepEqual(twice.errors.map(bare), ["tests is stated twice"]);
  const dup = parse(`
test("same", ${T}, () => {});
test("alone", ${T}, () => {});
test("same", { tests: { defect: ["d"] } }, () => {});
test("same", ${T.replace("r", "q")}, () => {});
`);
  assert.deepEqual(
    dup.cases.map((c) => c.name),
    ["alone"],
  );
  assert.deepEqual(dup.errors, [
    'a.test.ts:3: Test Case "same" is traced more than once',
    'a.test.ts:5: Test Case "same" is traced more than once',
    'a.test.ts:6: Test Case "same" is traced more than once',
  ]);
  // A malformed declaration and a valid one of the same name are both refused, since the identity is ambiguous.
  const mixed = parse(`test("same", ${T}, () => {});\ntest("same", { tests: [] }, () => {});`);
  assert.deepEqual(mixed.cases, []);
  assert.equal(mixed.errors.length, 3);
  // Ordinary tests of the same name are not traced, so they make nothing ambiguous.
  const ordinary = parse(
    `test("same", ${T}, () => {});\ntest("same", {}, () => {});\ntest("same", () => {});\ntest(\`same\`, ${T}, () => {});`,
  );
  assert.deepEqual(ordinary, {
    cases: [{ carrier: "a.test.ts", name: "same", tests: [{ kind: "requirement", id: "r" }] }],
    errors: [],
  });
  // The line of an error is the declaration's own.
  assert.match(parse(`\n\ntest("n", { tests: { requirement: [] } }, () => {});`).errors[0], /^a\.test\.ts:4: /);
});

test("refuses a Carrier that does not parse, and reads TypeScript only in a TypeScript Carrier", () => {
  assert.match(parseTestCases("import test from", "a.test.ts").errors[0], /^a\.test\.ts: unparseable carrier \(/);
  const typed = `${IMPORT}test("n", ${T}, (t: unknown) => {});`;
  assert.deepEqual(names(typed, "a.test.ts"), ["n"]);
  assert.deepEqual(names(typed, "a.test.mts"), ["n"]);
  assert.match(parseTestCases(typed, "a.test.js").errors[0], /^a\.test\.js: unparseable carrier \(/);
  assert.deepEqual(names(typed.replace(": unknown", ""), "a.test.mjs"), ["n"]);
});

test("the name given to a Carrier only labels errors and identities: whether it is TypeScript is the physical file's extension", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "test-cases-"));
  const typed = `${IMPORT}test("n", ${T}, (t: unknown) => {});\n`;
  for (const physical of ["a.test.ts", "a.test.mts", "a.test.cts"]) {
    fs.writeFileSync(path.join(dir, physical), typed);
    // The name has no TypeScript suffix, or none at all: the physical file decides.
    for (const label of ["change/case", "change/case.test.js", "label"])
      assert.deepEqual(readTestCases(path.join(dir, physical), label), {
        cases: [{ carrier: label, name: "n", tests: [{ kind: "requirement", id: "r" }] }],
        errors: [],
      });
  }
  // A JavaScript file is JavaScript, whatever its label says.
  for (const physical of ["b.test.js", "b.test.mjs", "b.test.cjs"]) {
    fs.writeFileSync(path.join(dir, physical), typed);
    const result = readTestCases(path.join(dir, physical), "change/x.test.ts");
    assert.deepEqual(result.cases, [], physical);
    assert.match(result.errors[0], /^change\/x\.test\.ts: unparseable carrier \(/, physical);
  }
  // From text, the physical path is given or is the name.
  assert.deepEqual(
    parseTestCases(typed, "label", "a.test.ts").cases.map((c) => c.carrier),
    ["label"],
  );
  assert.match(parseTestCases(typed, "label").errors[0], /^label: unparseable carrier \(/);
  assert.deepEqual(
    parseTestCases(typed, "a.test.ts").cases.map((c) => c.carrier),
    ["a.test.ts"],
  );
});

test("a Test Case's identity is one line, whatever its name holds, and names its carrier and name exactly", () => {
  const separators = [0x0a, 0x0d, 0x85, 0x2028, 0x2029].map((code) => `a${String.fromCharCode(code)}b`);
  const all = [...separators, 'quote " and \\ backslash', "::", '", "', "tab\tand unicode é\u{1f600}"];
  const { cases, errors } = parse(
    all.map((n) => `test(${JSON.stringify(n)}, ${T}, () => {});`).join("\n"),
    "dir/a::b.test.ts",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(
    cases.map((c) => c.name),
    all,
  );
  const ids = testCasesTesting(cases, "requirement", "r");
  assert.equal(ids.length, all.length);
  for (const [index, line] of ids.entries()) {
    assert.doesNotMatch(line, new RegExp(`[${["\\n", "\\r", "\\u0085", "\\u2028", "\\u2029"].join("")}]`));
    assert.deepEqual(JSON.parse(line), ["dir/a::b.test.ts", all[index]]);
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.join("\n").split("\n").length, all.length);
});

test("many Test Cases of one Carrier, and of many, test the same identity; reverse lookup is computed from them", () => {
  const a = parse(`
test("one", ${T}, () => {});
test("two", { tests: { requirement: ["r", "q"], defect: ["r"] } }, () => {});
test("three", {}, () => {});
`).cases;
  const b = parseTestCases(`${IMPORT}test("one", ${T}, () => {});`, "b.test.ts").cases;
  const all: TestCase[] = [...a, ...b];
  const id = (carrier: string, name: string) => testCaseId({ carrier, name });
  assert.deepEqual(testCasesTesting(all, "requirement", "r"), [
    id("a.test.ts", "one"),
    id("a.test.ts", "two"),
    id("b.test.ts", "one"),
  ]);
  assert.deepEqual(testCasesTesting(all, "requirement", "q"), [id("a.test.ts", "two")]);
  assert.deepEqual(testCasesTesting(all, "defect", "r"), [id("a.test.ts", "two")]);
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

// The option the TypeScript declaration admits, as a Test Case of this very Carrier would state it: typechecked, and ignored by Node.
test("the tests option is admitted by TypeScript and ignored by Node", { tests: { requirement: ["x"] } }, () => {
  assert.ok(true);
});

test("Testing reads without executing or writing, keeps no reverse registry, and stays independent of Requirements and Defects", () => {
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
  assert.doesNotMatch(reader, /writeFileSync|writeFile\(|child_process|\bimport\(|\beval\(|new Function/);
  assert.deepEqual(
    fs.readdirSync(scripts).filter((n) => /index|registry|reverse/i.test(n)),
    [],
  );
});
