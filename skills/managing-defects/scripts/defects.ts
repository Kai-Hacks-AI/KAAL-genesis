import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/**
 * A defect is a persistent record that something intended to hold was
 * observed not to hold. Each defect is a directory in the defects directory,
 * named for the defect, holding `defect.md`: what was intended to hold, where
 * it was observed not to hold, and what was observed. It never changes once
 * written: what was observed stays observed. A defect records no state of its
 * own and names nothing that tests it; what tests a defect points at it. The
 * observation, the defect and any repair stay distinct.
 */

export const DEFECT = "defect.md";

export type Defect = { name: string; holds: string; observed: string };

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Names Windows reserves for devices, which no directory there can have. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
const NAMED = "lowercase letters, digits and single hyphens, never a name Windows reserves such as con or nul";

/** Whether `name` can name a defect's directory on every platform. */
function named(name: string): boolean {
  return NAME.test(name) && !RESERVED.test(name);
}

/** The fields of the record at `file`, or why it is not a record. */
function fieldsOf(file: string): Record<string, unknown> | string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(fs.readFileSync(file, "utf8"));
  if (!match) return "missing YAML frontmatter";
  try {
    const data: unknown = YAML.parse(match[1]!);
    return data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : "frontmatter must be a mapping";
  } catch (e) {
    return `frontmatter is not valid YAML (${e instanceof Error ? e.message : String(e)})`;
  }
}

function required(value: string, what: string): void {
  if (!value.trim()) throw new Error(`${what} is required`);
}

/**
 * Records the defect `name` in `dir`: `holds`, what was intended to hold;
 * `observed`, where it was observed not to hold; and `observation`, what was
 * observed. Refuses a name that is not lowercase letters, digits and single
 * hyphens or that Windows reserves, and a defect that is already recorded, so
 * a record is never overwritten. A record is written whole or not at all: if
 * writing it fails, the defect's directory is removed again, so it can be
 * recorded once the failure is gone. Returns the record's path.
 */
export function recordDefect(
  dir: string,
  name: string,
  { holds, observed, observation }: { holds: string; observed: string; observation: string },
): string {
  if (!named(name)) throw new Error(`${name}: a defect's name is ${NAMED}`);
  required(holds, "holds");
  required(observed, "observed");
  required(observation, "the observation");
  const at = path.join(dir, name);
  if (fs.existsSync(at)) throw new Error(`${at}: already recorded; a defect's record never changes`);
  fs.mkdirSync(dir, { recursive: true });
  // Exclusive: only the call that creates the directory writes into it, or removes it again.
  fs.mkdirSync(at);
  const file = path.join(at, DEFECT);
  const fields = YAML.stringify({ holds, observed }).trimEnd();
  try {
    fs.writeFileSync(file, `---\n${fields}\n---\n\n${observation.trim()}\n`, { flag: "wx" });
  } catch (e) {
    fs.rmSync(at, { recursive: true, force: true });
    throw e;
  }
  return file;
}

/** Every defect recorded in `dir`, in name order. */
export function readDefects(dir: string): Defect[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .flatMap((name) => {
      const defect = fieldsOf(path.join(dir, name, DEFECT));
      if (typeof defect === "string") return [];
      return [{ name, holds: String(defect.holds), observed: String(defect.observed) }];
    });
}

/**
 * Everything that keeps `dir` from being a directory of defect records: a
 * directory that is not named as a defect, a defect without its record, a
 * record without what should hold, where it was observed or what was
 * observed, and anything else in a defect's directory.
 * Files beside the defects, such as guidance for working among them, are the
 * using system's and are left alone.
 */
export function defectErrors(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const errors: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!entry.isDirectory()) continue;
    const at = path.join(dir, entry.name);
    if (!named(entry.name)) {
      errors.push(`${at}: not a defect; each defect is a directory named with ${NAMED}`);
      continue;
    }
    for (const other of fs.readdirSync(at).filter((f) => f !== DEFECT))
      errors.push(`${path.join(at, other)}: a defect holds only ${DEFECT}`);
    const target = path.join(at, DEFECT);
    if (!fs.lstatSync(target, { throwIfNoEntry: false })?.isFile()) {
      errors.push(`${target}: missing`);
      continue;
    }
    const data = fieldsOf(target);
    if (typeof data === "string") {
      errors.push(`${target}: ${data}`);
      continue;
    }
    for (const field of ["holds", "observed"])
      if (typeof data[field] !== "string" || !(data[field] as string).trim())
        errors.push(`${target}: ${field} is required`);
    if (
      !fs
        .readFileSync(target, "utf8")
        .replace(/^---\r?\n[\s\S]*?\r?\n---/, "")
        .trim()
    )
      errors.push(`${target}: what was observed is required`);
  }
  return errors;
}
