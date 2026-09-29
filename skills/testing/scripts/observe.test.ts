import assert from "node:assert/strict";
import test from "node:test";
import { type Address, observe, type Report } from "./observe.js";
import { runData } from "./test-data.js";

test("a run observes each case its testing state holds as passed, failed or not run, a skip is never a pass, and a report no case accounts for observes none", () => {
  const cases = runData("cases") as Address[];
  const reports = runData("reports") as Report[];
  assert.deepEqual(observe(cases, reports), runData("observed"));
});
