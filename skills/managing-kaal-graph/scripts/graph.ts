import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/** A Reference: a relation and a target, both opaque names. It belongs to the Node that states it. */
export type Reference = { relation: string; target: string };

/** A Node: a durable, immutable, addressable thing with an identity in the scope (directory) that holds it, and a type naming what it is. */
export type Node = { id: string; type: string; meaning: string; references: Reference[]; file: string };

/** Windows reserves these device names as file names, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/** Far inside the common 255-byte file name limit once `.md` is added. */
export const MAX_ID = 64;

/**
 * A Node's id is its file name in its scope, so it must resolve to the same
 * file on every platform. This is the identity of Nodes held here and no
 * more: a Reference target is an opaque name and owes this format nothing.
 */
export function idError(id: string): string | undefined {
  if (id.length > MAX_ID) return `id "${id.slice(0, 16)}..." is longer than ${MAX_ID} characters`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) return `id "${id}" must be lowercase kebab-case (a-z, 0-9, single hyphens)`;
  if (RESERVED.test(id)) return `id "${id}" is reserved on Windows`;
  return undefined;
}

/** Text as written, less whole blank lines before it and whitespace after it. */
function framed(text: string): string {
  return text.replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
}

/** Why a Reference is not one, or nothing. A relation and a target are non-blank names; nothing more is asked of either. */
export function referenceError(reference: unknown): string | undefined {
  if (typeof reference !== "object" || reference === null || Array.isArray(reference))
    return "a reference must be a mapping";
  const { relation, target } = reference as { relation?: unknown; target?: unknown };
  if (typeof relation !== "string" || !relation.trim()) return "a reference must name a relation";
  if (typeof target !== "string" || !target.trim()) return "a reference must name a target";
  return undefined;
}

/** Why a type is not one, or nothing. Like a Reference's target it is a non-blank name; whether it names a Node is not asked here. */
export function typeError(type: unknown): string | undefined {
  return typeof type === "string" && type.trim() ? undefined : "a Node must name its type";
}

/** The text of a Node file: frontmatter holding its id, its type and the References it states, then its meaning. */
export function render(id: string, type: string, meaning: string, references: Reference[] = []): string {
  const data: Record<string, unknown> = { id, type: type.trim() };
  if (references.length)
    data.references = references.map((r) => ({ relation: r.relation.trim(), target: r.target.trim() }));
  return `---\n${YAML.stringify(data).trimEnd()}\n---\n\n${framed(meaning)}\n`;
}

/** Parses one Node file, or says why it is not one. `file` is only used to name errors. */
export function parse(text: string, file: string): Node | string {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!match) return `${file}: missing YAML frontmatter`;
  let data: unknown;
  try {
    data = YAML.parse(match[1]);
  } catch {
    return `${file}: frontmatter is not valid YAML`;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return `${file}: frontmatter must be a mapping`;
  const { id, type, references } = data as { id?: unknown; type?: unknown; references?: unknown };
  if (typeof id !== "string") return `${file}: id is required`;
  const error = idError(id);
  if (error) return `${file}: ${error}`;
  if (path.basename(file) !== `${id}.md`) return `${file}: file name must be ${id}.md`;
  if (typeof type !== "string" || typeError(type)) return `${file}: ${typeError(type)}`;
  const meaning = framed(match[2]);
  if (!meaning) return `${file}: a Node must give its meaning`;
  if (references !== undefined && !Array.isArray(references)) return `${file}: references must be a list`;
  const stated: Reference[] = [];
  for (const reference of references ?? []) {
    const bad = referenceError(reference);
    if (bad) return `${file}: ${bad}`;
    const { relation, target } = reference as Reference;
    stated.push({ relation: relation.trim(), target: target.trim() });
  }
  return { id, type: type.trim(), meaning, references: stated, file };
}

/**
 * Every Node in the scope `dir`, and everything that claims to be one: the
 * `*.md` entries directly in it, each a regular file holding a Node. The scope
 * owns its ids, so an id is unique here and nowhere else is asked. Whether a
 * Reference's target is a Node here is never asked either. A missing scope
 * holds no Nodes.
 */
export function readNodes(dir: string): { nodes: Node[]; errors: string[] } {
  const nodes: Node[] = [];
  const errors: string[] = [];
  const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!stat) return { nodes, errors };
  if (!stat.isDirectory()) return { nodes, errors: [`${dir}: not a directory`] };
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".md")) continue;
    const file = path.join(dir, name);
    if (!fs.lstatSync(file).isFile()) {
      errors.push(`${file}: a Node must be a regular file`);
      continue;
    }
    const result = parse(fs.readFileSync(file, "utf8"), file);
    if (typeof result === "string") errors.push(result);
    else nodes.push(result);
  }
  return { nodes, errors };
}

/**
 * The Nodes in this scope that state a Reference to `target`, with the
 * relation each states. Derived from the referrers every time; the target
 * records nothing and need not be a Node.
 */
export function referrersOf(nodes: Node[], target: string): { referrer: string; relation: string }[] {
  return nodes.flatMap((n) =>
    n.references.filter((r) => r.target === target).map((r) => ({ referrer: n.id, relation: r.relation })),
  );
}
