import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { idError, render } from "./ideas.js";

/**
 * Creates the Idea `id` in `dir`: `<dir>/<id>.md`, never over an
 * existing file. Refuses an unportable id, a blank possibility and a symlinked dir.
 * Returns the file.
 */
export function createIdea(dir: string, id: string, possibility: string): string {
  const error = idError(id);
  if (error) throw new Error(error);
  if (!possibility.trim()) throw new Error("an Idea must state its possibility");
  if (fs.lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`${dir}: symlink`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  // "wx" refuses to overwrite: an Idea is never rewritten.
  fs.writeFileSync(file, render(id, possibility), { flag: "wx" });
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, id, possibility, ...rest] = process.argv.slice(2);
  if (!dir || !id || !possibility || rest.length) {
    console.error("usage: create.ts <dir> <id> <possibility>");
    process.exitCode = 2;
  } else {
    try {
      console.log(createIdea(dir, id, possibility));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
