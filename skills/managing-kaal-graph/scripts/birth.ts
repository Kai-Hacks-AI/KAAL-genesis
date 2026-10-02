import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { nameError, render, typeError } from "./graph.js";

/**
 * Births the Node `name` in the scope `dir`: `<dir>/<name>.md`, never over an
 * existing file, so a Node is never rewritten. Refuses an unportable name, a
 * blank type, a blank meaning and a symlinked dir. Returns the file.
 */
export function birthNode(dir: string, name: string, type: string, meaning: string): string {
  const error = nameError(name) ?? typeError(type);
  if (error) throw new Error(error);
  if (!meaning.trim()) throw new Error("a Node must give its meaning");
  if (fs.lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`${dir}: symlink`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.md`);
  // "wx" refuses to overwrite: a Node is never rewritten.
  fs.writeFileSync(file, render(name, type, meaning), { flag: "wx" });
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, name, type, meaning, ...extra] = process.argv.slice(2);
  if (!dir || !name || !type || !meaning || extra.length) {
    console.error("usage: birth.ts <dir> <name> <type> <meaning>");
    process.exitCode = 2;
  } else {
    try {
      console.log(birthNode(dir, name, type, meaning));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
