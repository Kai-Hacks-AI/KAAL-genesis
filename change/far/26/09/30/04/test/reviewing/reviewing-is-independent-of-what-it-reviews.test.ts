import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { candidate, isolated, skills, skillTests } from "../../../../../../26/09/26/01/test/candidate.js";

test(
  "the skill passes its own tests with no other skill, and nothing else of the repository, beside it",
  { tests: { requirement: ["reviewing-is-independent-of-what-it-reviews"] } },
  () => {
    assert.ok(skills().includes("reviewing"));
    const run = skillTests("reviewing", isolated("reviewing"));
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    assert.match(run.stdout, /^# pass [1-9]/m);
  },
);

test(
  "its instructions name no other skill, BRAIN, Git, a repository host or a pull request",
  { tests: { requirement: ["reviewing-is-independent-of-what-it-reviews"] } },
  () => {
    const text = fs.readFileSync(candidate("skills/reviewing/SKILL.md"), "utf8");
    for (const other of skills().filter((s) => s !== "reviewing"))
      assert.ok(!text.includes(other), `the instructions name the skill ${other}`);
    for (const word of [/\bBRAIN\b/, /\bGit\b/i, /\bGitHub\b/i, /\bpull requests?\b/i])
      assert.doesNotMatch(text, word);
  },
);
