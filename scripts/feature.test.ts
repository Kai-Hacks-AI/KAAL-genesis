import assert from "node:assert/strict";
import test from "node:test";
import { FEATURE_PLAN, featureEvidence, featureRun, newPromises } from "./feature.js";
import { PLAN } from "./links.js";
import { planRequirements, readPlan } from "./plans.js";
import { featureState, kaal, regressionCandidate, regressionTrusted } from "./test-data.js";

/** The subject of this file's cases about KAAL itself. */
const KAAL = kaal();
const GREETS_BY_NAME = "requirements/greets-by-name/requirement.md";

// Why: requirements/new-promises/requirement.md
test("a candidate newly promises each commitment it states that the accepted state does not, named by its plan or only recorded", () => {
  const accepted = regressionTrusted();
  assert.deepEqual(newPromises(accepted, featureState("planned", "promised")), {
    promises: [GREETS_BY_NAME],
    errors: [],
  });
  // A Requirement is a commitment once recorded, before any plan names it or any case proves it.
  assert.deepEqual(newPromises(accepted, featureState("planned", "unproven")).promises, [GREETS_BY_NAME]);
  // A replacement's successor is what the candidate newly promises; what it replaces is not named.
  assert.deepEqual(newPromises(accepted, regressionCandidate("replaced")).promises, [
    "brain/learning/k/26/01/02/01/nodes/greeting.md",
  ]);
});

// Why: requirements/new-promises/requirement.md
test("a candidate that states nothing new newly promises nothing, however its code and cases change", () => {
  assert.deepEqual(newPromises(regressionTrusted(), featureState("planned", "refactored")), {
    promises: [],
    errors: [],
  });
  // A Requirement both states record, byte for byte, is kept, not newly promised.
  const accepted = featureState("promised");
  assert.deepEqual(newPromises(accepted, featureState("planned", "promised", "refactored")), {
    promises: [],
    errors: [],
  });
});

// Why: requirements/new-promises/requirement.md
// Why: requirements/new-promises-demonstrated/requirement.md
test("what a candidate newly promises, and that it is demonstrated, stay the same when the cases that prove it are rearranged", () => {
  const accepted = regressionTrusted();
  const [before, after] = [featureState("planned", "promised"), featureState("planned", "promised", "decomposed")];
  assert.deepEqual(newPromises(accepted, after), newPromises(accepted, before));
  for (const candidate of [before, after]) {
    const { run } = featureRun({ accepted, candidate });
    assert.equal(featureEvidence(accepted, candidate, [run]).evidence.verdict, "held");
  }
});

// Why: requirements/new-promises/requirement.md
test("what the accepted state states and the candidate does not is never named, whether it was withdrawn or silently dropped", () => {
  const accepted = featureState("promised");
  // Dropped with no word: the Requirement and the plan's entry for it are gone, and nothing supersedes either.
  assert.deepEqual(newPromises(accepted, featureState("planned")), { promises: [], errors: [] });
  // Withdrawn in BRAIN: nothing is newly promised either, and the withdrawal is not Feature's to name.
  assert.deepEqual(newPromises(regressionTrusted(), regressionCandidate("withdrawn")), { promises: [], errors: [] });
  // A Requirement moved to another place is newly promised there; the place it left is not named at all.
  assert.deepEqual(newPromises(accepted, featureState("planned", "moved")), {
    promises: ["requirements/greets-its-guest-by-name/requirement.md"],
    errors: [],
  });
});

// Why: requirements/new-promises/requirement.md
test("a Requirement rewritten in place is refused, neither kept nor newly promised", () => {
  const accepted = featureState("promised");
  const candidate = featureState("planned", "promised", "rewritten");
  const { errors } = newPromises(accepted, candidate);
  assert.deepEqual(errors, [
    `${GREETS_BY_NAME}: rewritten in place: a Requirement never changes, so this is neither kept nor newly promised`,
  ]);
  assert.throws(() => featureRun({ accepted, candidate }), /rewritten in place/);
});

// Why: requirements/new-promises-demonstrated/requirement.md
test("a new promise is shown by the candidate's own cases that help prove it, and by no other", () => {
  const accepted = regressionTrusted();
  const candidate = featureState("planned", "promised");
  const { promises, run } = featureRun({ accepted, candidate });
  assert.deepEqual(promises, [GREETS_BY_NAME]);
  // Only what the new promise's cases observe is reached: the accepted state's commitments are not the Feature's.
  assert.deepEqual(
    run.observations.map((o) => [o.title, o.observed]),
    [["greets by name", "passed"]],
  );
  assert.deepEqual(featureEvidence(accepted, candidate, [run]).evidence, {
    verdict: "held",
    requirements: [{ name: `commitment: ${GREETS_BY_NAME}`, under: [{ conditions: {}, verdict: "held" }] }],
  });
  // Broken, the same promise fails, though the case of a commitment the accepted state already has is not reached.
  const broken = featureState("planned", "promised", "forgetful");
  const failed = featureRun({ accepted, candidate: broken }).run;
  assert.deepEqual(
    failed.observations.map((o) => [o.title, o.observed]),
    [["greets by name", "failed"]],
  );
  assert.equal(featureEvidence(accepted, broken, [failed]).evidence.verdict, "failed");
});

// Why: requirements/new-promises-demonstrated/requirement.md
test("a new promise no case of the candidate proves is not demonstrated, though nothing failed", () => {
  const accepted = regressionTrusted();
  const candidate = featureState("planned", "unproven");
  const { run } = featureRun({ accepted, candidate });
  assert.deepEqual(run.observations, []);
  assert.deepEqual(featureEvidence(accepted, candidate, [run]).evidence, {
    verdict: "not demonstrated",
    requirements: [{ name: `commitment: ${GREETS_BY_NAME}`, under: [{ conditions: {}, verdict: "not demonstrated" }] }],
  });
});

// Why: requirements/new-promises-demonstrated/requirement.md
test("a candidate that newly promises nothing gives the Feature Plan nothing to require, and demonstrates nothing", () => {
  const accepted = regressionTrusted();
  const candidate = featureState("planned", "refactored");
  const { promises, run } = featureRun({ accepted, candidate });
  assert.deepEqual([promises, run.observations, run.unaccounted], [[], [], []]);
  assert.deepEqual(featureEvidence(accepted, candidate, [run]).evidence, {
    verdict: "not demonstrated",
    requirements: [],
  });
});

// Why: requirements/new-promises-demonstrated/requirement.md
test("KAAL's Feature Plan names no commitment of its own, and requires its testing under the Regression Plan's conditions", () => {
  assert.deepEqual(
    planRequirements(KAAL, FEATURE_PLAN).filter((r) => r.kind === "commitment"),
    [],
  );
  assert.deepEqual(readPlan(KAAL, FEATURE_PLAN).conditions, readPlan(KAAL, PLAN).conditions);
});
