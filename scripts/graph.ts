import { pathToFileURL } from "node:url";
import { readNodes, type Node } from "../skills/managing-kaal-graph/scripts/graph.js";

/**
 * KAAL's graph: the Nodes in the scope `graph/`. managing-kaal-graph reads a
 * scope and knows no other; this says which scope is KAAL's own. It is a
 * birth-test: only Node and Reference are born, nothing existing is
 * retrofitted into it, and nothing is registered anywhere.
 * Why: brain/learning/graph/26/10/02/01/nodes/managing-kaal-graph.md
 */
export const GRAPH_DIR = "graph";

/** KAAL's Nodes, with everything in `graph/` that stops them being Nodes. */
export function kaalGraph(repo = "."): { nodes: Node[]; errors: string[] } {
  return readNodes(`${repo}/${GRAPH_DIR}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors } = kaalGraph();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
}
