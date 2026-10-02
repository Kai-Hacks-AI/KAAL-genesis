import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/** A Node: a durable, immutable, addressable thing with an identity in the scope (directory) that holds it, and a type naming what it is. */
export type Node = { name: string; type: string; meaning: string; file: string };

/** Windows reserves these device names as file names, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/** Far inside the common 255-byte file name limit once `.md` is added. */
export const MAX_NAME = 64;

/**
 * A Node's name is its identity in its scope and its file name there, so it
 * must resolve to the same file on every platform: words of letters and digits
 * (any script, composed form) with single spaces between, no Windows reserved
 * device name. Two names that differ only in case are one name, because a file
 * system may say so. This is the identity of Nodes held here and no more: a
 * type is an opaque name and owes this format nothing.
 */
export function nameError(name: string): string | undefined {
  if (name.length > MAX_NAME) return `name "${name.slice(0, 16)}..." is longer than ${MAX_NAME} characters`;
  if (name !== name.normalize("NFC")) return `name "${name}" must be in Unicode normal form C`;
  if (!/^[\p{L}\p{N}]+( [\p{L}\p{N}]+)*$/u.test(name))
    return `name "${name}" must be words of letters and digits with single spaces`;
  if (RESERVED.test(name.toLowerCase())) return `name "${name}" is reserved on Windows`;
  return undefined;
}

/** Text as written, less whole blank lines before it and whitespace after it. */
function framed(text: string): string {
  return text.replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
}

/** Why a type is not one, or nothing. It is a non-blank name; whether it names a Node is not asked here. */
export function typeError(type: unknown): string | undefined {
  return typeof type === "string" && type.trim() ? undefined : "a Node must name its type";
}

/** The text of a Node file: frontmatter holding its name and its type, then its meaning. */
export function render(name: string, type: string, meaning: string): string {
  const data: Record<string, unknown> = { name, type: type.trim() };
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
  const { name, type } = data as { name?: unknown; type?: unknown };
  if (typeof name !== "string") return `${file}: name is required`;
  const error = nameError(name);
  if (error) return `${file}: ${error}`;
  if (path.basename(file) !== `${name}.md`) return `${file}: file name must be ${name}.md`;
  if (typeof type !== "string" || typeError(type)) return `${file}: ${typeError(type)}`;
  const meaning = framed(match[2]);
  if (!meaning) return `${file}: a Node must give its meaning`;
  return { name, type: type.trim(), meaning, file };
}

/**
 * Every Node in the scope `dir`, and everything that claims to be one: the
 * `*.md` entries directly in it, each a regular file holding a Node. The scope
 * owns its names, so a name is unique here and nowhere else is asked. Whether a
 * type names a Node here is never asked either. A missing scope
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
  const seen = new Map<string, string>();
  for (const { name } of nodes) {
    const folded = name.toLowerCase();
    const first = seen.get(folded);
    if (first) errors.push(`${dir}: name "${name}" is the same name as "${first}" in another case`);
    else seen.set(folded, name);
  }
  return { nodes, errors };
}
