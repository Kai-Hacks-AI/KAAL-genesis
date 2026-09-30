// Loads named test data from ../test-data so test cases hold no data themselves.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = fileURLToPath(new URL("../test-data/", import.meta.url));

/** The directory holding every example skill. */
export const SKILLS = path.join(DATA, "skills");

/** An example skill from test-data/skills. */
export function skill(name: string): string {
  return path.join(SKILLS, name);
}

/** An example skill whose init never finishes, kept apart so checking every example skill stays fast. */
export function stuckSkill(name: string): string {
  return path.join(DATA, "stuck", name);
}

/**
 * A copy of the "linked" skill with its symlink created at run time because
 * a symlink cannot be committed portably.
 */
export function linkedSkill(): string {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "skill-"));
  const dir = path.join(scratch, "linked");
  fs.cpSync(skill("linked"), dir, { recursive: true });
  fs.symlinkSync("../SKILL.md", path.join(dir, "scripts", "template"));
  return dir;
}
