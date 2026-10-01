import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { candidate, files } from "../candidate.js";

const entry = (scope: string) => fs.readFileSync(candidate(scope, "AGENTS.md"), "utf8");

/** Every sentence of BRAIN's nodes of at least five words. */
function sentences(): string[] {
  const root = candidate("brain/learning");
  return files(root)
    .filter((f) => f.endsWith(".md"))
    .flatMap((f) => fs.readFileSync(path.join(root, f), "utf8").replace(/^---[\s\S]*?---\n/, "").split(/(?<=[.!?])\s+|\n+/))
    .map((s) => s.replace(/^#+\s*/, "").trim())
    .filter((s) => s.split(/\s+/).length >= 5);
}

test(
  "the root entry point sends an agent to BRAIN for KAAL's context",
  { tests: { requirement: ["kaal-context-in-brain-not-agent-guidance"] } },
  () => {
    assert.match(entry("."), /\bBRAIN\b/);
    assert.ok(fs.existsSync(candidate("brain/learning")), "the BRAIN it names exists");
  },
);

test(
  "no entry point carries what BRAIN's nodes say",
  { tests: { requirement: ["kaal-context-in-brain-not-agent-guidance"] } },
  () => {
    const known = sentences();
    assert.ok(known.length > 0);
    for (const scope of [".", "brain"])
      for (const sentence of known) assert.ok(!entry(scope).includes(sentence), `${scope}/AGENTS.md repeats BRAIN: ${sentence}`);
  },
);
