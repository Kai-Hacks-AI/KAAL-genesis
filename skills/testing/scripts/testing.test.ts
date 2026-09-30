import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { candidateData, planData, rootData } from "./test-data.js";
import { readPlan, readPlanSuites, report, runPlan } from "./testing.js";

const RUN = fileURLToPath(new URL("./run.ts", import.meta.url));
const outcomes = (run: ReturnType<typeof runPlan>) =>
  run.observations.map((o) => `${o.passed ? "pass" : "fail"} ${o.case}`);

test("a Plan collects its Suites, and each Suite every Case beneath it, in sorted order", () => {
  const { suites, errors } = readPlanSuites(rootData("fails"), "plan.json");
  assert.deepEqual(errors, []);
  assert.deepEqual(suites, [
    {
      place: "suites/mixed",
      concern: "Cases that prove nothing or fail.",
      cases: ["fails.test.ts", "no-test.test.ts", "skips.test.ts"],
    },
    { place: "suites/marked", concern: "The candidate carries its marker.", cases: ["marked.test.ts"] },
  ]);
});

test("a Plan holds when every Case of every Suite it collects passes against the candidate", () => {
  const run = runPlan("plan.json", rootData("holds"), candidateData("marked"));
  assert.deepEqual(outcomes(run), ["pass suites/marked/nested/marked.test.ts"]);
  assert.equal(run.holds, true);
  assert.equal(run.candidate, candidateData("marked"));
  assert.equal(run.conditions, `node ${process.version} ${process.platform} ${process.arch}`);
  assert.equal(
    report(run),
    [
      "plan plan.json",
      `candidate ${candidateData("marked")}`,
      `conditions ${run.conditions}`,
      "pass suites/marked/nested/marked.test.ts",
      "holds",
    ].join("\n"),
  );
});

test("Cases judge the candidate, not the testing root they are read from", () => {
  const run = runPlan("plan.json", rootData("holds"));
  assert.deepEqual(outcomes(run), ["fail suites/marked/nested/marked.test.ts"]);
  assert.equal(run.holds, false);
});

test("a failing Case, a Case that runs no test and a Case that skips one do not pass; every Case still runs", () => {
  const run = runPlan("plan.json", rootData("fails"), candidateData("marked"));
  assert.deepEqual(outcomes(run), [
    "fail suites/mixed/fails.test.ts",
    "fail suites/mixed/no-test.test.ts",
    "fail suites/mixed/skips.test.ts",
    "pass suites/marked/marked.test.ts",
  ]);
  assert.equal(run.holds, false);
  assert.match(report(run), /\ndoes not hold$/);
});

test("a Plan that collects no Suite yet holds, having run nothing", () => {
  const run = runPlan("plan.json", rootData("empty"));
  assert.deepEqual(run.observations, []);
  assert.equal(run.holds, true);
});

test("refuses a broken Plan or Suite before running any Case", () => {
  assert.deepEqual(readPlanSuites(rootData("broken"), "plan.json").errors, [
    `suites/no-file/suite.json: unreadable suite (ENOENT: no such file or directory, open '${path.join(rootData("broken"), "suites", "no-file", "suite.json")}')`,
    "suites/no-case: holds no Case",
    'suites/bad/suite.json: unknown "cases"',
    "suites/bad/suite.json: concern must be a non-empty string",
    "suites/missing: not a directory",
  ]);
  assert.throws(() => runPlan("plan.json", rootData("broken")), /^Error: refusing to run plan\.json:\n/);
});

test("refuses what is not a Plan: unreadable, not an object, wrong fields, suites not beneath the root or collected twice", () => {
  const errors = (name: string) => readPlan(planData(name)).errors.map((e) => e.slice(planData(name).length + 2));
  assert.match(errors("not-json")[0], /^unreadable plan \(/);
  assert.deepEqual(errors("list"), ["a plan must be an object"]);
  assert.deepEqual(errors("fields"), [
    'unknown "strategy"',
    "concern must be a non-empty string",
    "suites must be a list",
  ]);
  assert.deepEqual(errors("places"), [
    "a suite must be a non-empty path",
    'suite "/abs" must be a relative posix path beneath the root',
    'suite "C:/abs" must be a relative posix path beneath the root',
    'suite "a\\b" must be a relative posix path beneath the root',
    'suite "../up" must be a relative posix path beneath the root',
    'suite "a/./b" must be a relative posix path beneath the root',
    'suite "a//b" must be a relative posix path beneath the root',
    'suite "a/" must be a relative posix path beneath the root',
    "a suite must be a non-empty path",
    'suite "twice" is collected twice',
  ]);
});

test("run.ts prints the Run and exits 0 only when the Plan holds", () => {
  const run = (root: string, ...args: string[]) =>
    spawnSync(process.execPath, [...process.execArgv, RUN, ...args], { cwd: root, encoding: "utf8" });
  const holds = run(rootData("holds"), "plan.json", candidateData("marked"));
  assert.equal(holds.status, 0, holds.stderr);
  assert.match(holds.stdout, /\npass suites\/marked\/nested\/marked\.test\.ts\nholds\n$/);
  const fails = run(rootData("fails"), "plan.json", candidateData("marked"));
  assert.equal(fails.status, 1);
  assert.match(fails.stdout, /\ndoes not hold\n$/);
  assert.match(fails.stderr, /^--- suites\/mixed\/fails\.test\.ts\n/);
  assert.equal(run(rootData("broken"), "plan.json").status, 1);
  assert.equal(run(rootData("holds")).status, 2);
});
