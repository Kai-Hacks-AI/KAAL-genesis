import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { candidate, load, scratch, skills } from "../candidate.js";

type Standard = { standardErrors(dir: string): string[] };
const standard = () => load<Standard>("skills/using-skills/scripts/skills.ts");

test(
  "every skill this state keeps meets the Agent Skills standard",
  { tests: { requirement: ["skills-follow-agent-skills-standard"] } },
  async () => {
    const { standardErrors } = await standard();
    assert.ok(skills().length > 0);
    for (const skill of skills()) assert.deepEqual(standardErrors(candidate("skills", skill)), [], skill);
  },
);

test(
  "a skill that breaks the standard is reported",
  { tests: { requirement: ["skills-follow-agent-skills-standard"] } },
  async () => {
    const { standardErrors } = await standard();
    const broken: Record<string, string> = {
      "name differs from the directory": "---\nname: other\ndescription: What it does.\n---\n\nBody.\n",
      "no description": "---\nname: broken\n---\n\nBody.\n",
      "a field the standard does not allow": "---\nname: broken\ndescription: What it does.\nowner: me\n---\n\nBody.\n",
      "no frontmatter": "Body only.\n",
    };
    for (const [what, text] of Object.entries(broken)) {
      const dir = path.join(scratch(), "broken");
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "SKILL.md"), text);
      assert.notDeepEqual(standardErrors(dir), [], `${what} was not reported`);
    }
    const dir = path.join(scratch(), "fine");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "SKILL.md"), "---\nname: fine\ndescription: What it does.\n---\n\nBody.\n");
    assert.deepEqual(standardErrors(dir), []);
  },
);
