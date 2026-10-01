import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { currentTestCasesTesting, readSupersession } from "./supersession.js";
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
  assert.equal(superseder.get(testCaseId(two)), testCaseId(three));
  assert.equal(superseder.has(testCaseId(three)), false);
  assert.equal(readSupersession([one]).superseder.size, 0, "the earlier Test Case alone knows nothing of it");
  assert.equal(one.supersedes, undefined);
});

test("a Test Case is active for a kind and id it tests unless a later Test Case of its lineage tests it too, however they are ordered", () => {
  const one = tc("one.test.ts", "how");
  const two = tc("two.test.ts", "how again", ["one.test.ts", "how"]);
  const other = tc("other.test.ts", "elsewhere");
  const ids = (...cases: TestCase[]) => cases.map(testCaseId);
  assert.deepEqual(currentTestCasesTesting([one, two, other], "requirement", "r"), ids(two, other));
  assert.deepEqual(currentTestCasesTesting([other, two, one], "requirement", "r"), ids(other, two));
  assert.deepEqual(
    currentTestCasesTesting([one, other], "requirement", "r"),
    ids(one, other),
    "alone, the earlier is active",
  );
  assert.deepEqual(currentTestCasesTesting([one, two], "requirement", "unrelated"), []);
  assert.deepEqual(currentTestCasesTesting([one, two], "defect", "r"), [], "a kind is part of the edge");
});

test("activity is per tests edge: a superseded Test Case stays active for what no later one of its lineage tests", () => {
  const both = '{ requirement: ["r1", "r2"] }';
  const one = tc("one.test.ts", "how", undefined, both);
  const two = tc("two.test.ts", "how again", ["one.test.ts", "how"], '{ requirement: ["r1"] }');
  const three = tc("three.test.ts", "once more", ["two.test.ts", "how again"], '{ requirement: ["r2", "r3"] }');
  const ids = (...cases: TestCase[]) => cases.map(testCaseId);
  const all = [one, two];
  assert.deepEqual(readSupersession(all).errors, [], "dropping r2 is not refused");
  assert.deepEqual(currentTestCasesTesting(all, "requirement", "r1"), ids(two));
  assert.deepEqual(currentTestCasesTesting(all, "requirement", "r2"), ids(one));
  const line = [one, two, three];
  assert.deepEqual(
    currentTestCasesTesting(line, "requirement", "r1"),
    ids(two),
    "a later one that drops r1 does not retire it",
  );
  assert.deepEqual(
    currentTestCasesTesting(line, "requirement", "r2"),
    ids(three),
    "a later one of the lineage, not only the next",
  );
  assert.deepEqual(currentTestCasesTesting(line, "requirement", "r3"), ids(three));
  const fork = tc("fork.test.ts", "unrelated lineage", undefined, '{ requirement: ["r2"] }');
  assert.deepEqual(
    currentTestCasesTesting([...all, fork], "requirement", "r2"),
    ids(one, fork),
    "another lineage does not supersede it",
  );
});

test("a lineage is refused when it names nothing, itself, a circle, or a second superseder", () => {
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
  assert.deepEqual(
    readSupersession([one, tc("two.test.ts", "n", ["one.test.ts", "how"], '{ requirement: ["r", "more"] }')]).errors,
    [],
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
