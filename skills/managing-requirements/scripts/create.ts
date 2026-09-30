import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { idError, render } from "./requirements.js";

/**
 * Creates the Requirement `id` in `dir`: `<dir>/<id>.md`, never over an
 * existing file. Refuses an unportable id, a blank meaning and a symlinked dir.
 * Returns the file.
 */
export function createRequirement(dir: string, id: string, meaning: string): string {
  const error = idError(id);
  if (error) throw new Error(error);
  if (!meaning.trim()) throw new Error("a Requirement must state its meaning");
  if (fs.lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`${dir}: symlink`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  // "wx" refuses to overwrite: a Requirement is never rewritten.
  fs.writeFileSync(file, render(id, meaning), { flag: "wx" });
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, id, meaning, ...rest] = process.argv.slice(2);
  if (!dir || !id || !meaning || rest.length) {
    console.error("usage: create.ts <dir> <id> <meaning>");
    process.exitCode = 2;
  } else {
    try {
      console.log(createRequirement(dir, id, meaning));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
