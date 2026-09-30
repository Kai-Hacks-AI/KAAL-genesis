import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = fileURLToPath(new URL("../SKILL.md", import.meta.url));

/** This skill's SKILL.md. The skill is born from init: SKILL.md is generated from here, never edited by hand. */
export const SKILL_MD = `---
name: testing
description: Collect Suites of executable Cases into a Plan and run the Plan against a candidate to establish whether the protection it states holds.
---

# Testing

Testing establishes whether stated protection holds for a candidate. It knows three things, from the outside in:

A **Plan** states a testing purpose and collects the Suites that serve it. It is a JSON file with exactly two fields: \`concern\`, a non-empty sentence saying what the Plan protects, and \`suites\`, a list of the Suites it collects, each a relative posix path to a Suite directory beneath the testing root, each at most once. A Plan may collect no Suite yet. Where a Plan lives, and who adds to it, is the using system's decision.

A **Suite** is a directory holding \`suite.json\`, whose one field, \`concern\`, states the coherent testing concern its Cases serve. The concern, not the current Cases, gives a Suite its meaning. Every Case file anywhere beneath the directory belongs to the Suite; there is no other membership. A Suite with no Case is refused, since it protects nothing.

A **Case** is one file named \`*.test.js\` or \`*.test.ts\`, or a module variant of either (\`.mjs\`, \`.cjs\`, \`.mts\`, \`.cts\`), whose tests use Node's test runner, \`node:test\`. Its tests state the claims it makes. A Case passes only when executing it succeeds and every test it reports ran and passed: a Case that ran no test, or skipped one, proves nothing.

Run a Plan with \`scripts/run.ts <plan> [candidate]\`. The testing root, which the Plan and its Suites are read from, is the current directory; the candidate, the state being tested, defaults to it. These are often the same state, but they are two roles: each Case is executed in its own process, with the candidate as its working directory, under the same Node and loaders \`run.ts\` runs under but never its test runner options (with \`tsx\`, TypeScript Cases run as they are). A Case reaches what it tests through its working directory, never through its own location, so the same Case can judge a candidate it was not written beside. Nothing checks that it does.

A broken Plan or Suite is refused before any Case runs. Otherwise the Run is printed: the Plan, the candidate, the conditions (Node version, platform, architecture), one \`pass\` or \`fail\` line per Case with the output of every Case that did not pass, and finally \`holds\` or \`does not hold\`. The Plan holds only if every Case of every Suite it collects passed; \`run.ts\` fails otherwise. From code, \`runPlan\` in \`scripts/testing.ts\` returns the Run, and \`readPlan\`, \`readSuite\` and \`readPlanSuites\` return the same errors.

Testing keeps no record of a Run: the Run is observed where it is executed. It does not bound a stuck Case, isolate a Case from the machine it runs on, or prove that the Plan, Suites and Cases it reads are the ones that were accepted; those belong to the using system. A Plan only collects: it cannot remove, replace or relate one Case to another, and Testing never judges whether two Cases prove the same thing.
`;

/** Generates this skill's SKILL.md at \`target\` (by default, next to this skill's scripts). */
export function init(target = SKILL): string {
  fs.writeFileSync(target, SKILL_MD);
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) init();
