import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { readNodes, referrersOf } from "./graph.js";

// Prints each named Node, or every id when none is named, with the References
// it states. With --to <target>, prints who refers to that target and by
// what relation, derived now from the referrers. Fails on an id naming no Node.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { to: { type: "string" } } });
  const [dir, ...ids] = positionals;
  if (!dir) {
    console.error("usage: read.ts <dir> [id]... | read.ts <dir> --to <target>");
    process.exitCode = 2;
  } else {
    const { nodes, errors } = readNodes(dir);
    const missing = ids.filter((id) => !nodes.some((n) => n.id === id)).map((id) => `${id}: no such Node`);
    if (errors.length || missing.length) {
      console.error([...errors, ...missing].join("\n"));
      process.exitCode = 1;
    } else if (values.to !== undefined) {
      for (const { referrer, relation } of referrersOf(nodes, values.to)) console.log(`${referrer} ${relation}`);
    } else if (!ids.length) {
      for (const { id } of nodes) console.log(id);
    } else {
      for (const id of ids) {
        const n = nodes.find((x) => x.id === id)!;
        const refs = n.references.map((r) => `${r.relation} -> ${r.target}\n`).join("");
        console.log(`${n.id}: ${n.type}\n\n${n.meaning}\n\n${refs}`);
      }
    }
  }
}
