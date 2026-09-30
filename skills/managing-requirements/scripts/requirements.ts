import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/** A Requirement: durable meaning, identified by a portable `id`. */
export type Requirement = { id: string; meaning: string; file: string };

/** Windows reserves these device names as file names, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/**
 * An id is the Requirement's identity and its file name, so it must resolve to
 * the same file on every supported platform: lowercase kebab-case rules out
 * case collisions, dots and separators, and Windows reserved names are refused.
 */
export function idError(id: string): string | undefined {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) return `id "${id}" must be lowercase kebab-case (a-z, 0-9, single hyphens)`;
  if (RESERVED.test(id)) return `id "${id}" is reserved on Windows`;
  return undefined;
}

/** The text of a Requirement file: frontmatter holding only its id, then its meaning. */
export function render(id: string, meaning: string): string {
  return `---\nid: ${id}\n---\n\n${meaning.trim()}\n`;
}

/** Parses one Requirement file, or says why it is not one. `file` is only used to name errors. */
export function parse(text: string, file: string): Requirement | string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!match) return `${file}: missing YAML frontmatter`;
  let data: unknown;
  try {
    data = YAML.parse(match[1]);
  } catch {
    return `${file}: frontmatter is not valid YAML`;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return `${file}: frontmatter must be a mapping`;
  const id = (data as { id?: unknown }).id;
  if (typeof id !== "string") return `${file}: id is required`;
  const error = idError(id);
  if (error) return `${file}: ${error}`;
  if (path.basename(file) !== `${id}.md`) return `${file}: file name must be ${id}.md`;
  const meaning = match[2].trim();
  if (!meaning) return `${file}: a Requirement must state its meaning`;
  return { id, meaning, file };
}

/**
 * Every Requirement in each root, and everything that claims to be one. The
 * candidates are the `*.md` entries directly in a root: each must be a regular
 * file holding a Requirement. Anything else in or beside a root is the
 * caller's and is neither read nor refused. An id is defined once across all
 * the roots given. A missing root holds no Requirements. Where the roots are,
 * and what they sit inside, is the caller's.
 */
export function readRequirements(roots: string[]): { requirements: Requirement[]; errors: string[] } {
  const requirements: Requirement[] = [];
  const errors: string[] = [];
  for (const root of roots) {
    const stat = fs.lstatSync(root, { throwIfNoEntry: false });
    if (!stat) continue;
    if (!stat.isDirectory()) {
      errors.push(`${root}: not a directory`);
      continue;
    }
    const names = fs.readdirSync(root).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) {
      if (!name.endsWith(".md")) continue;
      const file = path.join(root, name);
      if (!fs.lstatSync(file).isFile()) {
        errors.push(`${file}: a Requirement must be a regular file`);
        continue;
      }
      const result = parse(fs.readFileSync(file, "utf8"), file);
      if (typeof result === "string") errors.push(result);
      else requirements.push(result);
    }
  }
  const seen = new Map<string, string>();
  for (const { id, file } of requirements) {
    const first = seen.get(id);
    if (first) errors.push(`${file}: id "${id}" is already defined by ${first}`);
    else seen.set(id, file);
  }
  return { requirements, errors };
}

/** Resolves references to Requirements: the ones found, and one error per id that names none. */
export function resolve(requirements: Requirement[], ids: string[]): { found: Requirement[]; errors: string[] } {
  const found: Requirement[] = [];
  const errors: string[] = [];
  for (const id of ids) {
    const requirement = requirements.find((r) => r.id === id);
    if (requirement) found.push(requirement);
    else errors.push(`${id}: no such Requirement`);
  }
  return { found, errors };
}
