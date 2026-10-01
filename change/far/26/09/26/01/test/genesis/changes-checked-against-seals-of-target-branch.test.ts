import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { change, commit, learn, script, sealedMain } from "../candidate.js";

// Genesis states this of "the branch it targets", so it is demonstrated of a
// target branch, `main`: the change's BRAIN is checked with the candidate's
// own check, and the change is judged against `main` by the candidate's guard.
const brain = "brain/learning";
const judge = (dir: string) => ({
  check: script("scripts/check-seals.ts", [brain], dir),
  guard: script("scripts/seal-guard.ts", ["main", dir], dir),
});

test(
  "a change that adds a learning passes both judgments",
  { tests: { requirement: ["changes-checked-against-seals-of-target-branch"] } },
  () => {
    const dir = sealedMain();
    change(dir);
    learn(dir, "genesis", "26/09/27/01", "third");
    commit(dir);
    const { check, guard } = judge(dir);
    assert.equal(check.status, 0, check.stderr);
    assert.equal(guard.status, 0, guard.stderr);
  },
);

test(
  "a change that alters a learning the target branch has sealed is refused",
  { tests: { requirement: ["changes-checked-against-seals-of-target-branch"] } },
  () => {
    const dir = sealedMain();
    change(dir);
    fs.appendFileSync(path.join(dir, brain, "genesis/26/09/25/01/nodes/first.md"), "Quietly changed.\n");
    commit(dir);
    const { check } = judge(dir);
    assert.notEqual(check.status, 0, "main's seals no longer hold of the change's BRAIN");
  },
);

test(
  "a change that reseals what it altered, so its own seals agree, is still refused against the target branch",
  { tests: { requirement: ["changes-checked-against-seals-of-target-branch"] } },
  () => {
    const dir = sealedMain();
    change(dir);
    fs.appendFileSync(path.join(dir, brain, "genesis/26/09/25/01/nodes/first.md"), "Quietly changed.\n");
    for (const seal of ["seals.json", "genesis/26/09/25/01/seal.json", "genesis/26/09/26/01/seal.json"])
      fs.rmSync(path.join(dir, brain, seal));
    const resealed = script("scripts/seal.ts", [], dir);
    assert.equal(resealed.status, 0, resealed.stderr);
    commit(dir);
    const { check, guard } = judge(dir);
    assert.equal(check.status, 0, "the change's BRAIN is consistent with its own seals");
    assert.notEqual(guard.status, 0, "but they are not the seals of the target branch");
  },
);
