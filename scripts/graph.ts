import { pathToFileURL } from "node:url";
import { type Node, readNodes } from "../skills/managing-kaal-graph/scripts/graph.js";

/**
 * KAAL's graph: the Nodes in the scope `graph/`. managing-kaal-graph reads a
 * scope and knows no other, and asks no type to resolve. This says which scope
 * is KAAL's own and holds it to the one thing it has so far: it begins with
 * the Node named `KAAL Kernel`, whose body is the whole contract for reading
 * the Nodes after it, and every Node is of the type `Definition` that body
 * defines. Nothing else is asserted: the Kernel defines no Reference, scope,
 * supersession or resolution, and the Nodes after it need none. It is a
 * birth-test proving the Skill on this branch: nothing existing is
 * retrofitted, nothing is registered, and whether any of this belongs in
 * kaal-core is not decided by it.
 * Why: brain/learning/graph/26/10/02/01/nodes/managing-kaal-graph.md
 */
export const GRAPH_DIR = "graph";

/** The first Node: its body defines the type every Node of this graph has. */
export const KERNEL = "KAAL Kernel";

/** The one type the Kernel defines. */
export const DEFINITION = "Definition";

/** Why a scope is not what the Kernel can read: no Kernel, a Kernel that is not a Definition, or a Node of a type it does not define. */
export function kernelErrors(nodes: Node[]): string[] {
  const errors: string[] = [];
  const kernel = nodes.find((n) => n.name === KERNEL);
  if (!kernel) errors.push(`${KERNEL}: the scope has no KAAL Kernel`);
  else if (kernel.type !== DEFINITION) errors.push(`${KERNEL}: must be of type ${DEFINITION}`);
  for (const n of nodes) {
    if (n.type !== DEFINITION) errors.push(`${n.name}: type "${n.type}" is not defined by ${KERNEL}`);
  }
  return errors;
}

/** KAAL's Nodes, with everything in `graph/` that stops them being Nodes or the Kernel from reading them. */
export function kaalGraph(repo = "."): { nodes: Node[]; errors: string[] } {
  const { nodes, errors } = readNodes(`${repo}/${GRAPH_DIR}`);
  return { nodes, errors: [...errors, ...kernelErrors(nodes)] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors } = kaalGraph();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
}
