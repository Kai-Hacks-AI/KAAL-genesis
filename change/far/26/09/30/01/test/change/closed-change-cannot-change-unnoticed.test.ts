import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { commit, git, sealedMain, script } from "../../../../../../26/09/26/01/test/candidate.js";

// Judged through the candidate's own sealing: a Change is born and given a file,
// the candidate's sealing closes it beside the BRAIN of a sealed `main`, and the
// candidate's own check is asked whether the repository is still as it was sealed.
const closed = "change/testing/26/09/30/01";
const check = (dir: string) => script("scripts/check-seals.ts", [dir], dir);

/** A repository whose Change `testing/26/09/30/01`, owning `owned.txt`, is closed by the candidate's sealing. */
function sealedChange(): string {
  const dir = sealedMain();
  const born = script("skills/managing-change/scripts/birth.ts", ["testing", "26/09/30/01"], dir);
  assert.equal(born.status, 0, born.stderr);
  fs.writeFileSync(path.join(dir, closed, "owned.txt"), "what the Change owns\n");
  const sealed = script("scripts/seal.ts", [], dir);
  assert.equal(sealed.status, 0, sealed.stderr);
  commit(dir);
  return dir;
}

test(
  "sealing closes a Change with a seal of its own and the lineage's chain head, and the repository checks",
  { tests: { requirement: ["closed-change-cannot-change-unnoticed"] } },
  () => {
    const dir = sealedChange();
    assert.ok(fs.existsSync(path.join(dir, closed, "seal.json")));
    assert.match(fs.readFileSync(path.join(dir, "seals.json"), "utf8"), /testing/);
    const checked = check(dir);
    assert.equal(checked.status, 0, checked.stderr);
  },
);

test(
  "a closed Change that is edited, added to or removed from is reported",
  { tests: { requirement: ["closed-change-cannot-change-unnoticed"] } },
  () => {
    const unnoticed: [string, (dir: string) => void][] = [
      ["edited", (dir) => fs.appendFileSync(path.join(dir, closed, "owned.txt"), "rewritten\n")],
      ["added", (dir) => fs.writeFileSync(path.join(dir, closed, "later.txt"), "later\n")],
      ["removed", (dir) => fs.rmSync(path.join(dir, closed, "owned.txt"))],
    ];
    for (const [what, alter] of unnoticed) {
      const dir = sealedChange();
      assert.equal(check(dir).status, 0, `${what}: the closed Change is intact before it is altered`);
      alter(dir);
      git(dir, "add", "-A");
      const reported = check(dir);
      assert.equal(reported.status, 1, `${what}: ${reported.stderr}`);
      assert.match(reported.stderr, /change\/testing\/26\/09\/30\/01/, `${what} names the Change`);
    }
  },
);
