import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { carrierUnder, parseTestCases } from "./test-cases.js";
import { candidateData, rootData } from "./test-data.js";
import {
  observeConditions,
  outcomes,
  planEvidence,
  readReport,
  report,
  runPlan,
  runPlanUnder,
  unmet,
  verdict,
} from "./testing.js";

// Applicability: a Test Case states the execution conditions under which it is evidence at all, and a Run executes
// only what applies under the conditions it observed. The reproduction of FAR-9's pressure is synthetic and neutral:
// two Cases that each demonstrate under one condition, and no Case, Plan or id here names a platform's meaning.

const RUN = fileURLToPath(new URL("./run.ts", import.meta.url));
const EVIDENCE = fileURLToPath(new URL("./evidence.ts", import.meta.url));
const here = process.platform;
const elsewhere = here === "win32" ? "linux" : "win32";
const IMPORT = 'import test from "node:test";\n';

/** A Case that records that it ran, in the candidate it runs in, then passes. */
const marking = (name: string, id: string, under = "") =>
  `${IMPORT}import fs from "node:fs";\ntest(${JSON.stringify(name)}, { tests: { requirement: [${JSON.stringify(id)}] }${under} }, () => { fs.writeFileSync(${JSON.stringify(`ran-${name}`)}, ""); });\n`;

const scratch = (files: Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "testing-conditions-"));
  process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
};

/** Two Cases that demonstrate under different conditions, and one that applies anywhere. */
const PLAN = "---\ncarriers:\n  - one.test.ts\n  - other.test.ts\n  - anywhere.test.ts\n---\n\nTwo conditions.\n";
const twoConditions = () =>
  scratch({
    "plan.md": PLAN,
    "one.test.ts": marking("one", "one-support", `, under: { platform: ["${here}"] }`),
    "other.test.ts": marking("other", "other-support", `, under: { platform: ["${elsewhere}"] }`),
    "anywhere.test.ts": marking("anywhere", "everywhere"),
  });
const ran = (dir: string) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("ran-"))
    .sort();
const clear = (dir: string) => ran(dir).forEach((f) => fs.rmSync(path.join(dir, f)));

test("a Case that applies only elsewhere is not executed, so it is neither a failure nor a pass, and the Run is incomplete", () => {
  const dir = twoConditions();
  const run = runPlan("plan.md", dir);
  assert.deepEqual(
    run.observations.map((o) => [o.case, o.passed]),
    [
      ["one.test.ts", true],
      ["anywhere.test.ts", true],
    ],
  );
  assert.deepEqual(run.inapplicable, [
    { case: "other.test.ts", under: [{ dimension: "platform", values: [elsewhere] }] },
  ]);
  assert.deepEqual(ran(dir), ["ran-anywhere", "ran-one"], "the inapplicable Case did not execute");
  assert.equal(run.holds, false, "holds is still the Plan holding by this Run, which a partial Run does not show");
  assert.equal(verdict(run), "incomplete", "but nothing that ran failed");
  assert.equal(
    report(run),
    [
      "plan plan.md",
      `candidate ${dir}`,
      `conditions ${run.conditions}`,
      "pass one.test.ts",
      "pass anywhere.test.ts",
      "inapplicable other.test.ts",
      "incomplete",
    ].join("\n"),
  );
});

test("a Run observes its own conditions: a Case cannot be made to apply by the Plan, and evidence of one condition never counts as another's", () => {
  const dir = twoConditions();
  const run = runPlan("plan.md", dir);
  assert.deepEqual(run.facts, observeConditions());
  const { evidence } = planEvidence([outcomes(run)]);
  assert.equal(evidence?.evidenced, false);
  assert.deepEqual(evidence?.passed, ["anywhere.test.ts", "one.test.ts"]);
  assert.deepEqual(evidence?.unevidenced, ["other.test.ts"], "this Run cannot stand in for the other condition");
  assert.deepEqual(evidence?.failed, []);
});

test("Runs made under each condition together evidence a Plan that neither shows alone, in any order", () => {
  const dir = twoConditions();
  const first = runPlan("plan.md", dir);
  clear(dir);
  const second = runPlanUnder({ ...observeConditions(), platform: elsewhere }, "plan.md", dir);
  assert.deepEqual(
    ran(dir),
    ["ran-anywhere", "ran-other"],
    "the Run of the other conditions executed what applies to it",
  );
  assert.equal(verdict(second), "incomplete");
  for (const runs of [
    [first, second],
    [second, first],
  ]) {
    const { evidence, errors } = planEvidence(runs.map(outcomes));
    assert.deepEqual(errors, []);
    assert.deepEqual(evidence, {
      evidenced: true,
      passed: ["anywhere.test.ts", "one.test.ts", "other.test.ts"],
      failed: [],
      unevidenced: [],
    });
  }
});

test("a Case that applies and fails is a failure whatever else did not apply, and no Run elsewhere excuses it", () => {
  const dir = scratch({
    "plan.md": "---\ncarriers:\n  - bad.test.ts\n  - other.test.ts\n---\n\nFails here.\n",
    "bad.test.ts": `${IMPORT}test("bad", { tests: { requirement: ["x"] }, under: { platform: ["${here}"] } }, () => { throw new Error("no"); });\n`,
    "other.test.ts": marking("other", "y", `, under: { platform: ["${elsewhere}"] }`),
  });
  const run = runPlan("plan.md", dir);
  assert.equal(verdict(run), "does not hold");
  const { evidence } = planEvidence([
    outcomes(run),
    outcomes(runPlanUnder({ ...run.facts, platform: elsewhere }, "plan.md", dir)),
  ]);
  assert.equal(evidence?.evidenced, false);
  assert.deepEqual(evidence?.failed, ["bad.test.ts"]);
  assert.deepEqual(
    evidence?.unevidenced,
    [],
    "the Case passed nowhere and failed once: it is failed, not merely unevidenced",
  );
});

test("a Plan whose Cases state no conditions is the simple case: one Run provides all the evidence, and nothing about it changes", () => {
  for (const [root, candidate] of [
    [rootData("holds"), candidateData("marked")],
    [rootData("fails"), candidateData("marked")],
    [rootData("holds"), undefined],
  ] as const) {
    const run = runPlan("plan.md", root, candidate);
    assert.deepEqual(run.inapplicable, []);
    assert.equal(report(run).split("\n").pop(), run.holds ? "holds" : "does not hold");
    assert.equal(
      planEvidence([outcomes(run)]).evidence?.evidenced,
      run.holds,
      "one complete Run is evidenced exactly when it holds",
    );
  }
});

test("conditions are any value of every named dimension, and a dimension the Run does not state is never satisfied", () => {
  const under = [
    { dimension: "platform", values: ["a", "b"] },
    { dimension: "arch", values: ["x"] },
  ];
  assert.deepEqual(unmet(under, { platform: "b", arch: "x" }), []);
  assert.deepEqual(unmet(under, { platform: "c", arch: "x" }), ["platform"]);
  assert.deepEqual(unmet(under, { platform: "c", arch: "y" }), ["platform", "arch"]);
  assert.deepEqual(unmet([{ dimension: "database", values: ["postgres"] }], observeConditions()), ["database"]);
  assert.deepEqual(unmet([], {}), []);
  assert.deepEqual(unmet([{ dimension: "toString", values: ["x"] }], {}), ["toString"], "a name is only ever a key");
});

test("Testing knows no platform: any dimension a Run states can condition a Case, and the Case it conditions is reported honestly", () => {
  const dir = scratch({
    "plan.md": "---\ncarriers:\n  - db.test.ts\n---\n\nNeeds a database.\n",
    "db.test.ts": marking("db", "x", ', under: { database: ["postgres"], platform: ["' + here + '"] }'),
  });
  assert.equal(verdict(runPlan("plan.md", dir)), "incomplete");
  assert.deepEqual(ran(dir), []);
  const stated = runPlanUnder({ ...observeConditions(), database: "postgres" }, "plan.md", dir);
  assert.equal(verdict(stated), "holds");
  assert.deepEqual(ran(dir), ["ran-db"]);
});

test("a Test Case states its conditions in a literal under option beside tests, and is refused when it is not one", () => {
  const parse = (options: string) =>
    parseTestCases(`${IMPORT}test("a", { tests: { requirement: ["r"] }, ${options} }, () => {});`, "a.test.ts");
  const ok = parse('under: { platform: ["win32", "linux"], arch: ["x64"] }');
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.cases[0].under, [
    { dimension: "platform", values: ["win32", "linux"] },
    { dimension: "arch", values: ["x64"] },
  ]);
  assert.equal(
    parseTestCases(`${IMPORT}test("a", { tests: { requirement: ["r"] } }, () => {});`, "a.test.ts").cases[0].under,
    undefined,
  );
  const bare = (message: string) => message.replace(/^[^:]+:\d+: /, "");
  assert.deepEqual(parse("under: process.platform").errors.map(bare), [
    "under must be an object literal of dimensions, each a list of values",
  ]);
  assert.deepEqual(parse("under: {}").errors.map(bare), ["under must name at least one dimension"]);
  assert.deepEqual(parse("under: { platform: [] }").errors.map(bare), ["under platform must name at least one value"]);
  assert.deepEqual(parse('under: { platform: "linux" }').errors.map(bare), ["under platform must be a list of values"]);
  assert.deepEqual(parse('under: { platform: ["a b"] }').errors.map(bare), [
    "under platform values must be string literals without whitespace",
  ]);
  assert.deepEqual(parse('under: { platform: ["a", "a"] }').errors.map(bare), ['under platform "a" twice']);
  assert.deepEqual(parse('under: { [p]: ["a"] }').errors.map(bare), [
    "a dimension must be a plain name, never computed, spread or blank",
  ]);
  assert.deepEqual(parse('under: { platform: ["a"] }, under: { arch: ["x"] }').errors.map(bare), [
    "under is stated twice",
  ]);
  assert.deepEqual(parse("under: p").cases, [], "a Test Case whose declaration is refused is not read at all");
});

test("under belongs to a traceable Test Case and states no trace: a call that is not one is ordinary syntax", () => {
  const { cases, errors } = parseTestCases(
    `${IMPORT}test("plain", { under: { platform: ["linux"] } }, () => {});`,
    "a.test.ts",
  );
  assert.deepEqual([cases, errors], [[], []]);
});

test("a Carrier is executed whole, so it applies where every condition of its Test Cases holds, and one no Run could execute is refused", () => {
  const under = (platform: string[], extra = "") => `under: { platform: ${JSON.stringify(platform)}${extra} }`;
  const cases = (...options: string[]) =>
    parseTestCases(
      options
        .map((o, i) => `${IMPORT}test("t${i}", { tests: { requirement: ["r"] }, ${o} }, () => {});`)
        .join("\n")
        .replace(/(?<=.)\nimport test from "node:test";/g, ""),
      "a.test.ts",
    ).cases;
  assert.deepEqual(carrierUnder(cases(under(["a", "b"]), under(["b", "c"])), "a.test.ts"), {
    under: [{ dimension: "platform", values: ["b"] }],
    errors: [],
  });
  assert.deepEqual(carrierUnder(cases(under(["a"], ', arch: ["x"]'), under(["a", "b"])), "a.test.ts").under, [
    { dimension: "platform", values: ["a"] },
    { dimension: "arch", values: ["x"] },
  ]);
  assert.deepEqual(carrierUnder(cases(under(["a"]), under(["b"])), "a.test.ts").errors, [
    "a.test.ts: its Test Cases accept no common platform, so no Run could ever execute it: split it into Carriers",
  ]);
  assert.deepEqual(carrierUnder([], "a.test.ts"), { under: [], errors: [] });
  const dir = scratch({
    "plan.md": "---\ncarriers:\n  - split.test.ts\n---\n\nCannot run.\n",
    "split.test.ts": `${IMPORT}test("a", { tests: { requirement: ["r"] }, under: { platform: ["a"] } }, () => {});\ntest("b", { tests: { requirement: ["r"] }, under: { platform: ["b"] } }, () => {});\n`,
  });
  assert.throws(
    () => runPlan("plan.md", dir),
    /^Error: refusing to run plan\.md:\nsplit\.test\.ts: its Test Cases accept no common platform/,
  );
});

test("a Carrier that is broken in its declarations is refused before any Case runs, while one that does not parse still runs and fails", () => {
  const dir = scratch({
    "plan.md": "---\ncarriers:\n  - broken.test.ts\n  - fine.test.ts\n---\n\nBroken declaration.\n",
    "broken.test.ts": `${IMPORT}test("a", { tests: { requirement: ["r"] }, under: process.platform }, () => {});\n`,
    "fine.test.ts": marking("fine", "x"),
  });
  assert.throws(
    () => runPlan("plan.md", dir),
    /^Error: refusing to run plan\.md:\nbroken\.test\.ts:\d+: under must be an object literal/,
  );
  assert.deepEqual(ran(dir), []);
  const syntax = scratch({
    "plan.md": "---\ncarriers:\n  - syntax.test.ts\n---\n\nDoes not parse.\n",
    "syntax.test.ts": "this is not (valid\n",
  });
  const run = runPlan("plan.md", syntax);
  assert.deepEqual(
    run.observations.map((o) => [o.case, o.passed]),
    [["syntax.test.ts", false]],
  );
  assert.equal(verdict(run), "does not hold");
});

test("a report reads back to the outcomes of its Run, and is refused when it is not one", () => {
  const dir = twoConditions();
  const run = runPlan("plan.md", dir);
  assert.deepEqual(readReport(report(run)), { outcomes: outcomes(run), errors: [] });
  assert.deepEqual(readReport(`${report(run)}\n`).outcomes, outcomes(run), "a trailing newline is nothing");
  assert.deepEqual(readReport("holds\n").errors, ["a Run's report begins with its plan"]);
  assert.deepEqual(readReport("plan p\npass a\npass a\nholds").errors, ["a is stated twice"]);
  assert.deepEqual(readReport("plan p\npass a").errors, ["a Run's report ends with what it showed"]);
  const sealed =
    "plan change/x/runs/01/plan.md\ncandidate <historical candidate>\nconditions node v22.22.0 linux x64\npass a\npass b c.test.ts\nholds\n";
  assert.deepEqual(readReport(sealed).outcomes, {
    plan: "change/x/runs/01/plan.md",
    passed: ["a", "b c.test.ts"],
    failed: [],
    inapplicable: [],
  });
});

test("Runs are Runs of one Plan only when they collect the same Cases, and no Run is no evidence", () => {
  const run = (plan: string, passed: string[], inapplicable: string[] = []) => ({
    plan,
    passed,
    failed: [],
    inapplicable,
  });
  assert.deepEqual(planEvidence([]).errors, ["no Run to show anything of the Plan"]);
  assert.deepEqual(planEvidence([run("p", ["a"]), run("q", ["a", "b"])]).errors, [
    "Run 2 (q) does not collect the Cases of Run 1 (p)",
  ]);
  assert.deepEqual(planEvidence([run("p", ["a"], ["b"]), run("p", ["a"], ["c"])]).errors, [
    "Run 2 (p) does not collect the Cases of Run 1 (p)",
  ]);
  assert.deepEqual(
    planEvidence([run("p", ["a"], ["b"]), run("q", ["b"], ["a"])]).evidence?.evidenced,
    true,
    "the same Cases under two paths are the same Plan's Cases",
  );
});

test("run.ts exits 0 only when the Plan holds, 1 when a Case fails, and 3 when the Run is incomplete; evidence.ts exits 0 only when evidenced", () => {
  const dir = twoConditions();
  const run = (script: string, ...args: string[]) =>
    spawnSync(process.execPath, [...process.execArgv, script, ...args], { cwd: dir, encoding: "utf8" });
  const partial = run(RUN, "plan.md");
  assert.equal(partial.status, 3, partial.stderr);
  assert.match(partial.stdout, /\ninapplicable other\.test\.ts\nincomplete\n$/);
  assert.match(partial.stderr, /^--- other\.test\.ts\nnot executed: it applies only under platform /);
  fs.writeFileSync(path.join(dir, "here.txt"), partial.stdout);
  const alone = run(EVIDENCE, "here.txt");
  assert.equal(alone.status, 1);
  assert.equal(alone.stdout, "pass anywhere.test.ts\npass one.test.ts\nunevidenced other.test.ts\nnot evidenced\n");
  fs.writeFileSync(
    path.join(dir, "elsewhere.txt"),
    report(runPlanUnder({ ...observeConditions(), platform: elsewhere }, "plan.md", dir)),
  );
  const both = run(EVIDENCE, "here.txt", "elsewhere.txt");
  assert.equal(both.status, 0, both.stderr);
  assert.equal(both.stdout, "pass anywhere.test.ts\npass one.test.ts\npass other.test.ts\nevidenced\n");
  assert.equal(run(EVIDENCE).status, 2);
  fs.writeFileSync(path.join(dir, "junk.txt"), "nonsense");
  assert.equal(run(EVIDENCE, "junk.txt").status, 1);
  assert.equal(
    spawnSync(process.execPath, [...process.execArgv, RUN, "plan.md", candidateData("marked")], {
      cwd: rootData("holds"),
      encoding: "utf8",
    }).status,
    0,
  );
});
