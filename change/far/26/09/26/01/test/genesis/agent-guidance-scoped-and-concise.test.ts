import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { candidate, files, skills } from "../candidate.js";

// Genesis's using-agents skill says what concise means: "route the agent to
// authoritative context or a capability rather than duplicate the meaning,
// rationale, or mechanics owned elsewhere", and that "narrower AGENTS.md files
// provide guidance for their scope". These Cases hold guidance to that, so to
// routing and not repeating. They set no length: how short guidance must be is
// not something Genesis says, so a long but non-duplicating file is not judged.

const SKIP = (f: string) => f.startsWith("node_modules/") || f.includes("test-data/");

/** Every AGENTS.md, by its scope: its directory, "." for the root. */
function guidance(): Map<string, string> {
  return new Map(
    files(candidate("."))
      .filter((f) => !SKIP(f) && path.basename(f) === "AGENTS.md")
      .map((f) => [path.dirname(f), fs.readFileSync(candidate(f), "utf8")]),
  );
}

/** What guidance says, sentence by sentence: no headings, no blank lines, no fragment of fewer than three words. */
const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .flatMap((l) => l.split(/(?<=[.!?;:])\s+/))
    .map((l) => l.trim())
    .filter((l) => l.split(/\s+/).length >= 3);

/** Everything owned elsewhere that guidance could duplicate: each skill's instructions and each BRAIN node. */
function owned(): string[] {
  const brain = candidate("brain/learning");
  return [
    ...skills().map((s) => fs.readFileSync(candidate("skills", s, "SKILL.md"), "utf8")),
    ...files(brain)
      .filter((f) => f.endsWith(".md"))
      .map((f) => fs.readFileSync(path.join(brain, f), "utf8")),
  ];
}

test(
  "agent guidance routes to BRAIN or a skill",
  { tests: { requirement: ["agent-guidance-scoped-and-concise"] } },
  () => {
    const found = guidance();
    assert.ok(found.size > 0);
    for (const [scope, text] of found)
      assert.ok(
        /\bBRAIN\b/.test(text) || skills().some((skill) => text.includes(skill)),
        `${scope}/AGENTS.md routes to neither BRAIN nor a skill`,
      );
  },
);

test(
  "agent guidance repeats nothing a skill, BRAIN or broader guidance already says",
  { tests: { requirement: ["agent-guidance-scoped-and-concise"] } },
  () => {
    const elsewhere = owned();
    const found = guidance();
    for (const [scope, text] of found)
      for (const line of lines(text)) {
        assert.ok(!elsewhere.some((o) => o.includes(line)), `${scope}/AGENTS.md repeats: ${line}`);
        for (const [other, otherText] of found)
          if (other !== scope) assert.ok(!lines(otherText).includes(line), `${scope}/AGENTS.md repeats ${other}'s: ${line}`);
      }
  },
);

test(
  "narrower guidance gives the guidance for its own scope, naming the skill that owns the capability there",
  { tests: { requirement: ["agent-guidance-scoped-and-concise"] } },
  () => {
    const narrower = guidance().get("brain");
    assert.ok(narrower !== undefined, "BRAIN has guidance of its own");
    assert.match(narrower, /\busing-brain\b/);
    assert.ok(fs.existsSync(candidate("skills/using-brain/SKILL.md")), "the skill it names exists");
  },
);
