import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/** An Idea: a possibility worth retaining without commitment, identified by a portable `id`. */
export type Idea = { id: string; idea: string; context: string; file: string };

/** Windows reserves these device names as file names, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/** Far inside the common 255-byte file name limit once `.md` is added, so every accepted id can be a file name. */
export const MAX_ID = 64;

/**
 * An id is the Idea's identity and its file name, so it must resolve to
 * the same file on every supported platform: lowercase kebab-case rules out
 * case collisions, dots and separators, and Windows reserved names are refused.
 */
export function idError(id: string): string | undefined {
  if (id.length > MAX_ID) return `id "${id.slice(0, 16)}..." is longer than ${MAX_ID} characters`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) return `id "${id}" must be lowercase kebab-case (a-z, 0-9, single hyphens)`;
  if (RESERVED.test(id)) return `id "${id}" is reserved on Windows`;
  return undefined;
}

/**
 * Text as written, less only its framing: whole blank lines before it
 * and whitespace after it. Indentation of the first line is content (a
 * Markdown code block starts with it), so it is never trimmed.
 */
export function framed(text: string): string {
  return text.replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
}

/** The text of an Idea file: frontmatter holding its id and the possibility, then the context needed to understand it. */
export function render(id: string, idea: string, context: string): string {
  return `---\n${YAML.stringify({ id, idea: idea.trim() }).trimEnd()}\n---\n\n${framed(context)}\n`;
}

/** Parses one Idea file, or says why it is not one. `file` is only used to name errors. */
export function parse(text: string, file: string): Idea | string {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!match) return `${file}: missing YAML frontmatter`;
  let data: unknown;
  try {
    data = YAML.parse(match[1]);
  } catch {
    return `${file}: frontmatter is not valid YAML`;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return `${file}: frontmatter must be a mapping`;
  const { id, idea } = data as { id?: unknown; idea?: unknown };
  if (typeof id !== "string") return `${file}: id is required`;
  const error = idError(id);
  if (error) return `${file}: ${error}`;
  if (path.basename(file) !== `${id}.md`) return `${file}: file name must be ${id}.md`;
  if (typeof idea !== "string" || !idea.trim()) return `${file}: idea is required`;
  const context = framed(match[2]);
  if (!context) return `${file}: an Idea must give its context`;
  return { id, idea: idea.trim(), context, file };
}

/**
 * Every Idea in each root, and everything that claims to be one. The
 * candidates are the `*.md` entries directly in a root: each must be a regular
 * file holding an Idea. Anything else in or beside a root is the
 * caller's and is neither read nor refused. An id is defined once across all
 * the roots given. A missing root holds no Ideas. Where the roots are,
 * and what they sit inside, is the caller's.
 */
export function readIdeas(roots: string[]): { ideas: Idea[]; errors: string[] } {
  const ideas: Idea[] = [];
  const errors: string[] = [];
  const visited = new Set<string>();
  for (const root of roots) {
    const stat = fs.lstatSync(root, { throwIfNoEntry: false });
    if (!stat) continue;
    if (!stat.isDirectory()) {
      errors.push(`${root}: not a directory`);
      continue;
    }
    // The same directory supplied twice is one root, not a duplicate of itself.
    const real = fs.realpathSync(root);
    if (visited.has(real)) continue;
    visited.add(real);
    const names = fs.readdirSync(root).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) {
      if (!name.endsWith(".md")) continue;
      const file = path.join(root, name);
      if (!fs.lstatSync(file).isFile()) {
        errors.push(`${file}: an Idea must be a regular file`);
        continue;
      }
      const result = parse(fs.readFileSync(file, "utf8"), file);
      if (typeof result === "string") errors.push(result);
      else ideas.push(result);
    }
  }
  const seen = new Map<string, string>();
  const duplicated = new Set<string>();
  for (const { id, file } of ideas) {
    const first = seen.get(id);
    if (first) {
      errors.push(`${file}: id "${id}" is already defined by ${first}`);
      duplicated.add(id);
    } else seen.set(id, file);
  }
  // An id defined twice names no single Idea, so it resolves to none.
  return { ideas: ideas.filter((r) => !duplicated.has(r.id)), errors };
}

/** Resolves references to Ideas: the ones found, and one error per id that names none. */
export function resolve(ideas: Idea[], ids: string[]): { found: Idea[]; errors: string[] } {
  const found: Idea[] = [];
  const errors: string[] = [];
  for (const id of ids) {
    const idea = ideas.find((r) => r.id === id);
    if (idea) found.push(idea);
    else errors.push(`${id}: no such Idea`);
  }
  return { found, errors };
}
