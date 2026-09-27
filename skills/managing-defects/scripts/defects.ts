import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/**
 * A defect is a persistent record that something intended to hold was
 * observed not to hold. Each defect is a directory under the defects
 * directory, named for the defect: `defect.md` records what was intended to
 * hold, where it was observed not to hold, and what was observed, and never
 * changes once written; `resolved.md`, written once the defect is repaired,
 * records what repaired it. A defect is open until it is resolved. The
 * observation, the defect and its repair stay distinct: the defect keeps what
 * was observed, and the repair is recorded beside it, never over it.
 */

export const DEFECT = "defect.md";
export const RESOLVED = "resolved.md";

export type Defect = { name: string; holds: string; observed: string; resolved?: string };

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A record's text: its fields as YAML frontmatter, then its prose. */
function record(fields: Record<string, string>, prose: string): string {
  return `---\n${YAML.stringify(fields).trimEnd()}\n---\n\n${prose.trim()}\n`;
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
 * hyphens, and a defect that is already recorded, so a record is never
 * overwritten. Returns the record's path.
 */
export function recordDefect(
  dir: string,
  name: string,
  { holds, observed, observation }: { holds: string; observed: string; observation: string },
): string {
  if (!NAME.test(name)) throw new Error(`${name}: a defect's name is lowercase letters, digits and single hyphens`);
  required(holds, "holds");
  required(observed, "observed");
  required(observation, "the observation");
  const at = path.join(dir, name);
  if (fs.existsSync(at)) throw new Error(`${at}: already recorded; a defect's record never changes`);
  fs.mkdirSync(at, { recursive: true });
  const file = path.join(at, DEFECT);
  fs.writeFileSync(file, record({ holds, observed }, observation), { flag: "wx" });
  return file;
}

/**
 * Resolves the defect `name` in `dir`: `by`, what repaired it, and `how`.
 * Refuses a defect that is not recorded or is already resolved. The defect's
 * own record is left as it was. Returns the resolution's path.
 */
export function resolveDefect(dir: string, name: string, { by, how }: { by: string; how: string }): string {
  required(by, "by");
  required(how, "how it was repaired");
  const at = path.join(dir, name);
  if (!fs.existsSync(path.join(at, DEFECT))) throw new Error(`${at}: no such defect is recorded`);
  const file = path.join(at, RESOLVED);
  if (fs.existsSync(file)) throw new Error(`${at}: already resolved`);
  fs.writeFileSync(file, record({ by }, how), { flag: "wx" });
  return file;
}

/** Every defect recorded in `dir`, in name order, each with what resolved it if it is resolved. */
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
      const resolution = fs.existsSync(path.join(dir, name, RESOLVED))
        ? fieldsOf(path.join(dir, name, RESOLVED))
        : undefined;
      return [
        {
          name,
          holds: String(defect.holds),
          observed: String(defect.observed),
          ...(resolution && typeof resolution !== "string" ? { resolved: String(resolution.by) } : {}),
        },
      ];
    });
}

/**
 * Everything that keeps `dir` from being a directory of defect records: an
 * entry that is not a defect's directory, a defect without its record, a
 * record without what held, where it was observed or what was observed, a
 * resolution without what repaired it, and anything else in a defect's
 * directory.
 */
export function defectErrors(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const errors: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const at = path.join(dir, entry.name);
    if (!entry.isDirectory() || !NAME.test(entry.name)) {
      errors.push(
        `${at}: not a defect; each defect is a directory named with lowercase letters, digits and single hyphens`,
      );
      continue;
    }
    for (const other of fs.readdirSync(at).filter((f) => f !== DEFECT && f !== RESOLVED))
      errors.push(`${path.join(at, other)}: a defect holds only ${DEFECT} and, once repaired, ${RESOLVED}`);
    const check = (file: string, fields: string[], prose: string) => {
      const target = path.join(at, file);
      if (!fs.lstatSync(target, { throwIfNoEntry: false })?.isFile()) return errors.push(`${target}: missing`);
      const data = fieldsOf(target);
      if (typeof data === "string") return errors.push(`${target}: ${data}`);
      for (const field of fields)
        if (typeof data[field] !== "string" || !(data[field] as string).trim())
          errors.push(`${target}: ${field} is required`);
      if (
        !fs
          .readFileSync(target, "utf8")
          .replace(/^---\r?\n[\s\S]*?\r?\n---/, "")
          .trim()
      )
        errors.push(`${target}: ${prose} is required`);
      return undefined;
    };
    check(DEFECT, ["holds", "observed"], "what was observed");
    if (fs.existsSync(path.join(at, RESOLVED))) check(RESOLVED, ["by"], "how it was repaired");
  }
  return errors;
}
