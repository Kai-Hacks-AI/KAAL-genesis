import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { candidate, files, isolated, skills, skillTests } from "../candidate.js";

/** The relative module specifiers a source file imports, re-exports or dynamically imports. */
const reaches = (text: string): string[] =>
  [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']*)["']/g)].map((m) => m[1]);

test(
  "no skill's code imports from another skill",
  { tests: { requirement: ["skills-independent-capabilities"] } },
  () => {
    assert.ok(skills().length > 1);
    for (const skill of skills()) {
      const home = candidate("skills", skill);
      for (const file of files(home).filter((f) => /\.[cm]?[jt]s$/.test(f))) {
        const from = path.dirname(path.join(home, file));
        for (const specifier of reaches(fs.readFileSync(path.join(home, file), "utf8"))) {
          const target = path.resolve(from, specifier);
          for (const other of skills().filter((s) => s !== skill)) {
            const theirs = candidate("skills", other);
            assert.ok(
              target !== theirs && !target.startsWith(theirs + path.sep),
              `skills/${skill}/${file} imports ${specifier}, which is skill ${other}`,
            );
          }
        }
      }
    }
  },
);

// The Requirement is also a claim about what a skill needs, and a skill can
// depend on another without importing it. Standing a skill alone is the direct
// test: its own tests must still pass when nothing else is there.
test(
  "each skill passes its own tests with no other skill, and nothing else of the repository, beside it",
  { tests: { requirement: ["skills-independent-capabilities", "kaal-meaning-in-brain-not-skills"] } },
  () => {
    for (const skill of skills()) {
      const run = skillTests(skill, isolated(skill));
      assert.equal(run.status, 0, `${skill} does not stand alone:\n${run.stdout}${run.stderr}`);
      assert.match(run.stdout, /^# pass [1-9]/m, `${skill} ran no test`);
    }
  },
);
