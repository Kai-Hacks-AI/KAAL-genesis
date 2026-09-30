import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { init, SKILL_MD } from "./init.js";

test("init writes this skill's instructions, and nothing else, where it is told to", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reviewing-"));
  const target = path.join(dir, "SKILL.md");
  assert.equal(init(target), target);
  assert.equal(fs.readFileSync(target, "utf8"), SKILL_MD);
  assert.deepEqual(fs.readdirSync(dir), ["SKILL.md"]);
  assert.match(SKILL_MD, /^---\nname: reviewing\ndescription: .+\n---\n\n# Reviewing\n/);
});
