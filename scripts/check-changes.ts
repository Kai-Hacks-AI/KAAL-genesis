import { pathToFileURL } from "node:url";
import { changeErrors, changes } from "./change.js";

// Checks the Change tree <dir> from its files alone: every lineage and
// occurrence is well formed, and nothing else stands where they do. Lists each
// occurrence by its identity, in the tree's one order. What an occurrence
// holds is not read.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error("usage: check-changes.ts <dir>");
    process.exitCode = 2;
  } else {
    const [dir] = args as [string];
    const errors = changeErrors(dir);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else for (const id of changes(dir)) console.log(id);
  }
}
