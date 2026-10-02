import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { idError, referenceError, render, type Reference, typeError } from "./graph.js";

/**
 * Births the Node `id` in the scope `dir`: `<dir>/<id>.md`, never over an
 * existing file. A Node states its References when it is born, because they
 * are part of the referrer and a Node never changes. Refuses an unportable id,
 * a blank type, a blank meaning, a malformed Reference and a symlinked dir. Returns the file.
 */
export function birthNode(
  dir: string,
  id: string,
  type: string,
  meaning: string,
  references: Reference[] = [],
): string {
  const error = idError(id) ?? typeError(type);
  if (error) throw new Error(error);
  if (!meaning.trim()) throw new Error("a Node must give its meaning");
  for (const reference of references) {
    const bad = referenceError(reference);
    if (bad) throw new Error(bad);
  }
  if (fs.lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`${dir}: symlink`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  // "wx" refuses to overwrite: a Node is never rewritten.
  fs.writeFileSync(file, render(id, type, meaning, references), { flag: "wx" });
  return file;
}

/** `relation=target`, split at the first `=`: a relation holds none, a target may. */
function parseReference(text: string): Reference {
  const at = text.indexOf("=");
  return { relation: text.slice(0, at), target: text.slice(at + 1) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const references: Reference[] = [];
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--reference" && args[i + 1]?.includes("=")) references.push(parseReference(args[++i]));
    else rest.push(args[i]);
  }
  const [dir, id, type, meaning, ...extra] = rest;
  if (!dir || !id || !type || !meaning || extra.length) {
    console.error("usage: birth.ts <dir> <id> <type> <meaning> [--reference <relation>=<target>]...");
    process.exitCode = 2;
  } else {
    try {
      console.log(birthNode(dir, id, type, meaning, references));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
