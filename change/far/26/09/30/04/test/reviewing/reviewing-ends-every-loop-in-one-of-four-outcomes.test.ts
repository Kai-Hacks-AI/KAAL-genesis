import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { candidate } from "../../../../../../26/09/26/01/test/candidate.js";

/** The instructions of the candidate's reviewing skill, with every run of whitespace one space. */
const instructions = (): string => fs.readFileSync(candidate("skills/reviewing/SKILL.md"), "utf8").replace(/\s+/g, " ");

test(
  "the loop is decided in exactly four outcomes, reconsider, continue, blocked and ready, in that order",
  { tests: { requirement: ["reviewing-ends-every-loop-in-one-of-four-outcomes"] } },
  () => {
    const outcomes = fs
      .readFileSync(candidate("skills/reviewing/SKILL.md"), "utf8")
      .split(/\r?\n/)
      .filter((line) => line.startsWith("- "))
      .map((line) => /^- (\w+)/.exec(line)![1]);
    assert.deepEqual(outcomes, ["Reconsider", "Continue", "Blocked", "Ready"]);
  },
);

test(
  "every loop ends in one of them: there is no undecided",
  { tests: { requirement: ["reviewing-ends-every-loop-in-one-of-four-outcomes"] } },
  () => {
    assert.match(instructions(), /Every loop ends in one of these; there is no undecided/i);
  },
);
