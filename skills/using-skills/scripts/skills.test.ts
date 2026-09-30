import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { birthErrors, checkSkills, standardErrors } from "./skills.js";
import { linkedSkill, skill, SKILLS, stuckSkill } from "./test-data.js";

const LONG = "a".repeat(65);

test("a skill with a name and description, or with every optional field, follows the standard", () => {
  assert.deepEqual(standardErrors(skill("born")), []);
  assert.deepEqual(standardErrors(skill("full")), []);
});

test("metadata may refer to other strings by YAML alias, even for its own key", () => {
  assert.deepEqual(standardErrors(skill("aliases")), []);
  assert.deepEqual(standardErrors(skill("aliased-metadata-key")), []);
});

test("lengths count characters, not UTF-16 units: 1024 emoji are a valid description, 500 a valid compatibility", () => {
  assert.deepEqual(standardErrors(skill("emoji")), []);
});

test("the name may be lowercase letters of any script, as the standard's reference validator allows", () => {
  assert.deepEqual(standardErrors(skill("données")), []);
});

test("the name must be lowercase with single hyphens, at most 64 characters, and the skill's directory", () => {
  const shape = "name must be lowercase letters, digits and single hyphens, not starting or ending with a hyphen";
  assert.deepEqual(standardErrors(skill("mismatch")), ['mismatch: name "other" does not match the skill\'s directory']);
  assert.deepEqual(standardErrors(skill("Upper")), [`Upper: ${shape}`]);
  assert.deepEqual(standardErrors(skill("double--hyphen")), [`double--hyphen: ${shape}`]);
  assert.deepEqual(standardErrors(skill(LONG)), [`${LONG}: name is longer than 64 characters`]);
});

test("the description is required and at most 1024 characters", () => {
  assert.deepEqual(standardErrors(skill("no-description")), ["no-description: description is required"]);
  assert.deepEqual(standardErrors(skill("long-description")), [
    "long-description: description is longer than 1024 characters",
  ]);
});

test("optional fields keep to the standard, and no other field is allowed", () => {
  assert.deepEqual(standardErrors(skill("bad-optional")), [
    "bad-optional: compatibility must be 1 to 500 characters",
    "bad-optional: license must be a string",
    "bad-optional: metadata must map strings to strings",
    "bad-optional: allowed-tools must be a string",
  ]);
  assert.deepEqual(standardErrors(skill("number-key")), ["number-key: metadata must map strings to strings"]);
  assert.deepEqual(standardErrors(skill("unknown-field")), ['unknown-field: "version" is not a field of the standard']);
});

test("a skill needs a SKILL.md that starts with a frontmatter mapping in valid YAML", () => {
  assert.match(standardErrors(skill("invalid-yaml"))[0], /^invalid-yaml: SKILL\.md frontmatter is not valid YAML/);
  assert.match(standardErrors(skill("missing-anchor"))[0], /^missing-anchor: SKILL\.md frontmatter is not valid YAML/);
  assert.deepEqual(standardErrors(skill("duplicate-metadata-key")), [
    'duplicate-metadata-key: SKILL.md frontmatter has the key "metadata" twice',
  ]);
  assert.deepEqual(standardErrors(skill("duplicate-metadata-entry")), [
    'duplicate-metadata-entry: SKILL.md frontmatter has the key "author" twice',
  ]);
  assert.deepEqual(standardErrors(skill("empty")), ["empty: no SKILL.md as a regular file"]);
  assert.deepEqual(standardErrors(skill("directory")), ["directory: no SKILL.md as a regular file"]);
  assert.deepEqual(standardErrors(skill("no-frontmatter")), [
    "no-frontmatter: SKILL.md does not start with YAML frontmatter",
  ]);
});

test("a skill is born when running its init writes exactly its committed SKILL.md", () => {
  assert.deepEqual(birthErrors(skill("born")), []);
  assert.deepEqual(birthErrors(skill("hand-edited")), [
    "hand-edited: SKILL.md is not what scripts/init.ts generates; change init and run it, never SKILL.md",
  ]);
});

test("an init may print as much as it likes", () => {
  assert.deepEqual(birthErrors(skill("verbose")), []);
});

test("a skill without an init, or whose init writes no SKILL.md when run, is not born from it", () => {
  assert.deepEqual(birthErrors(skill("no-init")), ["no-init: no scripts/init.ts; a skill is born from its own init"]);
  assert.deepEqual(birthErrors(skill("export-only")), [
    "export-only: running scripts/init.ts does not write SKILL.md as a regular file",
  ]);
  assert.deepEqual(birthErrors(skill("writes-directory")), [
    "writes-directory: running scripts/init.ts does not write SKILL.md as a regular file",
  ]);
});

test(
  "an init that writes SKILL.md as a named pipe is reported, never read",
  { skip: process.platform === "win32" },
  () => {
    assert.deepEqual(birthErrors(skill("writes-pipe")), [
      "writes-pipe: running scripts/init.ts does not write SKILL.md as a regular file",
    ]);
  },
);

test("the scratch copy keeps symlinks as they are, never pointing back into the skill", () => {
  const dir = linkedSkill();
  try {
    assert.deepEqual(birthErrors(dir), ["linked: running scripts/init.ts failed (exit code 1); run it to see why"]);
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test("an init that fails is reported with how to see why", () => {
  assert.deepEqual(birthErrors(skill("failing")), [
    "failing: running scripts/init.ts failed (exit code 1); run it to see why",
  ]);
});

test("an init that does not finish in time is stopped and reported, even if it ignores SIGTERM", () => {
  assert.deepEqual(birthErrors(stuckSkill("never-finishes"), 1000), [
    "never-finishes: running scripts/init.ts did not finish within 1000 ms",
  ]);
  assert.deepEqual(birthErrors(stuckSkill("ignores-sigterm"), 1000), [
    "ignores-sigterm: running scripts/init.ts did not finish within 1000 ms",
  ]);
});

test("checking runs init in a scratch copy, never over the skill", () => {
  const before = fs.readFileSync(`${skill("hand-edited")}/SKILL.md`);
  birthErrors(skill("hand-edited"));
  assert.deepEqual(fs.readFileSync(`${skill("hand-edited")}/SKILL.md`), before);
});

test("checkSkills reports every skill in the directory, in name order", () => {
  const errors = checkSkills(SKILLS);
  const skills = [...new Set(errors.map((e) => e.slice(0, e.indexOf(":"))))];
  assert.deepEqual(skills, [...skills].sort());
  assert.equal(errors.filter((e) => e.startsWith("born:")).length, 0);
  assert.ok(errors.includes("no-init: no scripts/init.ts; a skill is born from its own init"));
  assert.ok(errors.includes('unknown-field: "version" is not a field of the standard'));
});
