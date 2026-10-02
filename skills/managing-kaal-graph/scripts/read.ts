import { pathToFileURL } from "node:url";
import { readNodes } from "./graph.js";

// Prints each named Node, or every name when none is named. Fails on a name naming no Node.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, ...names] = process.argv.slice(2);
  if (!dir) {
    console.error("usage: read.ts <dir> [name]...");
    process.exitCode = 2;
  } else {
    const { nodes, errors } = readNodes(dir);
    const missing = names.filter((name) => !nodes.some((n) => n.name === name)).map((name) => `${name}: no such Node`);
    if (errors.length || missing.length) {
      console.error([...errors, ...missing].join("\n"));
      process.exitCode = 1;
    } else if (!names.length) {
      for (const { name } of nodes) console.log(name);
    } else {
      for (const name of names) {
        const n = nodes.find((x) => x.name === name)!;
        console.log(`${n.name}: ${n.type}\n\n${n.meaning}\n`);
      }
    }
  }
}
