import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createAgents } from "../skills/using-agents/scripts/create-agents.js";
import { BRAIN_DIR, createBrain } from "../skills/using-brain/scripts/create-brain.js";
import { createNode } from "../skills/using-brain/scripts/create-node.js";

/** KAAL's repository entry point: KAAL's guidance, placed by using-agents. */
export const ROOT_GUIDANCE = "# KAAL\n\nUse BRAIN for KAAL context, including why KAAL uses its skills.\n";

/**
 * KAAL's Genesis: KAAL is born by composing the capabilities it chooses.
 * using-brain creates BRAIN, using-agents creates the repository's Agent entry
 * point from KAAL's guidance, and using-brain's birth path then births KAAL's
 * current understanding into BRAIN, in order. KAAL's meaning lives here and in BRAIN,
 * never in the skills, so the skills stay reusable by systems that are not
 * KAAL. Genesis creates no directory and writes no file itself. It is all
 * or nothing: if any step refuses or fails, what the steps before it created
 * is removed again, so a failed Genesis leaves the repository as it was.
 */
export function genesis(repo = "."): void {
  const created: string[] = [];
  try {
    const root = createBrain(path.join(repo, BRAIN_DIR));
    created.push(path.dirname(root));
    created.push(createAgents(repo, ROOT_GUIDANCE));
    birth(root);
  } catch (e) {
    for (const item of created) fs.rmSync(item, { recursive: true, force: true });
    throw e;
  }
}

/**
 * The learning Genesis births: KAAL's understanding as it is now, as of this
 * learning, which no node KAAL holds for a name born here may be newer than.
 */
export const LEARNING = "26/09/28/06";

/**
 * KAAL's current understanding, born in order into the BRAIN at `root`: each
 * node says what KAAL's current node of that name says, without how KAAL came
 * to it, such as what taught this KAAL a meaning: a new KAAL lived none of it. What Genesis births is stated in
 * brain/learning/genesis/26/09/28/06/nodes/genesis.md.
 */
function birth(root: string): void {
  createNode({
    root,
    lineage: "genesis",
    learning: LEARNING,
    slug: "using-brain",
    name: "using-brain",
    meaning: `# Using BRAIN

KAAL uses the **using-brain** skill so every BRAIN node is born through one mechanism, past understanding is retained, and mechanical structure can be validated.

The details of how BRAIN works belong to the skill. This node records why KAAL uses it; it does not duplicate the skill's instructions.
`,
  });
  createNode({
    root,
    lineage: "genesis",
    learning: LEARNING,
    slug: "skill",
    name: "skill",
    meaning: `# Skill

KAAL expects a skill to provide a reusable capability while keeping KAAL-specific meaning in BRAIN.

KAAL treats skills as independent capabilities, wired together through BRAIN rather than through dependencies between skills. A using system such as Genesis composes them; one skill never depends on another.

When KAAL needs knowledge in order to use a skill, that knowledge is initialized into BRAIN rather than duplicated in the generic skill instructions. Deterministic mechanics belong in scripts where appropriate.
`,
  });
  createNode({
    root,
    lineage: "genesis",
    learning: LEARNING,
    slug: "using-skills",
    name: "using-skills",
    meaning: `# Using Skills

KAAL uses the **using-skills** skill so every skill KAAL keeps can be used by any agent that reads the standard, and has one source for its instructions. KAAL holds its skills to two rules:

A skill follows the Agent Skills standard: https://agentskills.io/specification.

A skill is born from its own init: \`scripts/init.ts\` generates the skill's \`SKILL.md\`. \`SKILL.md\` is never edited by hand, and KAAL's tests prove every committed \`SKILL.md\` is exactly what its init generates.

The skill explains how both rules are checked. This node records why KAAL uses it.
`,
  });
  createNode({
    root,
    lineage: "genesis",
    learning: LEARNING,
    slug: "using-seals",
    name: "using-seals",
    meaning: `# Using Seals

KAAL uses the **using-seals** skill so a learning, once closed, cannot change unnoticed: past understanding stays exactly as it was learned.

Each lineage is a chain and each learning a unit, oldest first; a learning is closed when it is sealed. KAAL seals its accepted state, never a candidate: sealing closes the accepted state's learnings not yet sealed, and changes nothing but seal state, adding a seal to each learning it closes and advancing its chain's head. Only that sealing writes seal state. A candidate writes none: compared with the accepted state it would succeed, it adds, changes and removes no seal state, so what is closed stays closed as it was. Systems outside KAAL, such as a repository host, may arrange when sealing runs, such as after each acceptance; what sealing may write, and what a candidate may not, is decided from the files of the states alone.

The skill explains how sealing and checking work. This node records why KAAL uses it.
`,
  });
  createNode({
    root,
    lineage: "genesis",
    learning: LEARNING,
    slug: "using-agents",
    name: "using-agents",
    meaning: `# Using Agents

KAAL uses the **using-agents** skill so agent guidance stays scoped and concise while KAAL-specific context and reasons remain in BRAIN.

The skill explains the generic mechanics of AGENTS.md. This node records why KAAL uses it.
`,
  });
  createNode({
    root,
    lineage: "genesis",
    learning: LEARNING,
    slug: "bass",
    name: "bass",
    meaning: `# BASS

KAAL uses BASS as a structured ladder:

\`Bare < Agent < Skill < Script\`

Forward, KAAL uses what it has: move toward the most deterministic capability available for the work.

When something fails, that failure gives direction for improvement. Move back toward understanding far enough to find the responsible level, improve it, then use the ladder forward again.

BASS is KAAL's understanding. Skills remain independent of BASS and can be reused by systems that organize agents differently.
`,
  });
  createNode({
    root,
    lineage: "genesis",
    learning: LEARNING,
    slug: "testing",
    name: "testing",
    meaning: `# Testing

KAAL's testing has one anchor, \`test/\`, whose entry point the skill creates. Besides that entry point, \`test/\` holds only KAAL's Regression Plan; tests and their data stay with what they test.

KAAL works on files. The accepted regression is a state of KAAL's files whose protection every later change must keep. A candidate is a state of KAAL's files proposed to succeed it. A candidate names the accepted regression it derives from by that regression's own content, never by where its files are kept or how they are versioned. Systems outside KAAL, such as a repository host, may keep the states, choose which one is accepted and arrange when a candidate is judged; they hand KAAL the states, and KAAL judges them from their files alone.

The next regression is derived, never restated: it is what the accepted regression protects, less exactly what the candidate explicitly gives up, with what the candidate newly promises and demonstrates. What a regression protects is what its plan requires, its commitments, the suites that serve it, its conditions, its proof other than cases and its data, together with its cases, found from those through their links and memberships. A candidate gives up only what an acceptance record it adds names, inherited cases and suites; whatever of the accepted regression no record gives up, it keeps, so silence never gives up protection. A candidate adds protection only by newly promising a commitment, stated in a place the accepted state does not state, and demonstrating it by its own cases; nothing else enters. A replacement is both: its successor newly promised and demonstrated, and what it replaces given up. Conditions, proof other than cases and data can yet be neither given up nor added: the next regression keeps them as they were.

The candidate's own regression, its plan, suites, cases and data, is what judges the next candidate once it is accepted, so it must carry the derived regression exactly: every inherited case at its address, still helping prove what it helped prove and belonging to the suites it belonged to, its data holding what they held, and nothing the derivation does not bring in: no commitment, suite, case, link or membership of its own but those of what it newly promises and demonstrates. A case the candidate adds therefore enters only as a case of a commitment it newly promises; a further case for protection already held has no way in yet. The accepted regression's checker holds it to that, and replays every inherited case the candidate does not give up against it. Once accepted, the candidate is the accepted regression the same derivation starts from next, so each generation follows from the one before by the same operation, and names the one it was derived from.

A commitment's meaning is stated once. A node never changes, so a commitment stated in BRAIN keeps one meaning in every generation. Later understanding supersedes a node through a new node with the same name, and the old node stays as it was learned. The regression keeps protecting the old node's commitment until a candidate gives up its cases, and protects the new node's once a candidate newly promises and demonstrates it. A commitment stated in code can change in place, so changing its statement changes the commitment.

The skill explains how a test is written. This node records why and how KAAL uses it.
`,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) genesis();
