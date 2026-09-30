import { pathToFileURL } from "node:url";
import { identity, readChanges, ROOT } from "./changes.js";

// Lists every Change beneath [root], one identity per line: lineages by name,
// each lineage's Changes oldest first. Lists nothing from a root that is not
// valid, so a listed identity is always a Change.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root = ROOT, ...rest] = process.argv.slice(2);
  if (rest.length) {
    console.error("usage: list.ts [root]");
    process.exitCode = 2;
  } else {
    const { changes, errors } = readChanges(root);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else {
      for (const change of changes) console.log(identity(change));
    }
  }
}
