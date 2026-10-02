import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { candidate } from "../../../../../../26/09/26/01/test/candidate.js";

// What is tested is the candidate's admission of a delivery, through its own entry point, which is provider
// specific: it judges a pull request from where it comes, the author and the repositories it names. The words of
// the origins below are therefore the realization's, never the Requirement's.
const THIS_REPO = "owner/line";

/** What the candidate's admission entry point says of a delivery from `origin`: 0 admitted, anything else refused. */
function admit(origin: { headRef: string; headRepo?: string; author?: string }): number | null {
  const run = spawnSync(process.execPath, [candidate("node_modules/tsx/dist/cli.mjs"), candidate("scripts/guard-branch.ts")], {
    cwd: candidate(),
    encoding: "utf8",
    env: {
      ...process.env,
      HEAD_REF: origin.headRef,
      HEAD_REPO: origin.headRepo ?? THIS_REPO,
      AUTHOR: origin.author ?? "someone",
      THIS_REPO,
    },
  });
  return run.status;
}

test(
  "a delivery from an origin the line's owner recognizes is admitted",
  { tests: { requirement: ["delivery-admitted-by-recognized-origin"] } },
  () => {
    assert.equal(admit({ headRef: "kaal/change/thing" }), 0);
    assert.equal(admit({ headRef: "kaal/hotfix/thing" }), 0);
  },
);

test(
  "a delivery from an unnamed origin of the line's own repository is refused",
  { tests: { requirement: ["delivery-admitted-by-recognized-origin"] } },
  () => {
    assert.equal(admit({ headRef: "fix-a-thing-18126460239853844777" }) === 0, false);
    assert.equal(admit({ headRef: "kaal-fix" }) === 0, false);
  },
);

test(
  "a delivery from another repository is refused, even under a name the line recognizes",
  { tests: { requirement: ["delivery-admitted-by-recognized-origin"] } },
  () => {
    assert.equal(admit({ headRef: "kaal/change/thing", headRepo: "someone/line" }) === 0, false);
  },
);
