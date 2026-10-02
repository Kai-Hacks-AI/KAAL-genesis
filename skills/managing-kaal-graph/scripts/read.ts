import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { readNodes, referrersOf } from "./graph.js";

// Prints each named Node, or every name when none is named, with the References
// it states. With --to <target>, prints who refers to that target and by
// what relation, derived now from the referrers. Fails on a name naming no Node.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { to: { type: "string" } } });
  const [dir, ...names] = positionals;
  if (!dir) {
    console.error("usage: read.ts <dir> [name]... | read.ts <dir> --to <target>");
    process.exitCode = 2;
  } else {
    const { nodes, errors } = readNodes(dir);
    const missing = names.filter((name) => !nodes.some((n) => n.name === name)).map((name) => `${name}: no such Node`);
    if (errors.length || missing.length) {
      console.error([...errors, ...missing].join("\n"));
      process.exitCode = 1;
    } else if (values.to !== undefined) {
      for (const { referrer, relation } of referrersOf(nodes, values.to)) console.log(`${referrer} ${relation}`);
    } else if (!names.length) {
      for (const { name } of nodes) console.log(name);
    } else {
      for (const name of names) {
        const n = nodes.find((x) => x.name === name)!;
        const refs = n.references.map((r) => `${r.relation} -> ${r.target}\n`).join("");
        console.log(`${n.name}: ${n.type}\n\n${n.meaning}\n\n${refs}`);
      }
    }
  }
}
