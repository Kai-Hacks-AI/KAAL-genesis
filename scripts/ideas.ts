import path from "node:path";
import { pathToFileURL } from "node:url";
import { type Idea, readIdeas } from "../skills/managing-ideas/scripts/ideas.js";
import { readChanges, ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";

/**
 * KAAL's composition of Changes and Ideas. managing-change owns
 * the occurrence and never interprets what is beneath it; managing-ideas
 * interprets Ideas and knows nothing of Changes. This decides
 * how they meet: a Change that retains a possibility keeps it in its one
 * occurrence's `idea/` directory, beside whatever else it holds, and adds no
 * occurrence identity of its own. What other work does with an Idea is that
 * work's own to say, never written into the Idea, and nothing here makes any
 * skill depend on it.
 * Why: brain/learning/ideas/26/10/01/01/nodes/managing-ideas.md
 */

/** Where a Change occurrence keeps the Ideas it introduces. */
export const IDEA_DIR = "idea";

/** Every Change's `idea/` directory beneath the repository, in traversal order; a Change with none holds none. */
export function ideaRoots(repo = "."): string[] {
  return readChanges(path.join(repo, CHANGE_ROOT)).changes.map((change) =>
    path.join(repo, CHANGE_ROOT, change.lineage, ...change.occurrence.split("/"), IDEA_DIR),
  );
}

/** KAAL's Ideas across all its Changes, with everything that stops them being Ideas. */
export function kaalIdeas(repo = "."): { ideas: Idea[]; errors: string[] } {
  const changes = readChanges(path.join(repo, CHANGE_ROOT));
  const { ideas, errors } = readIdeas(ideaRoots(repo));
  return { ideas, errors: [...changes.errors.map((e) => `${CHANGE_ROOT}/${e}`), ...errors] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors } = kaalIdeas();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
}
