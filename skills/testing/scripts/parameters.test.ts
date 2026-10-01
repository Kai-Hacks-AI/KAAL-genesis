import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { candidateData, rootData } from "./test-data.js";
import {
  instanceId,
  observeConditions,
  outcomes,
  planEvidence,
  planInstances,
  readPlan,
  readPlanSuites,
  readReport,
  report,
  runPlan,
  runPlanUnder,
  unmet,
  verdict,
} from "./testing.js";

// A Plan may require one Carrier under parameters, and each distinct Carrier-and-parameters is one required
// instance. A Run performs those its conditions provide and leaves the rest unrun; several Runs evidence the
// Plan. The reproduction of FAR-9's pressure is synthetic and neutral: one HOW, required under two sets of
// parameters, where no Case, Plan or id names a platform's meaning.

const RUN = fileURLToPath(new URL("./run.ts", import.meta.url));
const EVIDENCE = fileURLToPath(new URL("./evidence.ts", import.meta.url));
const here = process.platform;
const elsewhere = here === "win32" ? "linux" : "win32";
const IMPORT = 'import test from "node:test";\n';

/** A Case that records each instance of it, in the candidate it runs in, then passes. */
const counting = (name: string) =>
  `${IMPORT}import fs from "node:fs";\ntest(${JSON.stringify(name)}, () => { fs.appendFileSync(${JSON.stringify(`ran-${name}`)}, "x"); });\n`;
const failing = `${IMPORT}test("fails", () => { throw new Error("no"); });\n`;

const scratch = (files: Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "testing-parameters-"));
  process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
};
const plan = (...carriers: string[]) => `---\ncarriers:\n${carriers.join("\n")}\n---\n\nParameterized.\n`;
const under = (carrier: string, platform: string) =>
  `  - carrier: ${carrier}\n    parameters:\n      platform: ${platform}`;
const executions = (dir: string, name: string) => {
  const file = path.join(dir, `ran-${name}`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").length : 0;
};

/** One HOW, required under the conditions of here and under those of elsewhere. */
const oneHow = () =>
  scratch({
    "plan.md": plan(under("behaves.test.ts", here), under("behaves.test.ts", elsewhere)),
    "behaves.test.ts": counting("behaves"),
  });
const mine = `behaves.test.ts[platform=${here}]`;
const theirs = `behaves.test.ts[platform=${elsewhere}]`;

test("one Case required under two sets of parameters is two instances, and a Run performs only those its conditions provide", () => {
  const dir = oneHow();
  const run = runPlan("plan.md", dir);
  assert.deepEqual(
    run.observations.map((o) => [o.case, o.passed]),
    [[mine, true]],
  );
  assert.deepEqual(run.unrun, [{ case: theirs, parameters: { platform: elsewhere } }]);
  assert.equal(executions(dir, "behaves"), 1, "the Case executed once, for the instance this Run provides");
  assert.equal(run.holds, false, "holds is still the Plan holding by this Run, which one left unrun does not show");
  assert.equal(verdict(run), "incomplete", "but nothing that was performed failed");
  assert.equal(
    report(run),
    [
      "plan plan.md",
      `candidate ${dir}`,
      `conditions ${run.conditions}`,
      `pass ${mine}`,
      `unrun ${theirs}`,
      "incomplete",
    ].join("\n"),
  );
});

test("evidence of one set of parameters never counts as another's: a Run is only what its own conditions provide", () => {
  const dir = oneHow();
  const run = runPlan("plan.md", dir);
  assert.deepEqual(run.facts, observeConditions());
  assert.deepEqual(planEvidence([outcomes(run)]).evidence, {
    evidenced: false,
    passed: [mine],
    failed: [],
    unevidenced: [theirs],
  });
});

test("Runs whose conditions provide each instance together evidence a Plan that neither shows alone, in any order", () => {
  const dir = oneHow();
  const first = runPlan("plan.md", dir);
  const second = runPlanUnder({ ...observeConditions(), platform: elsewhere }, "plan.md", dir);
  assert.equal(executions(dir, "behaves"), 2, "each Run performed the instance it provides, once");
  assert.equal(verdict(second), "incomplete");
  for (const runs of [
    [first, second],
    [second, first],
  ]) {
    const { evidence, errors } = planEvidence(runs.map(outcomes));
    assert.deepEqual(errors, []);
    assert.deepEqual(evidence, { evidenced: true, passed: [mine, theirs].sort(), failed: [], unevidenced: [] });
  }
});

test("an instance that fails stays failed whatever other Runs show", () => {
  const dir = scratch({
    "plan.md": plan(under("bad.test.ts", here), under("good.test.ts", elsewhere)),
    "bad.test.ts": failing,
    "good.test.ts": counting("good"),
  });
  const run = runPlan("plan.md", dir);
  assert.equal(verdict(run), "does not hold");
  const other = runPlanUnder({ ...run.facts, platform: elsewhere }, "plan.md", dir);
  assert.equal(verdict(other), "incomplete", "the Run that performed only what passed does not show the Plan either");
  assert.deepEqual(planEvidence([outcomes(run), outcomes(other)]).evidence, {
    evidenced: false,
    passed: [`good.test.ts[platform=${elsewhere}]`],
    failed: [`bad.test.ts[platform=${here}]`],
    unevidenced: [],
  });
});

test("a Plan that states no parameters is the simple case: one Run provides all the evidence, and nothing about it changes", () => {
  for (const [root, candidate] of [
    [rootData("holds"), candidateData("marked")],
    [rootData("fails"), candidateData("marked")],
    [rootData("holds"), undefined],
  ] as const) {
    const run = runPlan("plan.md", root, candidate);
    assert.deepEqual(run.unrun, []);
    assert.equal(report(run).split("\n").pop(), run.holds ? "holds" : "does not hold");
    assert.equal(
      planEvidence([outcomes(run)]).evidence?.evidenced,
      run.holds,
      "one Run that left none unrun is evidenced exactly when it holds",
    );
  }
  const read = readPlanSuites(rootData("holds"), "plan.md").plan;
  assert.equal("parameterized" in read!, false, "a Plan written before parameters could be stated has none");
});

test("a Carrier is the same Case under any parameters, and the same Carrier under the same parameters is one instance however it is stated", () => {
  const dir = scratch({
    "plan.md": `---\nsuites:\n  - s\ncarriers:\n  - s/one.test.ts\n  - carrier: s/one.test.ts\n    parameters:\n      b: "1"\n      a: "2"\n  - carrier: s/one.test.ts\n    parameters:\n      a: "2"\n---\n\nTwo parameters.\n`,
    "s/suite.json": JSON.stringify({ concern: "Scratch." }),
    "s/one.test.ts": counting("one"),
  });
  const { plan: read, suites } = readPlanSuites(dir, "plan.md");
  assert.deepEqual(
    planInstances(read!, suites).map(instanceId),
    ["s/one.test.ts", "s/one.test.ts[a=2,b=1]", "s/one.test.ts[a=2]"],
    "the Case collected by the Suite and by the Plan is one instance; each distinct set of parameters is another",
  );
  assert.deepEqual(read?.carriers, ["s/one.test.ts"]);
  const twice = scratch({
    "plan.md": `---\ncarriers:\n  - carrier: a.test.ts\n    parameters:\n      b: "1"\n      a: "2"\n  - carrier: a.test.ts\n    parameters:\n      a: "2"\n      b: "1"\n---\n\nTwice.\n`,
    "a.test.ts": counting("a"),
  });
  assert.deepEqual(
    readPlan(path.join(twice, "plan.md")).errors.map((e) => e.replace(/^.*plan\.md: /, "")),
    ['carrier "a.test.ts" under a=2,b=1 is collected twice'],
  );
});

test("a parameter is a name and a value Testing compares by equality, and a name the Run does not state is never provided", () => {
  assert.deepEqual(unmet({ platform: "a", arch: "x" }, { platform: "a", arch: "x", node: "v" }), []);
  assert.deepEqual(unmet({ platform: "a", arch: "x" }, { platform: "b", arch: "x" }), ["platform"]);
  assert.deepEqual(unmet({ platform: "a", arch: "x" }, { platform: "b", arch: "y" }), ["platform", "arch"]);
  assert.deepEqual(unmet({ database: "postgres" }, observeConditions()), ["database"]);
  assert.deepEqual(unmet({}, {}), []);
  assert.deepEqual(unmet({ toString: "x" }, {}), ["toString"], "a name is only ever a key");
});

test("Testing knows no platform: any parameter a Run states can be provided, and what it does not state is left unrun, not failed", () => {
  const dir = scratch({
    "plan.md": plan("  - carrier: db.test.ts\n    parameters:\n      database: postgres"),
    "db.test.ts": counting("db"),
  });
  assert.equal(verdict(runPlan("plan.md", dir)), "incomplete");
  assert.equal(executions(dir, "db"), 0);
  const stated = runPlanUnder({ ...observeConditions(), database: "postgres" }, "plan.md", dir);
  assert.equal(verdict(stated), "holds");
  assert.equal(executions(dir, "db"), 1);
});

test("a Plan states a Carrier under parameters as a mapping, and is refused when it is not one", () => {
  const errors = (entries: string) => {
    const dir = scratch({ "plan.md": plan(entries), "a.test.ts": counting("a") });
    return readPlanSuites(dir, "plan.md").errors.map((e) => e.replace(/^.*plan\.md: /, ""));
  };
  assert.deepEqual(errors("  - carrier: a.test.ts\n    parameters:\n      platform: linux"), []);
  assert.deepEqual(errors("  - carrier: a.test.ts\n    parameters: {}"), [
    "a carrier under parameters must state parameters, a non-empty mapping of names to values",
  ]);
  assert.deepEqual(errors("  - carrier: a.test.ts"), [
    "a carrier under parameters must state parameters, a non-empty mapping of names to values",
  ]);
  assert.deepEqual(errors("  - parameters:\n      a: b"), ["a carrier must be a non-empty path"]);
  assert.deepEqual(errors("  - carrier: a.test.ts\n    parameters:\n      a: b\n    extra: 1"), [
    'a carrier under parameters has unknown "extra"',
  ]);
  assert.deepEqual(errors('  - carrier: a.test.ts\n    parameters:\n      a: "b c"'), [
    'parameter "a" must be a plain name with a plain string value',
  ]);
  assert.deepEqual(errors("  - carrier: a.test.ts\n    parameters:\n      a: 1"), [
    'parameter "a" must be a plain name with a plain string value',
  ]);
  assert.deepEqual(errors('  - carrier: a.test.ts\n    parameters:\n      "a=b": c'), [
    'parameter "a=b" must be a plain name with a plain string value',
  ]);
  assert.deepEqual(errors("  - carrier: ../a.test.ts\n    parameters:\n      a: b"), [
    'carrier "../a.test.ts" must be a relative posix path beneath the root',
  ]);
  assert.deepEqual(errors("  - carrier: missing.test.ts\n    parameters:\n      a: b"), [
    "missing.test.ts: not a Case file",
  ]);
});

test("a report reads back to the outcomes of its Run, and is refused when it is not one", () => {
  const dir = oneHow();
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
    unrun: [],
  });
});

test("Runs are Runs of one Plan only when they require the same instances, and no Run is no evidence", () => {
  const run = (plan: string, passed: string[], unrun: string[] = []) => ({ plan, passed, failed: [], unrun });
  assert.deepEqual(planEvidence([]).errors, ["no Run to show anything of the Plan"]);
  assert.deepEqual(planEvidence([run("p", ["a"]), run("q", ["a", "b"])]).errors, [
    "Run 2 (q) does not require the instances of Run 1 (p)",
  ]);
  assert.deepEqual(planEvidence([run("p", ["a"], ["b"]), run("p", ["a"], ["c"])]).errors, [
    "Run 2 (p) does not require the instances of Run 1 (p)",
  ]);
  assert.equal(
    planEvidence([run("p", ["a"], ["b"]), run("q", ["b"], ["a"])]).evidence?.evidenced,
    true,
    "the same instances under two paths are the same Plan's",
  );
});

test("run.ts exits 0 only when the Plan holds, 1 when an instance fails, and 3 when the Run is incomplete; evidence.ts exits 0 only when evidenced", () => {
  const dir = oneHow();
  const run = (script: string, ...args: string[]) =>
    spawnSync(process.execPath, [...process.execArgv, script, ...args], { cwd: dir, encoding: "utf8" });
  const partial = run(RUN, "plan.md");
  assert.equal(partial.status, 3, partial.stderr);
  assert.match(partial.stdout, new RegExp(`\\nunrun behaves\\.test\\.ts\\[platform=${elsewhere}\\]\\nincomplete\\n$`));
  assert.match(partial.stderr, /^--- behaves\.test\.ts\[platform=\w+\]\nnot performed: it is under platform /);
  fs.writeFileSync(path.join(dir, "here.txt"), partial.stdout);
  const alone = run(EVIDENCE, "here.txt");
  assert.equal(alone.status, 1);
  assert.equal(alone.stdout, `pass ${mine}\nunevidenced ${theirs}\nnot evidenced\n`);
  fs.writeFileSync(
    path.join(dir, "elsewhere.txt"),
    report(runPlanUnder({ ...observeConditions(), platform: elsewhere }, "plan.md", dir)),
  );
  const both = run(EVIDENCE, "here.txt", "elsewhere.txt");
  assert.equal(both.status, 0, both.stderr);
  assert.equal(both.stdout, `${[`pass ${mine}`, `pass ${theirs}`].sort().join("\n")}\nevidenced\n`);
  assert.equal(run(EVIDENCE).status, 2);
  fs.writeFileSync(path.join(dir, "junk.txt"), "nonsense");
  assert.equal(run(EVIDENCE, "junk.txt").status, 1);
  const holds = spawnSync(process.execPath, [...process.execArgv, RUN, "plan.md", candidateData("marked")], {
    cwd: rootData("holds"),
    encoding: "utf8",
  });
  assert.equal(holds.status, 0);
});
