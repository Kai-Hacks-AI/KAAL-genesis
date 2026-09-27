import assert from "node:assert/strict";
import test from "node:test";
import { evidence, type PlanRun, type Requirement } from "./plan.js";
import { planData } from "./test-data.js";

type Example = { shows: string; requirements: Requirement[]; runs: PlanRun[]; verdict: string; under: string[][] };

test("a plan is demonstrated only when every requirement held under every set of conditions it requires, and nothing run, reached or required is no evidence", () => {
  for (const { shows, requirements, runs, verdict, under } of planData("evidence") as Example[]) {
    const judged = evidence(requirements, runs);
    assert.equal(judged.verdict, verdict, shows);
    assert.deepEqual(
      judged.requirements.map((r) => r.under.map((u) => u.verdict)),
      under,
      shows,
    );
  }
});
