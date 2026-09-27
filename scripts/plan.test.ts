import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PLAN } from "./links.js";
import { type Plan, planRun, readPlan } from "./plan.js";
import { kaal } from "./test-data.js";

const DATA = fileURLToPath(new URL("../test-data/", import.meta.url));

/** Path to a testing state under test-data/ by directory name. */
function planState(...segments: string[]): string {
  return path.join(DATA, ...segments);
}

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("readPlan reads the Regression Plan as a composition of Suites, never listing Cases", () => {
  const plan = readPlan(PLAN, kaal());
  // A Plan's path is where the plan file is kept.
  assert.equal(plan.path, PLAN);
  // The Plan has Suites (commitments), and there are 12 in KAAL's Regression Plan.
  assert.equal(plan.suites.length, 12);
  // Every Suite is identified by the place where its commitment is stated.
  assert.ok(plan.suites.every((s) => s.place.length > 0));
  // The Plan names no Case: no Case title appears in the Plan's Suites.
  // Cases are reached through Suites at run time, not enumerated by the Plan.
  for (const suite of plan.suites) {
    assert.ok(!suite.place.endsWith(".test.ts"), `suite place looks like a case file: ${suite.place}`);
  }
  // Every Suite says what shows it.
  assert.ok(plan.suites.every((s) => s.shownBy.length > 0));
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("conditions are a Plan-level concern, not a Case concern", () => {
  const plan = readPlan(PLAN, kaal());
  // The Plan states conditions: platforms and runtimes the Plan requires demonstrated.
  assert.ok(plan.conditions.length > 0, "the Regression Plan must name at least one condition");
  // Linux and Windows appear in the Plan's conditions.
  const text = plan.conditions.join("\n");
  assert.match(text, /linux/i);
  assert.match(text, /windows/i);
  // Conditions belong to the Plan, not to any individual Case or Suite.
  // No Suite carries a platform or runtime constraint of its own.
  for (const suite of plan.suites) {
    assert.ok(!suite.place.includes("linux"), `suite place encodes a platform: ${suite.place}`);
    assert.ok(!suite.place.includes("windows"), `suite place encodes a platform: ${suite.place}`);
  }
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("the Regression Plan's Suites are not exclusively owned by it: the same Suite place can be required by another Plan", () => {
  const regressionPlan = readPlan(PLAN, kaal());
  // Construct a second Plan that requires a subset of the same Suites.
  // This is how Plan A and Plan B can share Suite X without Suite X belonging to either.
  const sharedSuite = regressionPlan.suites[0]!;
  const anotherPlan: Plan = {
    path: "test/another-plan.md",
    suites: [sharedSuite],
    conditions: ["Linux"],
  };
  // Both Plans reference the same Suite place. Neither owns it.
  assert.equal(regressionPlan.suites[0]!.place, anotherPlan.suites[0]!.place);
  // The Regression Plan's Suite list is unchanged.
  assert.equal(regressionPlan.suites.length, 12);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("planRun on a small testing state reaches Cases through their Suites, not directly", () => {
  const testing = planState("regression", "trusted");
  const plan = readPlan("test/regression-plan.md", testing);
  // The trusted plan has exactly 2 Suites.
  assert.equal(plan.suites.length, 2);
  assert.deepEqual(
    plan.suites.map((s) => s.place),
    ["src/add.ts", "brain/learning/k/26/01/01/01/nodes/greeting.md"],
  );
  const result = planRun({ plan, testing });
  // The Plan Run has one SuiteRun per Suite.
  assert.equal(result.suites.length, 2);
  // Cases are reached through Suites: observations are grouped by the Suite each Case helps prove.
  const [adding, greeting] = result.suites;
  // Two cases point at src/add.ts; one points at the greeting commitment.
  assert.equal(adding!.place, "src/add.ts");
  assert.ok(adding!.observations.length >= 2, `expected ≥2 observations for src/add.ts, got ${adding!.observations.length}`);
  assert.equal(greeting!.place, "brain/learning/k/26/01/01/01/nodes/greeting.md");
  assert.equal(greeting!.observations.length, 1);
  // Every Suite observation came from a Case that points at that Suite — no Case is listed by the Plan.
  for (const suiteRun of result.suites) {
    for (const obs of suiteRun.observations) {
      assert.ok(obs.file.endsWith(".test.ts"), `observation is not from a case file: ${obs.file}`);
    }
  }
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("changing which Cases belong to a Suite does not require changing the Plan", () => {
  // Start from the trusted regression: a well-known small testing state.
  const base = planState("regression", "trusted");
  const plan = readPlan("test/regression-plan.md", base);
  // Make a copy of the testing state and add an extra Case for src/add.ts.
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-plan-"));
  fs.cpSync(base, copy, { recursive: true });
  const extraCase = [
    `import assert from "node:assert/strict";`,
    `import test from "node:test";`,
    `import { add } from "../src/add.js";`,
    ``,
    `// Why: src/add.ts`,
    `test("adds negatives", () => {`,
    `  assert.equal(add(-1, -2), -3);`,
    `});`,
  ].join("\n");
  // The trusted plan's npm test is "tsx --test scripts/*.test.ts",
  // so adding a new file in scripts/ means the extra case is picked up.
  fs.writeFileSync(path.join(copy, "scripts", "extra.test.ts"), extraCase);
  // Re-read the plan from the copy: the plan file is unchanged.
  const planFromCopy = readPlan("test/regression-plan.md", copy);
  // The Plan is the same — it still names the same two Suites, with no Case titles.
  assert.deepEqual(planFromCopy.suites, plan.suites);
  assert.deepEqual(planFromCopy.conditions, plan.conditions);
  // Run the plan against both states: the Plan is the same, but the Suite observations differ.
  const resultBase = planRun({ plan, testing: base });
  const resultCopy = planRun({ plan: planFromCopy, testing: copy });
  const addingBase = resultBase.suites.find((s) => s.place === "src/add.ts")!;
  const addingCopy = resultCopy.suites.find((s) => s.place === "src/add.ts")!;
  // The copy has one more Case pointing at src/add.ts, but the Plan is unchanged.
  assert.equal(addingCopy.observations.length, addingBase.observations.length + 1);
  // Clean up.
  fs.rmSync(copy, { recursive: true });
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a Plan Run records conditions at the Plan level: the Run says which conditions this occurrence held under", () => {
  const testing = planState("regression", "trusted");
  const plan = readPlan("test/regression-plan.md", testing);
  // A given condition comes from whoever starts the run, not from Cases.
  const result = planRun({ plan, testing, conditions: { checkout: "LF" } });
  // Conditions are on the Run, not on individual Cases or SuiteRuns.
  assert.equal(result.run.conditions["checkout"], "LF");
  assert.ok("platform" in result.run.conditions);
  assert.ok("runtime" in result.run.conditions);
  // SuiteRuns carry no conditions of their own: conditions are Plan-level.
  for (const suiteRun of result.suites) {
    assert.ok(!("conditions" in suiteRun));
  }
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("run(Plan) reaches multiple lower-level Runs: the same Plan can be run under different conditions", () => {
  const testing = planState("regression", "trusted");
  const plan = readPlan("test/regression-plan.md", testing);
  // The plan requires Linux and Windows. Each platform is one Run: a Plan Run
  // is one occurrence, not one process carrying all conditions.
  const linuxRun = planRun({ plan, testing, conditions: { checkout: "LF" } });
  const windowsRun = planRun({ plan, testing, conditions: { checkout: "CRLF" } });
  // Both are valid Plan Runs for the same Plan: the Plan is unchanged.
  assert.equal(linuxRun.plan.path, windowsRun.plan.path);
  assert.deepEqual(linuxRun.plan.suites, windowsRun.plan.suites);
  // They recorded different conditions: each occurrence is a separate Run.
  assert.equal(linuxRun.run.conditions["checkout"], "LF");
  assert.equal(windowsRun.run.conditions["checkout"], "CRLF");
  // Both Runs reached the same Cases through the same Suites.
  for (let i = 0; i < plan.suites.length; i++) {
    assert.deepEqual(
      linuxRun.suites[i]!.observations.map((o) => o.title),
      windowsRun.suites[i]!.observations.map((o) => o.title),
    );
  }
});
