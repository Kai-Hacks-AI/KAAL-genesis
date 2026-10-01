import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { idError, render } from "./architecture.js";

/**
 * Creates the Architecture `id` in `dir`: `<dir>/<id>.md`, never over an
 * existing file. Refuses an unportable id, a blank placement and a symlinked dir.
 * Returns the file.
 */
export function createArchitecture(dir: string, id: string, placement: string): string {
  const error = idError(id);
  if (error) throw new Error(error);
  if (!placement.trim()) throw new Error("an Architecture must state its placement");
  if (fs.lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`${dir}: symlink`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  // "wx" refuses to overwrite: an Architecture is never rewritten.
  fs.writeFileSync(file, render(id, placement), { flag: "wx" });
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, id, placement, ...rest] = process.argv.slice(2);
  if (!dir || !id || !placement || rest.length) {
    console.error("usage: create.ts <dir> <id> <placement>");
    process.exitCode = 2;
  } else {
    try {
      console.log(createArchitecture(dir, id, placement));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
