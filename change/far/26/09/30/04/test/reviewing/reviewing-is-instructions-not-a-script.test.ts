import assert from "node:assert/strict";
import test from "node:test";
import { candidate, files } from "../../../../../../26/09/26/01/test/candidate.js";

test(
  "the skill carries its instructions and what makes it a skill, and no script that judges",
  { tests: { requirement: ["reviewing-is-instructions-not-a-script"] } },
  () => {
    assert.deepEqual(files(candidate("skills/reviewing")), ["SKILL.md", "scripts/init.test.ts", "scripts/init.ts"]);
  },
);
