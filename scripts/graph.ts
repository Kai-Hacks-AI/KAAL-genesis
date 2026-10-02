import { pathToFileURL } from "node:url";
import { type Node, readNodes } from "../skills/managing-kaal-graph/scripts/graph.js";

/**
 * KAAL's graph: the Nodes in the scope `graph/`. managing-kaal-graph reads a
 * scope and knows no other, and asks no type or relation to resolve. This says
 * which scope is KAAL's own and holds it to closure: every type and every
 * relation stated in it names a Definition Node in it, and the Node named
 * `definition` is of type `definition`, so nothing in the scope is described
 * by anything outside it. It is a birth-test, proving the Skill on this branch:
 * nothing existing is retrofitted, nothing is registered, and whether any of
 * this belongs in a kaal-core is not decided by it.
 * Why: brain/learning/graph/26/10/02/01/nodes/managing-kaal-graph.md
 */
export const GRAPH_DIR = "graph";

/** The Definition Node: its own type, so the scope has no typeless root. */
export const DEFINITION = "definition";

/** Why a scope is not closed: a type or relation naming no Definition, or no self-defining Definition. */
export function closureErrors(nodes: Node[]): string[] {
  const definitions = new Set(nodes.filter((n) => n.type === DEFINITION).map((n) => n.id));
  const errors: string[] = [];
  const root = nodes.find((n) => n.id === DEFINITION);
  if (!root) errors.push(`${DEFINITION}: the scope has no Definition Node`);
  else if (root.type !== DEFINITION) errors.push(`${DEFINITION}: must be of type ${DEFINITION}`);
  for (const n of nodes) {
    if (!definitions.has(n.type)) errors.push(`${n.id}: type "${n.type}" names no Definition`);
    for (const { relation } of n.references) {
      if (!definitions.has(relation)) errors.push(`${n.id}: relation "${relation}" names no Definition`);
    }
  }
  return errors;
}

/** KAAL's Nodes, with everything in `graph/` that stops them being Nodes or leaves the scope open. */
export function kaalGraph(repo = "."): { nodes: Node[]; errors: string[] } {
  const { nodes, errors } = readNodes(`${repo}/${GRAPH_DIR}`);
  return { nodes, errors: [...errors, ...closureErrors(nodes)] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors } = kaalGraph();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
}
