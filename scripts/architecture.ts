import path from "node:path";
import { pathToFileURL } from "node:url";
import { type Architecture, readArchitecture } from "../skills/architecting/scripts/architecture.js";
import { readChanges, ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";

/**
 * KAAL's composition of Changes and Architecture records. managing-change owns
 * the occurrence and never interprets what is beneath it; architecting
 * interprets Architecture records and knows nothing of Changes. This decides
 * how they meet: a Change that settles where a responsibility or machinery
 * belongs keeps that in its one occurrence's `architecture/` directory, beside
 * whatever else it holds, and adds no occurrence identity of its own. What
 * other work owes a record is that work's own to say, never written into the
 * record, and nothing here makes any skill depend on it.
 * Why: brain/learning/architecting/26/10/01/01/nodes/architecting.md
 */

/** Where a Change occurrence keeps the Architecture records it introduces. */
export const ARCHITECTURE_DIR = "architecture";

/** Every Change's `architecture/` directory beneath the repository, in traversal order; a Change with none holds none. */
export function architectureRoots(repo = "."): string[] {
  return readChanges(path.join(repo, CHANGE_ROOT)).changes.map((change) =>
    path.join(repo, CHANGE_ROOT, change.lineage, ...change.occurrence.split("/"), ARCHITECTURE_DIR),
  );
}

/** KAAL's Architecture records across all its Changes, with everything that stops them being records. */
export function kaalArchitecture(repo = "."): { records: Architecture[]; errors: string[] } {
  const changes = readChanges(path.join(repo, CHANGE_ROOT));
  const { records, errors } = readArchitecture(architectureRoots(repo));
  return { records, errors: [...changes.errors.map((e) => `${CHANGE_ROOT}/${e}`), ...errors] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors } = kaalArchitecture();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
}
