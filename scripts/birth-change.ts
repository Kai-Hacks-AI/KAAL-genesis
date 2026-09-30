import { pathToFileURL } from "node:url";
import { birthChange } from "./change.js";

// Births the next Change occurrence of <lineage> in the Change tree <dir> and
// prints its identity, <lineage>/<occurrence>. It creates the occurrence's
// directory and nothing inside it: what the Change owns is placed there by
// whatever produces it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error("usage: birth-change.ts <dir> <lineage>");
    process.exitCode = 2;
  } else {
    const [dir, lineage] = args as [string, string];
    try {
      console.log(birthChange(dir, lineage));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
