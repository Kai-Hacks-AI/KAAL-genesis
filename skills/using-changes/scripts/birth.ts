import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { type Change, lineageError, occurrenceError, ROOT } from "./changes.js";

export type Birth = Change & { root?: string };

/**
 * Refuses to birth through a symlink anywhere from the root down to where the
 * Change is born, so a Change is never born outside the root or into material
 * it does not own. Uses lstat so dangling symlinks are refused too.
 */
function rejectSymlinks(root: string, dir: string): void {
  let current = root;
  for (const part of ["", ...path.relative(root, dir).split(path.sep)]) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error(`${current}: symlink in Change path`);
  }
}

/**
 * Births a Change: creates its occurrence directory, empty, and nothing in it.
 * What the Change will hold is not birth's concern. Refuses an unportable
 * lineage, a malformed occurrence and a symlinked path before writing
 * anything, and refuses an occurrence that already exists: a Change is never
 * born again, so an earlier Change is never written over. If birth fails
 * partway, the directories it created are removed. Returns the occurrence's
 * directory.
 */
export function birthChange(input: Birth): string {
  const root = input.root ?? ROOT;
  const error = lineageError(input.lineage) ?? occurrenceError(input.occurrence);
  if (error) throw new Error(error);
  const dir = path.join(root, input.lineage, ...input.occurrence.split("/"));
  rejectSymlinks(root, dir);
  const created = fs.mkdirSync(path.dirname(dir), { recursive: true });
  try {
    // Not recursive: an existing occurrence, even an empty one, is refused.
    fs.mkdirSync(dir);
  } catch (e) {
    if (created) fs.rmSync(created, { recursive: true, force: true });
    if ((e as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`${input.lineage}/${input.occurrence}: already exists; a Change is never born again`);
    }
    throw e;
  }
  return dir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [lineage, occurrence, ...rest] = process.argv.slice(2);
  if (!lineage || !occurrence || rest.length) {
    console.error("usage: birth.ts <lineage> <YY/MM/DD/CC>");
    process.exitCode = 2;
  } else {
    try {
      console.log(birthChange({ lineage, occurrence }));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
