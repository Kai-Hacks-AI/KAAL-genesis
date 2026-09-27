import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runTrusted, TESTED_STATE, TESTING_STATE } from "./regression.js";
import { PLAN, planCommitments } from "./links.js";
import { planRequirements } from "./plans.js";
import { PLAN_DATA, planEvidence, type Run, testRun } from "./run.js";
import { escapingState, kaal, regressionCandidate, replayTrusted, runState } from "./test-data.js";

const RUN = "brain/learning/genesis/26/09/27/05/nodes/run.md";

/** What a run observed, by case title, for reading. */
function observed(run: Run): Record<string, string> {
  return Object.fromEntries(run.observations.map((o) => [`${o.file}: ${o.title}`, o.observed]));
}

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a run of a state's own cases observes each as passed, failed or not run, and a skipped case is never passed", () => {
  const greeter = runState("greeter");
  const run = testRun({ testing: greeter });
  assert.equal(run.tested, run.testing);
  assert.deepEqual(observed(run), {
    "scripts/greeting.test.ts: the state says hello": "passed",
    "scripts/greeting.test.ts: is run only off Windows": process.platform === "win32" ? "not run" : "passed",
    "scripts/greeting.test.ts: waves": "not run",
  });
  assert.deepEqual(run.unaccounted, []);
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a case marked todo still runs, so it is observed as it went; only a case marked skipped, for any reason or none, is not run", () => {
  assert.deepEqual(observed(testRun({ testing: runState("todo") })), {
    "scripts/todo.test.ts: holds, though marked todo": "passed",
    "scripts/todo.test.ts: breaks, though marked todo": "failed",
    "scripts/todo.test.ts: is skipped": "not run",
    "scripts/todo.test.ts: is skipped without a reason": "not run",
  });
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a case cancelled before it starts is not run, not failed, and its reported failure is kept apart to fail the run", () => {
  const run = testRun({ testing: runState("cancelled") });
  assert.deepEqual(observed(run), {
    "scripts/cancelled.test.ts: is cancelled before it starts": "not run",
    "scripts/cancelled.test.ts: breaks": "failed",
  });
  assert.deepEqual(run.unaccounted, [
    { file: "scripts/cancelled.test.ts", title: "is cancelled before it starts", outcome: "failed" },
  ]); // It keeps its own place: a later case at the same address is observed by its own report.
  const twice = testRun({ testing: runState("twice") });
  assert.deepEqual(
    twice.observations.map((o) => o.observed),
    ["not run", "passed"],
  );
  assert.equal(twice.unaccounted.length, 1);
  // One no case of the state names is kept apart once, as it was reported.
  assert.deepEqual(testRun({ testing: runState("nameless") }).unaccounted, [
    { file: "scripts/nameless.test.ts", title: "cancelled without a name", outcome: "failed" },
  ]);
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a case whose hook fails before it is not run, not failed, and the hook's failure is kept apart to fail the run", () => {
  const run = testRun({ testing: runState("hooked") });
  assert.deepEqual(observed(run), { "scripts/hooked.test.ts: never starts": "not run" });
  assert.deepEqual(run.unaccounted, [{ file: "scripts/hooked.test.ts", title: "never starts", outcome: "failed" }]);
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a run hands its cases the tested state it names: the same cases, from the same testing state, fail against one that breaks their claim", () => {
  const greeter = runState("greeter");
  const silent = runState("silent");
  const run = testRun({ testing: greeter, tested: silent });
  assert.deepEqual([run.testing, run.tested], [path.resolve(greeter), path.resolve(silent)]);
  // Which case each observation is of is read in the testing state; the tested state holds no cases at all.
  assert.equal(observed(run)["scripts/greeting.test.ts: the state says hello"], "failed");
  assert.equal(fs.existsSync(path.join(silent, "scripts")), false);
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a run records the conditions it was executed under, and what it observed holds under them: a case run only off Windows was not run on Windows", () => {
  // A given condition may have any name the run does not measure, even one every object inherits.
  const run = testRun({ testing: runState("greeter"), conditions: { checkout: "as copied", constructor: "given" } });
  assert.deepEqual(run.conditions, {
    platform: process.platform,
    runtime: `node ${process.version}`,
    checkout: "as copied",
    constructor: "given",
  });
  assert.equal(
    observed(run)["scripts/greeting.test.ts: is run only off Windows"],
    run.conditions.platform === "win32" ? "not run" : "passed",
  ); // What the run measures cannot be given: a run could otherwise claim a platform it was not executed on.
  assert.throws(
    () => testRun({ testing: runState("greeter"), conditions: { platform: "elsewhere" } }),
    /platform: a run measures it/,
  );
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a run refuses a case file its testing state names outside itself, rather than run it as the state's own", () => {
  assert.throws(() => testRun({ testing: escapingState() }), /a case file outside the testing state/);
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a run refuses a case file reached through a link, whose report would not be at its address in the testing state", () => {
  const linked = runState("greeter");
  fs.renameSync(path.join(linked, "scripts"), path.join(linked, "cases"));
  // A junction, so a directory link can be made on every platform without special rights.
  fs.symlinkSync(path.join(linked, "cases"), path.join(linked, "scripts"), "junction");
  assert.throws(() => testRun({ testing: linked }), /a case file reached through a link/);
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a run refuses a testing state whose manifest is reached through a link, which would select its cases from elsewhere", () => {
  const linked = runState("greeter");
  const manifest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kaal-manifest-")), "package.json");
  fs.renameSync(path.join(linked, "package.json"), manifest);
  fs.symlinkSync(manifest, path.join(linked, "package.json"));
  assert.throws(() => testRun({ testing: linked }), /package\.json: a manifest reached through a link/);
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a case titled with its own file's path is that case, and a file that does not run as a whole is that file, whatever its cases are titled", () => {
  assert.deepEqual(observed(testRun({ testing: runState("titled") })), {
    "scripts/titled.test.ts: scripts/titled.test.ts": "passed",
    "scripts/titled.test.ts: breaks": "failed",
  });
  // A case declared on the first line is reported where a file's own report is: the source shows it is a case.
  assert.deepEqual(observed(testRun({ testing: runState("lineone") })), {
    "scripts/lineone.test.ts: scripts/lineone.test.ts": "passed",
  });
  // Such a case in a file that fails before declaring it was not run: the failure is the file's.
  const unresolved = testRun({ testing: runState("unresolved") });
  assert.deepEqual(observed(unresolved), { "scripts/unresolved.test.ts: scripts/unresolved.test.ts": "not run" });
  assert.equal(unresolved.unaccounted.length, 1);
  const unloadable = testRun({ testing: runState("unloadable") });
  assert.deepEqual(observed(unloadable), { "scripts/unloadable.test.ts: scripts/unloadable.test.ts": "not run" });
  assert.deepEqual(unloadable.unaccounted, [
    { file: "scripts/unloadable.test.ts", title: "scripts/unloadable.test.ts", outcome: "failed" },
  ]);
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a run whose executor stops before it has reported every case is refused, never read as cases not run", () => {
  assert.throws(() => testRun({ testing: runState("killer") }), /the test runner did not complete/);
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a testing state given by a link is run where it really is, and its cases are observed at their addresses", () => {
  const linked = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kaal-linked-")), "greeter");
  // A junction, so a directory link can be made on every platform without special rights.
  fs.symlinkSync(runState("greeter"), linked, "junction");
  assert.equal(observed(testRun({ testing: linked }))["scripts/greeting.test.ts: the state says hello"], "passed");
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a run of a state whose cases name no file executes nothing: it does not look for cases the state never named", () => {
  const run = testRun({ testing: runState("empty") });
  assert.deepEqual([run.observations, run.unaccounted], [[], []]);
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("the trusted replay hands the accepted cases the candidate itself as their tested state, not the copy they are run in", () => {
  const results = runTrusted(replayTrusted(), regressionCandidate("moved"));
  assert.deepEqual(
    results.filter((r) => r.file === "scripts/subject.test.ts"),
    [{ file: "scripts/subject.test.ts", name: "judges the candidate itself", outcome: "pass" }],
  );
  // As a run does, the replay takes a case marked todo as it went: its body ran and held.
  assert.deepEqual(
    results.filter((r) => r.file === "scripts/todo.test.ts"),
    [{ file: "scripts/todo.test.ts", name: "holds, though marked todo", outcome: "pass" }],
  );
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("a refactored case is at least as strong as the cases it replaces when every known breaking state that fails them fails it too", () => {
  const breaking = ["forgets-x", "forgets-y"].map(runState);
  const fails = (testing: string, tested: string) =>
    testRun({ testing, tested }).observations.some((o) => o.observed === "failed");
  const [before, after, weak] = ["before", "after", "after-weak"].map(runState);
  // Each breaking state breaks the claim for the old cases, and every refactoring passes the sound state.
  assert.deepEqual(
    breaking.map((b) => fails(before!, b)),
    [true, true],
  );
  for (const refactored of [after!, weak!]) assert.equal(fails(refactored, runState("sound")), false);
  assert.deepEqual(
    breaking.map((b) => fails(after!, b)),
    [true, true],
  );
  // The weaker one passes a state the old cases fail: the run shows it proves less.
  assert.deepEqual(
    breaking.map((b) => fails(weak!, b)),
    [true, false],
  );
});

// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
// Why: brain/learning/genesis/26/09/27/03/nodes/case.md
test("KAAL's cases about KAAL take the tested state their run names, refuse one named for another testing state, and without a run test the state they are kept in", () => {
  const saved = { tested: process.env[TESTED_STATE], testing: process.env[TESTING_STATE] };
  const set = (tested?: string, testing?: string) => {
    for (const [key, value] of [
      [TESTED_STATE, tested],
      [TESTING_STATE, testing],
    ] as const)
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  };
  try {
    set(undefined, undefined);
    const own = kaal();
    assert.ok(fs.existsSync(path.join(own, RUN)));
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-tested-"));
    set(other, own);
    assert.equal(kaal(), other);
    set(other, other);
    assert.throws(() => kaal(), /names a tested state for another testing state/);
    set(path.join(other, "missing"), own);
    assert.throws(() => kaal(), /is not a directory/);
  } finally {
    set(saved.tested, saved.testing);
  }
});

const HELLO_BY_NAME = "scripts/hello.test.ts: says hello to whoever it is given, by name";

// Why: brain/learning/genesis/26/09/27/06/nodes/suite.md
test("a run of a suite reaches every case that belongs to it and no other, and a case in two suites is reached by the run of each", () => {
  const state = runState("suites");
  const greeting = testRun({ testing: state, suite: "suites/greeting.md" });
  assert.equal(greeting.suite, "suites/greeting.md");
  assert.deepEqual(observed(greeting), {
    "scripts/hello.test.ts: says hello": "passed",
    [HELLO_BY_NAME]: "passed",
    "scripts/hello.test.ts: says hello in Welsh": "not run",
  });
  assert.deepEqual(greeting.unaccounted, []);
  const names = testRun({ testing: state, suite: "suites/names.md" });
  assert.deepEqual(observed(names), {
    [HELLO_BY_NAME]: "passed",
    "scripts/farewell.test.ts: says goodbye to whoever it is given, by name": "passed",
  });
  assert.deepEqual(names.unaccounted, []);
  // The case that belongs to neither fails: a run of every case the state selects observes it, neither suite's run does.
  const every = testRun({ testing: state });
  assert.equal(every.suite, undefined);
  assert.equal(observed(every)["scripts/farewell.test.ts: waves"], "failed");
});

// Why: brain/learning/genesis/26/09/27/06/nodes/suite.md
test("a run of a suite hands its cases the tested state, and records the run's conditions: a suite brings none of its own", () => {
  const farewells = runState("suites");
  fs.writeFileSync(path.join(farewells, "goodbye-name.txt"), "farewell, %s\n");
  const run = testRun({
    testing: runState("suites"),
    tested: farewells,
    suite: "suites/names.md",
    conditions: { checkout: "plain" },
  });
  assert.deepEqual(observed(run), {
    [HELLO_BY_NAME]: "passed",
    "scripts/farewell.test.ts: says goodbye to whoever it is given, by name": "failed",
  });
  assert.deepEqual(Object.keys(run.conditions).sort(), ["checkout", "platform", "runtime"]);
});

// Why: brain/learning/genesis/26/09/27/06/nodes/suite.md
test("a run of a suite is refused for one its testing state does not state, or states through a link, and where a skill's case says it belongs", () => {
  const state = runState("suites");
  assert.throws(
    () => testRun({ testing: state, suite: "suites/farewells.md" }),
    /suites\/farewells\.md: no suite is stated there/,
  );
  assert.throws(() => testRun({ testing: state, suite: "suites/../suites/names.md" }), /not a suite's place/);
  // A skill's case belongs to none of the state's suites, so a state where one says it does is refused, not run.
  const skilled = runState("suites");
  fs.mkdirSync(path.join(skilled, "skills", "demo", "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(skilled, "skills", "demo", "scripts", "demo.test.ts"),
    'import test from "node:test";\n\n// Suite: suites/names.md\ntest("says hello", () => {});\n',
  );
  const pkg = path.join(skilled, "package.json");
  fs.writeFileSync(
    pkg,
    fs.readFileSync(pkg, "utf8").replace("scripts/*.test.ts", "skills/*/scripts/*.test.ts scripts/*.test.ts"),
  );
  assert.throws(
    () => testRun({ testing: skilled, suite: "suites/names.md" }),
    /skills\/demo\/scripts\/demo\.test\.ts: "says hello" is a skill's case, so it belongs to none of the state's suites/,
  );
  const linked = runState("suites");
  fs.renameSync(path.join(linked, "suites"), path.join(linked, "stated"));
  // A junction, so a directory link can be made on every platform without special rights.
  fs.symlinkSync(path.join(linked, "stated"), path.join(linked, "suites"), "junction");
  assert.throws(
    () => testRun({ testing: linked, suite: "suites/names.md" }),
    /suites\/names\.md: a suite stated through a link/,
  );
});

// Why: brain/learning/genesis/26/09/27/06/nodes/suite.md
test("a case moved to another file and retitled stays in its suites, and cases merged into one case over their data stay in every suite they belonged to", () => {
  const byName = {
    "suites-moved": "scripts/by-name.test.ts: greets by name whoever it is given",
    "suites-merged": "scripts/hello.test.ts: says hello, by name to whoever it is given one",
  };
  for (const [name, refactored] of Object.entries(byName)) {
    const state = runState(name);
    assert.deepEqual(
      Object.keys(observed(testRun({ testing: state, suite: "suites/names.md" }))).sort(),
      [refactored, "scripts/farewell.test.ts: says goodbye to whoever it is given, by name"].sort(),
      name,
    );
    const greeting = observed(testRun({ testing: state, suite: "suites/greeting.md" }));
    assert.equal(greeting[refactored], "passed", name);
    assert.equal(greeting["scripts/hello.test.ts: says hello in Welsh"], "not run", name);
  }
});

// Why: brain/learning/genesis/26/09/27/06/nodes/suite.md
test("a suite no case belongs to yet is still that suite: a run of it reaches nothing and observes nothing, which is no evidence", () => {
  const run = testRun({ testing: runState("suites"), suite: "suites/welsh.md" });
  assert.equal(run.suite, "suites/welsh.md");
  assert.deepEqual(run.observations, []);
  assert.deepEqual(run.unaccounted, []);
});

const GREETING_PLAN = "plans/greeting.md";
const HELLO = "scripts/hello.test.ts: says hello";
const GOODBYE_BY_NAME = "scripts/farewell.test.ts: says goodbye to whoever it is given, by name";

/** What a run of a plan observed of each requirement, by name, for reading. */
function shown(run: Run): Record<string, string[]> {
  return Object.fromEntries(
    (run.requirements ?? []).map((r) => [r.name, r.observations.map((o) => `${o.file}: ${o.title}: ${o.observed}`)]),
  );
}

// Why: brain/learning/genesis/26/09/27/07/nodes/plan.md
test("a run of a plan reaches only the cases of the suites that say they serve it, each once, and records what it observed of each", () => {
  const run = testRun({ testing: runState("plans"), plan: GREETING_PLAN });
  assert.equal(run.plan, GREETING_PLAN);
  // Not the case that belongs to no suite, which fails, nor the Welsh one, whose suite serves another plan.
  assert.deepEqual(observed(run), {
    [GOODBYE_BY_NAME]: "passed",
    [HELLO]: "passed",
    [HELLO_BY_NAME]: "passed",
  });
  assert.deepEqual(shown(run), {
    "suites/greeting.md": [`${HELLO}: passed`, `${HELLO_BY_NAME}: passed`],
    "suites/names.md": [`${GOODBYE_BY_NAME}: passed`, `${HELLO_BY_NAME}: passed`],
  });
  assert.deepEqual(run.unaccounted, []);
});

// Why: brain/learning/genesis/26/09/27/07/nodes/plan.md
test("one suite serves several plans, and a plan keeps its purpose, unchanged, while the suites that carry it are replaced beneath it", () => {
  assert.deepEqual(shown(testRun({ testing: runState("plans"), plan: "plans/naming.md" })), {
    "suites/names.md": [`${GOODBYE_BY_NAME}: passed`, `${HELLO_BY_NAME}: passed`],
  });
  const [before, after] = [runState("plans"), runState("plans-decomposed")];
  assert.equal(
    fs.readFileSync(path.join(after, GREETING_PLAN), "utf8"),
    fs.readFileSync(path.join(before, GREETING_PLAN), "utf8"),
  );
  assert.deepEqual(shown(testRun({ testing: after, plan: GREETING_PLAN })), {
    "suites/names.md": [`${GOODBYE_BY_NAME}: passed`, `${HELLO_BY_NAME}: passed`],
    "suites/plain-hello.md": [`${HELLO}: passed`],
  });
});

// Why: brain/learning/genesis/26/09/27/07/nodes/plan.md
test("a plan stated before any suite serves it, or served only by testing that did not run, shows no positive evidence", () => {
  const state = runState("plans");
  const farewell = testRun({ testing: state, plan: "plans/farewell.md" });
  assert.deepEqual([farewell.observations, farewell.requirements], [[], []]);
  assert.equal(planEvidence(state, "plans/farewell.md", [farewell]).verdict, "not demonstrated");
  const welsh = testRun({ testing: state, plan: "plans/welsh.md" });
  assert.deepEqual(shown(welsh), { "suites/welsh.md": ["scripts/welsh.test.ts: says hello in Welsh: not run"] });
  assert.equal(planEvidence(state, "plans/welsh.md", [welsh]).verdict, "not demonstrated");
});

// Why: brain/learning/genesis/26/09/27/07/nodes/plan.md
test("a plan's data is handed to the cases its run reaches, through whichever suite, and only they know how to use it", () => {
  const state = runState("plans");
  fs.writeFileSync(path.join(state, "plan-data", "greeting", "word.txt"), "hi\n");
  // The same plan, other data: both cases that use it, reached through different suites, now observe it; the one that
  // does not use it is observed as before.
  assert.deepEqual(observed(testRun({ testing: state, plan: GREETING_PLAN })), {
    [GOODBYE_BY_NAME]: "passed",
    [HELLO]: "failed",
    [HELLO_BY_NAME]: "failed",
  });
  // The data is the plan's: a run of the suite alone hands none, and the cases use their own, even when the run is
  // started from within a run of a plan, which handed data of its own.
  const outer = process.env[PLAN_DATA];
  process.env[PLAN_DATA] = path.join(state, "plan-data", "greeting");
  try {
    assert.equal(observed(testRun({ testing: state, suite: "suites/greeting.md" }))[HELLO], "passed");
  } finally {
    if (outer === undefined) delete process.env[PLAN_DATA];
    else process.env[PLAN_DATA] = outer;
  }
});

// Why: brain/learning/genesis/26/09/27/07/nodes/plan.md
test("a plan's conditions are what it requires, and a run records the conditions it had: one run demonstrates a plan only under its own", () => {
  const state = runState("plans");
  const run = testRun({ testing: state, plan: GREETING_PLAN });
  const here = process.platform === "win32" ? "win32" : "linux";
  const judged = planEvidence(state, GREETING_PLAN, [run]);
  assert.deepEqual(
    judged.requirements.map((r) => r.name),
    ["suite: suites/greeting.md", "suite: suites/names.md"],
  );
  assert.deepEqual(
    judged.requirements.map((r) => r.under.map((u) => `${u.conditions.platform}: ${u.verdict}`)),
    [0, 1].map(() =>
      ["linux", "win32"].map((platform) => `${platform}: ${platform === here ? "held" : "not demonstrated"}`),
    ),
  );
  assert.equal(judged.verdict, "not demonstrated");
  // A commitment and a suite of the same name are two requirements: one's observations never stand for the other's.
  // Only the Regression Plan names commitments, so the two meet there, in a state whose suite serves it.
  const alike = runState("plans");
  fs.mkdirSync(path.join(alike, "test"));
  fs.writeFileSync(
    path.join(alike, PLAN),
    "# Regression\n\n## Commitments\n\n1. Greeting. Stated in `suites/greeting.md`. Shown by its cases.\n",
  );
  fs.appendFileSync(path.join(alike, "suites", "greeting.md"), `\nServes: ${PLAN}\n`);
  const both = planEvidence(alike, PLAN, [testRun({ testing: alike, plan: PLAN })]);
  const verdictOf = (name: string) => both.requirements.find((r) => r.name === name)?.under[0]?.verdict;
  assert.deepEqual(
    [verdictOf("commitment: suites/greeting.md"), verdictOf("suite: suites/greeting.md")],
    ["not demonstrated", "held"],
  );
  // The Regression Plan's own entries are read as its links check reads them: one that says not where it is stated is
  // refused, never dropped from what the plan requires.
  const unreadable = path.join(alike, PLAN);
  fs.appendFileSync(unreadable, "2. Farewell, somewhere. Shown by its cases.\n");
  assert.throws(() => testRun({ testing: alike, plan: PLAN }), /does not say where it is stated/);
  fs.writeFileSync(
    unreadable,
    fs.readFileSync(unreadable, "utf8").replace("2. Farewell, somewhere. Shown by its cases.\n", ""),
  );
  // Also when the Regression Plan begins with its commitments.
  const bare = fs.readFileSync(unreadable, "utf8");
  fs.writeFileSync(
    unreadable,
    bare.slice(bare.indexOf("## Commitments")).replace("1. Greeting. Stated in", "1. Greeting, in"),
  );
  assert.throws(() => testRun({ testing: alike, plan: PLAN }), /does not say where it is stated/);
  fs.writeFileSync(unreadable, bare);
  // A plan other than the Regression Plan that names commitments is refused before anything runs.
  fs.appendFileSync(
    path.join(alike, GREETING_PLAN),
    "\n## Commitments\n\n1. Greeting. Stated in `suites/greeting.md`. Shown by its cases.\n",
  );
  assert.throws(
    () => testRun({ testing: alike, plan: GREETING_PLAN }),
    /names commitments, which only the Regression Plan does/,
  );
  assert.throws(() => planEvidence(state, GREETING_PLAN, [{ ...run, plan: "plans/naming.md" }]), /shows nothing of/);
  // Runs show a plan together only of one tested state, from one testing state, both named as the runs name them.
  assert.throws(() => planEvidence(runState("plans"), GREETING_PLAN, [run]), /a run from another testing state/);
  assert.throws(
    () => planEvidence(state, GREETING_PLAN, [run, { ...run, tested: runState("plans") }]),
    /runs of different tested states/,
  );
});

// Why: brain/learning/genesis/26/09/27/07/nodes/plan.md
test("a run of a plan is refused for one its testing state does not state, or states through a link, and for one it cannot read", () => {
  const state = runState("plans");
  assert.throws(
    () => testRun({ testing: state, plan: "plans/unknown.md" }),
    /plans\/unknown\.md: no plan is stated there/,
  );
  assert.throws(() => testRun({ testing: state, plan: "suites/names.md" }), /not a plan's place/);
  assert.throws(() => testRun({ testing: state, suite: "suites/names.md", plan: "plans/naming.md" }), /not of both/);
  fs.appendFileSync(
    path.join(state, "plans", "naming.md"),
    "\n## As runs read it\n\n```yaml\nsuites: [suites/names.md]\n```\n",
  );
  assert.throws(() => testRun({ testing: state, plan: "plans/naming.md" }), /runs read no suites of a plan/);
  const linked = runState("plans");
  fs.renameSync(path.join(linked, "plans"), path.join(linked, "stated"));
  // A junction, so a directory link can be made on every platform without special rights.
  fs.symlinkSync(path.join(linked, "stated"), path.join(linked, "plans"), "junction");
  assert.throws(() => testRun({ testing: linked, plan: GREETING_PLAN }), /a plan stated through a link/);
  // A state whose plans its links check refuses is not run, such as one whose suite's line serves no plan as written.
  const miswritten = runState("plans");
  fs.appendFileSync(path.join(miswritten, "suites", "welsh.md"), "\nserves: plans/greeting.md\n");
  assert.throws(() => testRun({ testing: miswritten, plan: GREETING_PLAN }), /a line that serves no plan/);
  // Nor one whose suites are stated where no directory is: no suite is then dropped from what the plan requires.
  const flat = runState("plans");
  fs.rmSync(path.join(flat, "suites"), { recursive: true });
  fs.writeFileSync(path.join(flat, "suites"), "not a directory\n");
  assert.throws(() => testRun({ testing: flat, plan: GREETING_PLAN }), /suites: not a directory/);
  // A suite that serves a plan is one its state states itself, never one reached through a link.
  const outside = runState("plans");
  fs.renameSync(path.join(outside, "suites"), path.join(outside, "elsewhere"));
  fs.symlinkSync(path.join(outside, "elsewhere"), path.join(outside, "suites"), "junction");
  assert.throws(() => testRun({ testing: outside, plan: GREETING_PLAN }), /a suite stated through a link/);
});

// Why: brain/learning/genesis/26/09/27/07/nodes/plan.md
test("KAAL's Regression Plan requires its commitments, the suites that serve it and the seal checks, under the conditions it states, and names no case", () => {
  const requirements = planRequirements(kaal(), PLAN);
  const kinds = (kind: string) => requirements.filter((r) => r.kind === kind);
  const places = planCommitments(fs.readFileSync(path.join(kaal(), PLAN), "utf8"));
  assert.deepEqual(
    kinds("commitment").map((r) => r.name),
    places,
  );
  assert.ok(kinds("suite").some((r) => r.name === "suites/without-git.md"));
  assert.deepEqual(kinds("proof"), [{ name: "the seal checks", kind: "proof", under: [{ platform: "linux" }] }]);
  for (const r of [...kinds("commitment"), ...kinds("suite")])
    assert.deepEqual(r.under.map((c) => c.platform).sort(), ["linux", "win32"], r.name);
});
