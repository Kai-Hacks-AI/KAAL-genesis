import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { currentOf, currentTestCases, currentTestCasesTesting, readSupersession } from "./supersession.js";
import { parseTestCases, testCaseId, type TestCase } from "./test-cases.js";
import { report, runPlan } from "./testing.js";

const IMPORT = 'import test from "node:test";\n';
const R = '{ requirement: ["r"] }';
const parse = (body: string, file = "a.test.ts") => parseTestCases(`${IMPORT}${body}`, file);
const tc = (carrier: string, name: string, supersedes?: [string, string], tests = R): TestCase => {
  const { cases, errors } = parse(
    `test(${JSON.stringify(name)}, { tests: ${tests}${supersedes ? `, supersedes: ${JSON.stringify(supersedes)}` : ""} }, () => {});`,
    carrier,
  );
  assert.deepEqual(errors, []);
  return cases[0];
};

test("a Test Case declares the earlier Test Case it supersedes, by that one's carrier and name", () => {
  const { cases, errors } = parse(
    'test("new", { supersedes: ["old.test.ts", "old"], tests: { requirement: ["r"] } }, () => {});\ntest("plain", { tests: { requirement: ["r"] } }, () => {});',
    "new.test.ts",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(cases[0].supersedes, { carrier: "old.test.ts", name: "old" });
  assert.equal(cases[1].supersedes, undefined);
  assert.equal(testCaseId(cases[0].supersedes!), '["old.test.ts","old"]');
});

test("a supersedes that is not a list of two string literals, or is stated twice, refuses the declaration", () => {
  for (const supersedes of ['"old"', "[]", '["a"]', '["a", "b", "c"]', '["a", b]', "[...x]", '["", "b"]', "`a`"]) {
    const { cases, errors } = parse(`test("n", { tests: ${R}, supersedes: ${supersedes} }, () => {});`);
    assert.deepEqual(cases, [], supersedes);
    assert.match(errors.join("\n"), /supersedes must be a list of two string literals/, supersedes);
  }
  const twice = parse(`test("n", { tests: ${R}, supersedes: ["a", "b"], supersedes: ["a", "b"] }, () => {});`);
  assert.deepEqual(twice.cases, []);
  assert.match(twice.errors.join("\n"), /supersedes is stated twice/);
});

test("supersedes without a tests declaration is no Test Case's declaration, and is neither read nor refused", () => {
  const { cases, errors } = parse('test("n", { supersedes: ["a", "b"] }, () => {});');
  assert.deepEqual([cases, errors], [[], []]);
});

test("supersession is computed from the newer Test Case's declaration alone, and the earlier is untouched", () => {
  const one = tc("one.test.ts", "how");
  const two = tc("two.test.ts", "how again", ["one.test.ts", "how"]);
  const three = tc("three.test.ts", "how once more", ["two.test.ts", "how again"]);
  const { superseder, errors } = readSupersession([one, two, three]);
  assert.deepEqual(errors, []);
  assert.equal(superseder.get(testCaseId(one)), testCaseId(two));
  assert.equal(currentOf(superseder, testCaseId(one)), testCaseId(three));
  assert.equal(currentOf(superseder, testCaseId(three)), testCaseId(three));
  assert.equal(readSupersession([one]).superseder.size, 0, "the earlier Test Case alone knows nothing of it");
  assert.equal(one.supersedes, undefined);
});

test("a Test Case is current when no Test Case among those considered supersedes it, however they are ordered", () => {
  const one = tc("one.test.ts", "how");
  const two = tc("two.test.ts", "how again", ["one.test.ts", "how"]);
  const other = tc("other.test.ts", "elsewhere");
  const ids = (...cases: TestCase[]) => cases.map(testCaseId);
  assert.deepEqual(currentTestCases([one, two, other]), ids(two, other));
  assert.deepEqual(currentTestCases([other, two, one]), ids(other, two));
  assert.deepEqual(
    currentTestCases([one, other]),
    ids(one, other),
    "the earlier is current in material without the later",
  );
  assert.deepEqual(currentTestCasesTesting([one, two, other], "requirement", "r"), ids(two, other));
  assert.deepEqual(currentTestCasesTesting([one, two], "requirement", "unrelated"), []);
});

test("a lineage is refused when it names nothing, itself, a circle, a second superseder, or drops what was tested", () => {
  const one = tc("one.test.ts", "how");
  const refused = (cases: TestCase[], pattern: RegExp) =>
    assert.match(readSupersession(cases).errors.join("\n"), pattern);
  refused([tc("two.test.ts", "n", ["gone.test.ts", "x"])], /names no Test Case/);
  refused([tc("two.test.ts", "n", ["two.test.ts", "n"])], /supersedes itself/);
  refused(
    [tc("a.test.ts", "a", ["b.test.ts", "b"]), tc("b.test.ts", "b", ["a.test.ts", "a"])],
    /supersede one another in a circle/,
  );
  refused(
    [one, tc("two.test.ts", "n", ["one.test.ts", "how"]), tc("three.test.ts", "m", ["one.test.ts", "how"])],
    /already supersedes/,
  );
  refused(
    [one, tc("two.test.ts", "n", ["one.test.ts", "how"], '{ requirement: ["else"] }')],
    /does not test requirement "r"/,
  );
  assert.deepEqual(
    readSupersession([one, tc("two.test.ts", "n", ["one.test.ts", "how"], '{ requirement: ["r", "more"] }')]).errors,
    [],
    "a superseding Test Case may test more",
  );
});

/** A testing root whose Plan collects `suites`, each a Suite holding the Carriers given. */
function root(suites: Record<string, Record<string, string>>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "supersession-"));
  const listed = Object.keys(suites).map((s) => `  - ${s}`);
  fs.writeFileSync(path.join(dir, "plan.md"), `---\nsuites:\n${listed.join("\n")}\n---\n\nScratch.\n`);
  for (const [suite, carriers] of Object.entries(suites)) {
    fs.mkdirSync(path.join(dir, suite));
    fs.writeFileSync(path.join(dir, suite, "suite.json"), JSON.stringify({ concern: "Scratch." }));
    for (const [name, body] of Object.entries(carriers)) fs.writeFileSync(path.join(dir, suite, name), body);
  }
  return dir;
}

test("supersession leaves Plans, Suites and Runs alone: a Run executes the superseded Carrier as it executes any other", () => {
  const dir = root({
    old: { "was.test.mjs": `${IMPORT}test("was", { tests: ${R} }, () => { throw new Error("no"); });\n` },
    new: {
      "now.test.mjs": `${IMPORT}test("now", { tests: ${R}, supersedes: ["old/was.test.mjs", "was"] }, () => {});\n`,
    },
  });
  const run = runPlan("plan.md", dir);
  assert.deepEqual(
    run.observations.map((o) => [o.case, o.passed]),
    [
      ["old/was.test.mjs", false],
      ["new/now.test.mjs", true],
    ],
  );
  assert.equal(run.holds, false);
  assert.match(report(run), /\nfail old\/was\.test\.mjs\npass new\/now\.test\.mjs\ndoes not hold$/);
});
