import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/**
 * A Requirement is a durable statement of something the using system commits
 * to hold. The Requirement is the record; the commitment is what it means.
 * It records the commitment as it was made, so it never changes once written.
 * It names nothing that proves it, and no state of its own: what proves a
 * Requirement points at it, and what it holds is shown by that, not stored.
 */

export const REQUIREMENT = "requirement.md";
/**
 * The only field a Requirement records; its body states the commitment. This
 * allowlist refuses status, owner, priority or proof without inventing any of them.
 */
const FIELDS = ["holds"];

export type Requirement = { name: string; holds: string };

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Names Windows reserves for devices, which no directory there can have. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
const NAMED = "lowercase letters, digits and single hyphens, never a name Windows reserves such as con or nul";

/** Whether `name` can name a Requirement's directory on every platform. */
function named(name: string): boolean {
  return NAME.test(name) && !RESERVED.test(name);
}

/** The fields and body of the record at `file`, or why it is not a record. */
function recordOf(file: string): { fields: Record<string, unknown>; statement: string } | string {
  const text = fs.readFileSync(file, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return "missing YAML frontmatter";
  try {
    const data: unknown = YAML.parse(match[1]!);
    if (!data || typeof data !== "object" || Array.isArray(data)) return "frontmatter must be a mapping";
    return { fields: data as Record<string, unknown>, statement: text.slice(match[0].length).trim() };
  } catch (e) {
    return `frontmatter is not valid YAML (${e instanceof Error ? e.message : String(e)})`;
  }
}

function required(value: string, what: string): void {
  if (!value.trim()) throw new Error(`${what} is required`);
}

/**
 * Records the Requirement `name` in `dir`: `holds`, concisely what the using
 * system commits to hold, and `statement`, the commitment in full: what
 * holding it means and where it ends. Refuses a name that is not portable and
 * a Requirement that is already recorded, so a commitment is never rewritten
 * in place. The record is staged and renamed into place once complete, so a
 * failure or crash before then never takes the Requirement's name.
 */
export function recordRequirement(
  dir: string,
  name: string,
  { holds, statement }: { holds: string; statement: string },
): string {
  if (!named(name)) throw new Error(`${name}: a Requirement's name is ${NAMED}`);
  required(holds, "holds");
  required(statement, "the statement");
  const at = path.join(dir, name);
  const recorded = `${at}: already recorded; a Requirement's record never changes`;
  if (fs.existsSync(at)) throw new Error(recorded);
  fs.mkdirSync(dir, { recursive: true });
  const staged = path.join(dir, `.${name}.${randomUUID()}.tmp`);
  const fields = YAML.stringify({ holds }).trimEnd();
  try {
    fs.mkdirSync(staged);
    fs.writeFileSync(path.join(staged, REQUIREMENT), `---\n${fields}\n---\n\n${statement.trim()}\n`, { flag: "wx" });
    if (fs.existsSync(at)) throw new Error(recorded);
    fs.renameSync(staged, at);
  } catch (e) {
    fs.rmSync(staged, { recursive: true, force: true });
    throw e;
  }
  return path.join(at, REQUIREMENT);
}

/** Every Requirement recorded in `dir`, in name order. */
export function readRequirements(dir: string): Requirement[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .flatMap((name) => {
      const record = recordOf(path.join(dir, name, REQUIREMENT));
      if (typeof record === "string") return [];
      return [{ name, holds: String(record.fields.holds) }];
    });
}

/**
 * Everything that keeps `dir` from being a directory of Requirement records:
 * an unportable name, a missing or malformed record, a record without what it
 * holds or its statement, any other field, or anything else in a
 * Requirement's directory. Files beside the Requirements, such as guidance for
 * working among them, are left alone.
 */
export function requirementErrors(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const errors: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!entry.isDirectory()) continue;
    const at = path.join(dir, entry.name);
    // Hidden staging directories are not ignored: one left by a crash is
    // incomplete state and remains visible to the check until removed.
    if (!named(entry.name)) {
      errors.push(`${at}: not a Requirement; each Requirement is a directory named with ${NAMED}`);
      continue;
    }
    for (const other of fs.readdirSync(at).filter((file) => file !== REQUIREMENT))
      errors.push(`${path.join(at, other)}: a Requirement holds only ${REQUIREMENT}`);
    const target = path.join(at, REQUIREMENT);
    if (!fs.lstatSync(target, { throwIfNoEntry: false })?.isFile()) {
      errors.push(`${target}: missing`);
      continue;
    }
    const record = recordOf(target);
    if (typeof record === "string") {
      errors.push(`${target}: ${record}`);
      continue;
    }
    if (typeof record.fields.holds !== "string" || !record.fields.holds.trim())
      errors.push(`${target}: holds is required`);
    for (const field of Object.keys(record.fields).filter((field) => !FIELDS.includes(field)))
      errors.push(`${target}: ${field} is not a field of a Requirement, which records only holds`);
    if (!record.statement) errors.push(`${target}: the statement is required`);
  }
  return errors;
}
