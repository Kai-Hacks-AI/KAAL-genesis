import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  carriersCurrentlyTesting,
  currentTestCasesTesting,
  readSupersession,
  testCasesProtecting,
} from "./supersession.js";
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

const target = (kind: string, id: string) => ({ kind, id });
const carriers = (cases: TestCase[], ...targets: { kind: string; id: string }[]) => {
  const answer = carriersCurrentlyTesting(cases, targets);
  assert.ok("carriers" in answer, "errors" in answer ? answer.errors.join("\n") : "");
  return answer.carriers;
};

test("a Carrier is selected by its active Test Cases: one superseded for r1 but active for r2 stays, one with none active does not", () => {
  const mixed1 = tc("mixed.test.ts", "for r1", undefined, '{ requirement: ["r1"] }');
  const mixed2 = tc("mixed.test.ts", "for r2", undefined, '{ requirement: ["r2"] }');
  const dead = tc("dead.test.ts", "only r1", undefined, '{ requirement: ["r1"] }');
  const next = tc("next.test.ts", "r1 again", ["mixed.test.ts", "for r1"], '{ requirement: ["r1"] }');
  const next2 = tc("next.test.ts", "r1 once more", ["dead.test.ts", "only r1"], '{ requirement: ["r1"] }');
  const cases = [mixed1, mixed2, dead, next, next2];
  assert.deepEqual(carriers(cases, target("requirement", "r1")), ["next.test.ts"]);
  assert.deepEqual(carriers(cases, target("requirement", "r2")), ["mixed.test.ts"]);
  assert.deepEqual(
    carriers(cases, target("requirement", "r1"), target("requirement", "r2")),
    ["mixed.test.ts", "next.test.ts"],
    "mixed.test.ts is kept by r2 although its Test Case for r1 is superseded; dead.test.ts holds nothing active",
  );
  assert.deepEqual(carriers(cases), [], "nothing protected, nothing to run");
  assert.deepEqual(carriers(cases, target("requirement", "unknown"), target("defect", "r1")), []);
});

test("activity per tests edge decides the Carrier: a superseded Test Case that still tests another target keeps its Carrier", () => {
  const both = tc("old.test.ts", "how", undefined, '{ requirement: ["r1", "r2"] }');
  const two = tc("new.test.ts", "how again", ["old.test.ts", "how"], '{ requirement: ["r1"] }');
  assert.deepEqual(carriers([both, two], target("requirement", "r1")), ["new.test.ts"]);
  assert.deepEqual(carriers([both, two], target("requirement", "r2")), ["old.test.ts"]);
  const three = tc("third.test.ts", "once more", ["new.test.ts", "how again"], '{ requirement: ["r2"] }');
  assert.deepEqual(carriers([both, two, three], target("requirement", "r1")), ["new.test.ts"], "a later drop keeps r1");
  assert.deepEqual(carriers([both, two, three], target("requirement", "r2")), ["third.test.ts"]);
});

test("the Carriers are each once, sorted, and the same whatever the order of the Test Cases or of the targets", () => {
  const cases = [
    tc("b.test.ts", "one", undefined, '{ requirement: ["r1"] }'),
    tc("b.test.ts", "two", undefined, '{ requirement: ["r2"] }'),
    tc("a.test.ts", "one", undefined, '{ requirement: ["r1"] }'),
  ];
  const r1 = target("requirement", "r1");
  const r2 = target("requirement", "r2");
  const expected = ["a.test.ts", "b.test.ts"];
  assert.deepEqual(carriers(cases, r1, r2), expected);
  assert.deepEqual(carriers([...cases].reverse(), r2, r1, r1), expected);
});

test("the answer is derived: asking again of the same Test Cases, however they were read, gives exactly the same answer, and nothing is modified", () => {
  const files = {
    "a.test.ts": `${IMPORT}test("a", { tests: { requirement: ["r1", "r2"] } }, () => {});\n`,
    "b.test.ts": `${IMPORT}test("b", { tests: { requirement: ["r1"] }, supersedes: ["a.test.ts", "a"] }, () => {});\n`,
  };
  const read = () =>
    Object.entries(files).flatMap(([name, text]) => {
      const { cases, errors } = parseTestCases(text, name);
      assert.deepEqual(errors, []);
      return cases;
    });
  const targets = [target("requirement", "r1"), target("requirement", "r2")];
  const cases = read();
  const before = JSON.stringify(cases);
  const first = carriersCurrentlyTesting(cases, targets);
  assert.deepEqual(first, { carriers: ["a.test.ts", "b.test.ts"] });
  assert.equal(JSON.stringify(cases), before, "the Test Cases are not modified");
  assert.deepEqual(carriersCurrentlyTesting(read(), targets), first, "reconstructed from the sources alone");
});

test("the Carriers agree with the Test Cases currentTestCasesTesting finds active, over every lineage shape", () => {
  const ids = ["r1", "r2", "r3"];
  const edges = (n: number) => ids.filter((_, i) => n & (1 << i)).map((i) => `"${i}"`);
  const cases: TestCase[] = [];
  for (let lineage = 0; lineage < 40; lineage++) {
    let earlier: [string, string] | undefined;
    for (let step = 0; step < 1 + (lineage % 4); step++) {
      const mask = 1 + ((lineage * 5 + step * 3) % 7);
      const carrier = `c${(lineage + step) % 9}.test.ts`;
      const name = `l${lineage}s${step}`;
      cases.push(tc(carrier, name, earlier, `{ requirement: [${edges(mask).join(", ")}] }`));
      earlier = [carrier, name];
    }
  }
  assert.deepEqual(readSupersession(cases).errors, []);
  for (const subset of [[], ["r1"], ["r2", "r3"], ids]) {
    const expected = new Set(
      subset.flatMap((id) => currentTestCasesTesting(cases, "requirement", id)).map((t) => JSON.parse(t)[0] as string),
    );
    assert.deepEqual(
      carriers(cases, ...subset.map((id) => target("requirement", id))),
      [...expected].sort(),
      subset.join(),
    );
  }
});

test("a refused lineage answers nothing but its errors, and the pass is linear in a long lineage", () => {
  const one = tc("one.test.ts", "how");
  const gone = tc("two.test.ts", "n", ["gone.test.ts", "x"]);
  const answer = carriersCurrentlyTesting([one, gone], [target("requirement", "r")]);
  assert.deepEqual(answer, { errors: readSupersession([one, gone]).errors });
  assert.match("errors" in answer ? answer.errors.join() : "", /names no Test Case/);
  const long: TestCase[] = [];
  for (let i = 0; i < 20000; i++)
    long.push(tc(`c${i}.test.ts`, "t", i ? [`c${i - 1}.test.ts`, "t"] : undefined, `{ requirement: ["r${i}"] }`));
  const started = Date.now();
  assert.deepEqual(carriers(long, target("requirement", "r0")), ["c0.test.ts"]);
  assert.ok(Date.now() - started < 5000, "a pairwise walk of the lineage would not finish here");
});

const entries = (cases: TestCase[], ...targets: { kind: string; id: string }[]) => {
  const answer = testCasesProtecting(cases, targets);
  assert.ok("entries" in answer, "errors" in answer ? answer.errors.join("\n") : "");
  return answer.entries.map((e) => [e.carrier, e.name, e.targets.map((t) => t.id)]);
};

test("a Test Case selected by several protected identities is one entry of the Test Plan, carrying them all", () => {
  const one = tc("one.test.ts", "tc1", undefined, '{ requirement: ["r1", "r2"] }');
  const two = tc("two.test.ts", "tc2", undefined, '{ requirement: ["r3"] }');
  const r = (id: string) => target("requirement", id);
  assert.deepEqual(entries([two, one], r("r1"), r("r2"), r("r3")), [
    ["one.test.ts", "tc1", ["r1", "r2"]],
    ["two.test.ts", "tc2", ["r3"]],
  ]);
  assert.deepEqual(entries([one, two], r("r3"), r("r2"), r("r2")), [
    ["one.test.ts", "tc1", ["r2"]],
    ["two.test.ts", "tc2", ["r3"]],
  ]);
  assert.deepEqual(entries([one, two]), [], "nothing protected, nothing planned");
});

test("the entries are the active Test Cases per target: a superseded one stays for what only it tests", () => {
  const old = tc("old.test.ts", "how", undefined, '{ requirement: ["r1", "r2"], defect: ["d"] }');
  const now = tc("new.test.ts", "how again", ["old.test.ts", "how"], '{ requirement: ["r1"] }');
  const t = [target("requirement", "r1"), target("requirement", "r2"), target("defect", "d"), target("defect", "x")];
  assert.deepEqual(entries([old, now], ...t), [
    ["new.test.ts", "how again", ["r1"]],
    ["old.test.ts", "how", ["d", "r2"]],
  ]);
  for (const id of ["r1", "r2"]) {
    const expected = currentTestCasesTesting([old, now], "requirement", id).sort();
    const found = (entries([old, now], target("requirement", id)) as [string, string, string[]][]).map(([c, n]) =>
      testCaseId({ carrier: c, name: n }),
    );
    assert.deepEqual(found.sort(), expected);
  }
});

test("the Test Plan is derived: the same whatever the order, rebuilt exactly from the sources, refusing a refused lineage", () => {
  const cases = [
    tc("b.test.ts", "two", undefined, '{ requirement: ["r2"] }'),
    tc("b.test.ts", "one", undefined, '{ requirement: ["r1", "r2"] }'),
    tc("a.test.ts", "one", ["b.test.ts", "one"], '{ requirement: ["r1"] }'),
  ];
  const t = [target("requirement", "r1"), target("requirement", "r2")];
  const first = testCasesProtecting(cases, t);
  assert.deepEqual(testCasesProtecting([...cases].reverse(), [...t].reverse()), first);
  assert.deepEqual(first, {
    entries: [
      { carrier: "a.test.ts", name: "one", targets: [target("requirement", "r1")] },
      { carrier: "b.test.ts", name: "one", targets: [target("requirement", "r2")] },
      { carrier: "b.test.ts", name: "two", targets: [target("requirement", "r2")] },
    ],
  });
  const gone = tc("c.test.ts", "n", ["gone.test.ts", "x"]);
  assert.deepEqual(testCasesProtecting([gone], t), { errors: readSupersession([gone]).errors });
});

test("the Test Plan is one pass: a long lineage, and many Test Cases, finish at once", () => {
  const long: TestCase[] = [];
  for (let i = 0; i < 20000; i++)
    long.push(tc(`c${i}.test.ts`, "t", i ? [`c${i - 1}.test.ts`, "t"] : undefined, `{ requirement: ["r${i % 3}"] }`));
  const started = Date.now();
  const answer = testCasesProtecting(long, [target("requirement", "r0"), target("requirement", "r1")]);
  assert.ok("entries" in answer);
  assert.ok(Date.now() - started < 5000, "a pairwise comparison of the Test Cases would not finish here");
});
