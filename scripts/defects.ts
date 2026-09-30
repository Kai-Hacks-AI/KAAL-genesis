import path from "node:path";
import { pathToFileURL } from "node:url";
import { readChanges, ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";
import { readDefects, type Defect } from "../skills/managing-defects/scripts/defects.js";

/**
 * KAAL's composition of Changes and Defects. managing-change owns the
 * occurrence and never interprets what is beneath it; managing-defects
 * interprets Defects and knows nothing of Changes. This decides how they meet:
 * a Defect is born inside the Change occurrence that discovered it, in its
 * `defect/` directory beside whatever else it holds, and adds no occurrence
 * identity of its own. Where a Defect lies says where it was observed; what it
 * means for a Change is the Change's own to say, never written into the Defect.
 * Why: brain/learning/defects/26/09/30/01/nodes/managing-defects.md
 */

/** Where a Change occurrence keeps the Defects it discovered. */
export const DEFECT_DIR = "defect";

/** Every Change's `defect/` directory beneath the repository, in traversal order; a Change with none holds none. */
export function defectRoots(repo = "."): string[] {
  return readChanges(path.join(repo, CHANGE_ROOT)).changes.map((change) =>
    path.join(repo, CHANGE_ROOT, change.lineage, ...change.occurrence.split("/"), DEFECT_DIR),
  );
}

/** KAAL's Defects across all its Changes, with everything that stops them being Defects. */
export function kaalDefects(repo = "."): { defects: Defect[]; errors: string[] } {
  const changes = readChanges(path.join(repo, CHANGE_ROOT));
  const { defects, errors } = readDefects(defectRoots(repo));
  return { defects, errors: [...changes.errors.map((e) => `${CHANGE_ROOT}/${e}`), ...errors] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors } = kaalDefects();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
}
