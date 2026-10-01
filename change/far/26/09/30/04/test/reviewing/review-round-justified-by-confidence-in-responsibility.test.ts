import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { candidate } from "../../../../../../26/09/26/01/test/candidate.js";

/** The instructions of the candidate's reviewing skill, with every run of whitespace one space. */
const instructions = (): string => fs.readFileSync(candidate("skills/reviewing/SKILL.md"), "utf8").replace(/\s+/g, " ");

test(
  "the instructions state the one rule that governs the loop",
  { tests: { requirement: ["review-round-justified-by-confidence-in-responsibility"] } },
  () => {
    assert.match(
      instructions(),
      /another round is justified only while it can materially increase confidence that the work holds its responsibility, without changing that responsibility/i,
    );
  },
);

test(
  "the number of rounds, where a finding came from, severity and a reviewer's confidence are none of them evidence",
  { tests: { requirement: ["review-round-justified-by-confidence-in-responsibility"] } },
  () => {
    const text = instructions();
    assert.match(text, /Neither the number of rounds nor that a finding was introduced by an earlier repair is evidence by itself/i);
    assert.match(text, /Severity, a reviewer's confidence and who found it are not evidence of effect/i);
  },
);
