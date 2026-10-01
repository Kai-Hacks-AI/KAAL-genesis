import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { brain, scratch, script } from "../candidate.js";

/** A BRAIN of two learnings, both closed by the candidate's sealing. */
function closed(): string {
  const dir = scratch();
  brain(dir, [
    ["genesis", "26/09/25/01", "first"],
    ["genesis", "26/09/26/01", "second"],
  ]);
  const sealed = script("scripts/seal.ts", [], dir);
  assert.equal(sealed.status, 0, sealed.stderr);
  return dir;
}
const check = (dir: string) => script("scripts/check-seals.ts", [], dir);
const first = (dir: string, ...rest: string[]) => path.join(dir, "brain/learning/genesis/26/09/25/01", ...rest);

test(
  "a closed learning that has not changed passes its check",
  { tests: { requirement: ["closed-learning-integrity"] } },
  () => {
    const checked = check(closed());
    assert.equal(checked.status, 0, checked.stderr);
  },
);

test(
  "a closed learning that changes in any way is noticed",
  { tests: { requirement: ["closed-learning-integrity"] } },
  () => {
    const changes: Record<string, (dir: string) => void> = {
      "a node is edited": (dir) => fs.appendFileSync(first(dir, "nodes/first.md"), "Quietly changed.\n"),
      "a node is removed": (dir) => fs.rmSync(first(dir, "nodes/first.md")),
      "a file is added": (dir) => fs.writeFileSync(first(dir, "nodes/extra.md"), "---\nname: extra\n---\n\nAdded.\n"),
      "its seal is removed": (dir) => fs.rmSync(first(dir, "seal.json")),
      "its seal is edited": (dir) => fs.appendFileSync(first(dir, "seal.json"), " "),
    };
    for (const [what, change] of Object.entries(changes)) {
      const dir = closed();
      change(dir);
      assert.notEqual(check(dir).status, 0, `${what}, and nothing was noticed`);
    }
  },
);

test(
  "a learning born after others were closed does not disturb them",
  { tests: { requirement: ["closed-learning-integrity"] } },
  () => {
    const dir = closed();
    const born = script(
      "skills/using-brain/scripts/create-node.ts",
      ["genesis", "26/09/27/01", "third", "third", "Learned later."],
      dir,
    );
    assert.equal(born.status, 0, born.stderr);
    const checked = check(dir);
    assert.equal(checked.status, 0, checked.stderr);
  },
);
