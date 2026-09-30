import path from "node:path";
import { pathToFileURL } from "node:url";
import { readChanges, ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";
import { readRequirements, type Requirement } from "../skills/managing-requirements/scripts/requirements.js";

/**
 * KAAL's composition of Changes and Requirements. managing-change owns the
 * occurrence and never interprets what is beneath it; managing-requirements
 * interprets Requirements and knows nothing of Changes. This decides how they
 * meet: a Change that introduces Requirements keeps them in its one
 * occurrence's `requirement/` directory, beside whatever else it holds, and
 * adds no occurrence identity of its own.
 * Why: brain/learning/requirements/26/09/30/01/nodes/managing-requirements.md
 */

/** Where a Change occurrence keeps the Requirements it introduces. */
export const REQUIREMENT_DIR = "requirement";

/** Every Change's `requirement/` directory beneath the repository, in traversal order; a Change with none holds none. */
export function requirementRoots(repo = "."): string[] {
  return readChanges(path.join(repo, CHANGE_ROOT)).changes.map((change) =>
    path.join(repo, CHANGE_ROOT, change.lineage, ...change.occurrence.split("/"), REQUIREMENT_DIR),
  );
}

/** KAAL's Requirements across all its Changes, with everything that stops them being Requirements. */
export function kaalRequirements(repo = "."): { requirements: Requirement[]; errors: string[] } {
  const changes = readChanges(path.join(repo, CHANGE_ROOT));
  const { requirements, errors } = readRequirements(requirementRoots(repo));
  return { requirements, errors: [...changes.errors.map((e) => `${CHANGE_ROOT}/${e}`), ...errors] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors } = kaalRequirements();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
}
