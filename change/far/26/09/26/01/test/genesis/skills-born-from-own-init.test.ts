import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { candidate, scratch, script, skills } from "../candidate.js";

/** A copy of the candidate's skill `name` in a scratch skills directory, SKILL.md left out when `withSkillMd` is false. */
function copy(name: string, withSkillMd: boolean): { dir: string; skills: string } {
  const root = scratch();
  const dir = path.join(root, name);
  fs.cpSync(candidate("skills", name), dir, {
    verbatimSymlinks: true,
    recursive: true,
    filter: (source) => withSkillMd || path.basename(source) !== "SKILL.md" || path.dirname(source) !== candidate("skills", name),
  });
  return { dir, skills: root };
}

test(
  "every committed SKILL.md is exactly the bytes its skill's init generates",
  { tests: { requirement: ["skills-born-from-own-init"] } },
  () => {
    assert.ok(skills().length > 0);
    for (const name of skills()) {
      const { dir } = copy(name, false);
      // Init writes SKILL.md next to its own scripts, here in the copy.
      const born = script(path.join(dir, "scripts/init.ts"), [], dir);
      assert.equal(born.status, 0, `${name}: init failed: ${born.stderr}`);
      assert.equal(
        fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"),
        fs.readFileSync(candidate("skills", name, "SKILL.md"), "utf8"),
        name,
      );
    }
  },
);

test(
  "a SKILL.md edited by hand is reported, and an untouched one is not",
  { tests: { requirement: ["skills-born-from-own-init"] } },
  () => {
    const check = (skills: string) => script("skills/using-skills/scripts/check.ts", [skills], skills);
    const fine = copy("using-agents", true);
    assert.equal(check(fine.skills).status, 0, check(fine.skills).stderr);
    const edited = copy("using-agents", true);
    fs.appendFileSync(path.join(edited.dir, "SKILL.md"), "A line added by hand.\n");
    assert.notEqual(check(edited.skills).status, 0);
  },
);
