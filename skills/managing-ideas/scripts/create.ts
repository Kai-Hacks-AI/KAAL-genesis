import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { idError, render } from "./ideas.js";

/**
 * Creates the Idea `id` in `dir`: `<dir>/<id>.md`, never over an
 * existing file. Refuses an unportable id, a blank `idea` or `context` and a symlinked dir. `idea` is the possibility and `context` what is needed to understand it.
 * Returns the file.
 */
export function createIdea(dir: string, id: string, idea: string, context: string): string {
  const error = idError(id);
  if (error) throw new Error(error);
  if (!idea.trim()) throw new Error("an Idea must state its possibility");
  if (!context.trim()) throw new Error("an Idea must give its context");
  if (fs.lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`${dir}: symlink`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  // "wx" refuses to overwrite: an Idea is never rewritten.
  fs.writeFileSync(file, render(id, idea, context), { flag: "wx" });
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, id, idea, context, ...rest] = process.argv.slice(2);
  if (!dir || !id || !idea || !context || rest.length) {
    console.error("usage: create.ts <dir> <id> <idea> <context>");
    process.exitCode = 2;
  } else {
    try {
      console.log(createIdea(dir, id, idea, context));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
