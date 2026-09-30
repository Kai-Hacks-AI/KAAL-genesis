import path from "node:path";
import { pathToFileURL } from "node:url";
import { readChanges, ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";
import { readGraph, type Graph } from "../skills/testing/scripts/graph.js";
import { kaalDefects } from "./defects.js";
import { kaalRequirements } from "./requirements.js";

/**
 * KAAL's composition of Changes, Testing, Requirements and Defects.
 * managing-change owns the occurrence and never interprets what is beneath
 * it; testing interprets Plans, Suites and Cases and knows a Requirement or a
 * Defect only as an id a Case names; managing-requirements and
 * managing-defects interpret theirs. This decides how they meet: a Change
 * keeps its Suites and Plans beneath its occurrence's `test/`, and a Case born
 * there may test any Requirement or Defect KAAL already holds, in any Change.
 * Testing is told which ids exist by reading them where they are born, so no
 * Requirement, Defect or Plan is ever written to when a Suite or a Case is
 * born, and no list of the graph is kept.
 */

/** Where a Change occurrence keeps its Suites and Plans. */
export const TEST_DIR = "test";

/** Every Change's `test/` directory beneath the repository, as a place from the repository root, in traversal order. */
export function testScopes(repo = "."): string[] {
  return readChanges(path.join(repo, CHANGE_ROOT)).changes.map((change) =>
    [CHANGE_ROOT, change.lineage, change.occurrence, TEST_DIR].join("/"),
  );
}

/**
 * KAAL's Testing graph across all its Changes, read from the repository root
 * as Testing's root, with everything that stops the edges being edges: the
 * Requirements and Defects Cases name are the ones KAAL holds, and a Requirement
 * or Defect that is itself broken is named with them.
 */
export function kaalTestingGraph(repo = "."): { graph: Graph; errors: string[] } {
  const { requirements, errors: requirementErrors } = kaalRequirements(repo);
  const { defects, errors: defectErrors } = kaalDefects(repo);
  const { graph, errors } = readGraph(repo, testScopes(repo), {
    requirements: requirements.map((r) => r.id),
    defects: defects.map((d) => d.id),
  });
  return { graph, errors: [...requirementErrors, ...defectErrors, ...errors] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors } = kaalTestingGraph();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
}
