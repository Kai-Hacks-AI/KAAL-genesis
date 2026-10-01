import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { candidate, files, skills } from "../candidate.js";

// Two halves: a skill is a generic capability, which the isolation Case in
// skills-independent-capabilities.test.ts shows (it declares this Requirement
// too), and what KAAL needs to know about using it is a node of BRAIN, shown
// here. That a skill's text holds no KAAL meaning at all cannot be shown by
// running anything: it is not asserted.

/** The body of every node of BRAIN. */
function bodies(): string[] {
  const root = candidate("brain/learning");
  return files(root)
    .filter((f) => f.endsWith(".md"))
    .map((f) => fs.readFileSync(path.join(root, f), "utf8").replace(/^---[\s\S]*?---\n/, ""));
}

test(
  "BRAIN holds, for each skill KAAL keeps, a node that says why KAAL uses it",
  { tests: { requirement: ["kaal-meaning-in-brain-not-skills"] } },
  () => {
    const nodes = bodies();
    assert.ok(skills().length > 0);
    for (const skill of skills())
      assert.ok(
        nodes.some((body) => body.includes(`**${skill}**`) && /\bKAAL uses\b/.test(body)),
        `no node of BRAIN records why KAAL uses ${skill}`,
      );
  },
);
