import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/** An Idea is a possibility worth retaining without commitment. */

export const IDEA = "idea.md";
/**
 * The only field an Idea records; its body supplies the context. This
 * allowlist refuses lifecycle state without inventing a vocabulary of states.
 */
const FIELDS = ["idea"];

export type Idea = { name: string; idea: string };

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Names Windows reserves for devices, which no directory there can have. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
const NAMED = "lowercase letters, digits and single hyphens, never a name Windows reserves such as con or nul";

/** Whether `name` can name an Idea's directory on every platform. */
function named(name: string): boolean {
  return NAME.test(name) && !RESERVED.test(name);
}

/** The fields and body of the record at `file`, or why it is not a record. */
function recordOf(file: string): { fields: Record<string, unknown>; context: string } | string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(fs.readFileSync(file, "utf8"));
  if (!match) return "missing YAML frontmatter";
  try {
    const data: unknown = YAML.parse(match[1]!);
    if (!data || typeof data !== "object" || Array.isArray(data)) return "frontmatter must be a mapping";
    return {
      fields: data as Record<string, unknown>,
      context: fs.readFileSync(file, "utf8").slice(match[0].length).trim(),
    };
  } catch (e) {
    return `frontmatter is not valid YAML (${e instanceof Error ? e.message : String(e)})`;
  }
}

function required(value: string, what: string): void {
  if (!value.trim()) throw new Error(`${what} is required`);
}

/**
 * Records the Idea `name` in `dir`: `idea`, the possibility worth
 * retaining, and `context`, enough to understand it. Refuses a name that is
 * not portable and an Idea that is already recorded, so the record is never
 * overwritten. The record is staged and renamed into place once complete, so
 * a failure or crash before then never takes the Idea's name.
 */
export function recordIdea(dir: string, name: string, { idea, context }: { idea: string; context: string }): string {
  if (!named(name)) throw new Error(`${name}: an Idea's name is ${NAMED}`);
  required(idea, "the Idea");
  required(context, "context");
  const at = path.join(dir, name);
  if (fs.existsSync(at)) throw new Error(`${at}: already recorded; an Idea's record never changes`);
  fs.mkdirSync(dir, { recursive: true });
  const staged = path.join(dir, `.${name}.${randomUUID()}.tmp`);
  const fields = YAML.stringify({ idea }).trimEnd();
  try {
    fs.mkdirSync(staged);
    fs.writeFileSync(path.join(staged, IDEA), `---\n${fields}\n---\n\n${context.trim()}\n`, { flag: "wx" });
    if (fs.existsSync(at)) throw new Error(`${at}: already recorded; an Idea's record never changes`);
    fs.renameSync(staged, at);
  } catch (e) {
    fs.rmSync(staged, { recursive: true, force: true });
    throw e;
  }
  return path.join(at, IDEA);
}

/** Every Idea recorded in `dir`, in name order. */
export function readIdeas(dir: string): Idea[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .flatMap((name) => {
      const record = recordOf(path.join(dir, name, IDEA));
      if (typeof record === "string") return [];
      return [{ name, idea: String(record.fields.idea) }];
    });
}

/**
 * Everything that keeps `dir` from being a directory of Idea records: an
 * unportable name, a missing or malformed record, a record without its Idea or
 * context, any other field, or anything else in an Idea's directory. Files
 * beside the Ideas, such as guidance for working among them, are left alone.
 */
export function ideaErrors(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const errors: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!entry.isDirectory()) continue;
    const at = path.join(dir, entry.name);
    // Hidden staging directories are not ignored: one left by a crash is
    // incomplete state and remains visible to the check until removed.
    if (!named(entry.name)) {
      errors.push(`${at}: not an Idea; each Idea is a directory named with ${NAMED}`);
      continue;
    }
    for (const other of fs.readdirSync(at).filter((file) => file !== IDEA))
      errors.push(`${path.join(at, other)}: an Idea holds only ${IDEA}`);
    const target = path.join(at, IDEA);
    if (!fs.lstatSync(target, { throwIfNoEntry: false })?.isFile()) {
      errors.push(`${target}: missing`);
      continue;
    }
    const record = recordOf(target);
    if (typeof record === "string") {
      errors.push(`${target}: ${record}`);
      continue;
    }
    if (typeof record.fields.idea !== "string" || !record.fields.idea.trim())
      errors.push(`${target}: idea is required`);
    for (const field of Object.keys(record.fields).filter((field) => !FIELDS.includes(field)))
      errors.push(`${target}: ${field} is not a field of an Idea, which records only idea`);
    if (!record.context) errors.push(`${target}: context is required`);
  }
  return errors;
}
