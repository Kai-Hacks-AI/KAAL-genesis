import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = fileURLToPath(new URL("../SKILL.md", import.meta.url));

/** This skill's SKILL.md. The skill is born from init: SKILL.md is generated from here, never edited by hand. */
export const SKILL_MD = `---
name: managing-defects
description: Keep a persistent record of each defect, something intended to hold that was observed not to hold, which never changes once written.
---

# Managing Defects

A defect is a persistent record that something intended to hold was observed not to hold. Keep one when an observation shows such a failure, so it is not lost when the run that showed it is gone.

The observation, the defect and any repair are distinct. A defect records what was observed, which stays observed: its record never changes once written. It records no state of its own and names nothing that tests it; what tests a defect points at it, as the using system decides.

Each defect is a directory in a defects directory the using system chooses, named for the defect with lowercase letters, digits and single hyphens, never a name Windows reserves such as \`con\` or \`nul\`, and holds only \`defect.md\`. It records \`holds\`, what was intended to hold, and \`observed\`, where it was observed not to hold, as frontmatter and nothing else, followed by what was observed. Files beside the defects, such as guidance for working among them, are the using system's.

Record a defect with \`scripts/record.ts <dir> <name> --holds <what should hold> --observed <where> <observation-file>\`. It refuses a defect that is already recorded. Check a defects directory with \`scripts/check.ts <dir>\`: it reports every record that is incomplete or out of place, and otherwise lists each defect with what should hold.
`;

/** Generates this skill's SKILL.md at `target` (by default, next to this skill's scripts). */
export function init(target = SKILL): string {
  fs.writeFileSync(target, SKILL_MD);
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) init();
