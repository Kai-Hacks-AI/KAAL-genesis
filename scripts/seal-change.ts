import { pathToFileURL } from "node:url";
import { sealChange } from "./change-seals.js";

// Change Sealing: seals the named Change occurrences (<lineage>/YY/MM/DD/CC)
// in this checkout, before their evolution reaches main. Writes the same seal
// state as sealing on main; commit it as it is.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const occurrences = process.argv.slice(2);
  if (!occurrences.length) {
    console.error("usage: seal-change.ts <lineage/YY/MM/DD/CC>...");
    process.exitCode = 2;
  } else {
    try {
      for (const unit of sealChange(".", ...occurrences)) console.log(`sealed ${unit}`);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
