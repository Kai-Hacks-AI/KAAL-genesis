import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { idError, render } from "./defects.js";

/**
 * Creates the Defect `id` in `dir`: `<dir>/<id>.md`, never over an
 * existing file. `holds` is what was intended to hold and `observation` what
 * was observed not to. Refuses an unportable id, a blank `holds` or
 * `observation` and a symlinked dir.
 * Returns the file.
 */
export function createDefect(dir: string, id: string, holds: string, observation: string): string {
  const error = idError(id);
  if (error) throw new Error(error);
  if (!holds.trim()) throw new Error("a Defect must state what was intended to hold");
  if (!observation.trim()) throw new Error("a Defect must state what was observed");
  if (fs.lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`${dir}: symlink`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  // "wx" refuses to overwrite: a Defect is never rewritten.
  fs.writeFileSync(file, render(id, holds, observation), { flag: "wx" });
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, id, holds, observation, ...rest] = process.argv.slice(2);
  if (!dir || !id || !holds || !observation || rest.length) {
    console.error("usage: create.ts <dir> <id> <holds> <observation>");
    process.exitCode = 2;
  } else {
    try {
      console.log(createDefect(dir, id, holds, observation));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
