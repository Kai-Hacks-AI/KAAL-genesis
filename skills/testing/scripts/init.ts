import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = fileURLToPath(new URL("../SKILL.md", import.meta.url));

/** This skill's SKILL.md. The skill is born from init: SKILL.md is generated from here, never edited by hand. */
export const SKILL_MD = `---
name: testing
description: Collect Suites of executable Cases into a Plan and run the Plan against a candidate to establish whether the protection it states holds.
---

# Testing

Testing establishes whether stated protection holds for a candidate. It knows three things, from the outside in, and leaves a fourth, Strategy, to the using system:

A **Plan** states a testing purpose and collects the Suites that serve it. It is Markdown: YAML frontmatter, then a body. The body, which must not be empty, states what the Plan protects and why, for the people and agents who author and review it. The frontmatter's \`suites\` lists the Suites it collects, each a relative posix path to a Suite directory beneath the testing root, each at most once. A Plan may collect no Suite yet. Testing owns only \`suites\` and the body: every other frontmatter key belongs to the using system, and Testing never reads it. Where a Plan lives, and who adds to it, is the using system's decision.

A **Suite** is a directory holding \`suite.json\`, whose one field, \`concern\`, states the coherent testing concern its Cases serve. The concern, not the current Cases, gives a Suite its meaning. Every Case file anywhere beneath the directory belongs to the Suite; there is no other membership. A Suite with no Case is refused, since it protects nothing.

A **Case** is one file named \`*.test.js\` or \`*.test.ts\`, or a module variant of either (\`.mjs\`, \`.cjs\`, \`.mts\`, \`.cts\`), whose tests use Node's test runner, \`node:test\`. Its tests state the claims it makes. A Case passes only when executing it succeeds and every test it reports ran and passed: a Case that ran no test, or skipped one, proves nothing.

A **Condition** says that one test of a Case does not apply on some platforms, and why. A Suite declares its Conditions in \`suite.json\` as \`conditions\`: each names one of the Suite's Cases as a Run names it (\`case\`), the test's exact name (\`test\`), the platforms it does not apply on as Node names them (\`notOn\`, such as \`win32\`), and a non-empty \`because\`. Where the Run's platform is among them, that test may be skipped: it is reported as not applicable, never as proof, and every other skipped test still keeps the Case from passing. A test that is declared not applicable must still be reported by its Case, run or skipped, so a Condition cannot outlive the test it names. A Condition never makes a failing test pass, and a skip no Suite declares is never read as one.

A **Strategy** is the using system's lasting decisions about how it uses Testing: where Suites and Plans live and who owns them, which Plan is run, where and when, and how one Plan follows another. Testing reads no Strategy and interprets none of it; it executes only the Plan it is given.

Run a Plan with \`scripts/run.ts <plan> [candidate]\`. The testing root, which the Plan and its Suites are read from, is the current directory; the candidate, the state being tested, defaults to it. These are often the same state, but they are two roles: each Case is executed in its own process, with the candidate as its working directory, under the same Node and loaders (\`--import\`, \`--require\`, \`--loader\`) \`run.ts\` runs under, and none of its other options (with \`tsx\`, TypeScript Cases run as they are). A Case reaches what it tests through its working directory, never through its own location, so the same Case can judge a candidate it was not written beside. Nothing checks that it does.

A broken Plan or Suite is refused before any Case runs. Otherwise the Run is printed: the Plan, the candidate, the conditions (Node version, platform, architecture), one \`pass\` or \`fail\` line per Case with the output of every Case that did not pass, and finally \`holds\` or \`does not hold\`. The Plan holds only if every Case of every Suite it collects passed; \`run.ts\` fails otherwise. From code, \`runPlan\` in \`scripts/testing.ts\` returns the Run, and \`readPlan\`, \`readSuite\` and \`readPlanSuites\` return the same errors.

Testing keeps no record of a Run: the Run is observed where it is executed. It does not bound a stuck Case, isolate a Case from the machine it runs on, or prove that the Plan, Suites and Cases it reads are the ones that were accepted; those belong to the using system. A Plan only collects: it cannot remove, replace or relate one Case to another, and Testing never judges whether two Cases prove the same thing.
`;

/** Generates this skill's SKILL.md at \`target\` (by default, next to this skill's scripts). */
export function init(target = SKILL): string {
  fs.writeFileSync(target, SKILL_MD);
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) init();
