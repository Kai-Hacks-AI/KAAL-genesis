import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runTrusted, TESTED_STATE, TESTING_STATE } from "./regression.js";
import { type Run, testRun } from "./run.js";
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
