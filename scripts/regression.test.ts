import assert from "node:assert/strict";
import test from "node:test";
import { changeSuites, collectionErrors, plans, runRegression } from "./regression.js";
import { regressionData } from "./test-data.js";

// How KAAL composes testing with managing-change.
// Why: brain/learning/regression-testing/26/09/30/01/nodes/testing.md

test("a Change's Test Suite is its test/, collected by its evolution's Regression Test Plan", () => {
  const repo = regressionData("collected");
  assert.deepEqual([...changeSuites(repo)], [["one", ["change/one/26/09/30/01/test"]]]);
  assert.deepEqual(
    [...plans(repo)],
    [
      ["one", "test/regression/one.json"],
      ["zero", "test/regression/zero.json"],
    ],
  );
  assert.deepEqual(collectionErrors(repo), []);
});

test("the regression runs every Plan against the repository, and holds when every collected Case passes", () => {
  const runs = runRegression(regressionData("collected"));
  assert.deepEqual(
    runs.map((run) => [run.plan, run.observations.map((o) => o.case), run.holds]),
    [
      ["test/regression/one.json", ["change/one/26/09/30/01/test/a.test.mjs"], true],
      ["test/regression/zero.json", [], true],
    ],
  );
});

test("refuses to run when a Plan does not collect exactly the Test Suites its evolution's Changes own", () => {
  const repo = regressionData("uncollected");
  assert.deepEqual(collectionErrors(repo), [
    "test/regression/two.json: missing, so change/two/26/09/30/01/test is collected by no plan",
    "test/regression/one.json: does not collect change/one/26/09/30/01/test",
    "test/regression/one.json: collects change/two/26/09/30/01/test, which no Change of one owns",
  ]);
  assert.throws(() => runRegression(repo), /^Error: refusing to run the regression:\n/);
});
