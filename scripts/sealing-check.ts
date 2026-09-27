import { pathToFileURL } from "node:url";
import { sealingOutputErrors, stateChanges } from "./brain-seals.js";

// Refuses what sealing left unless all of it is what sealing the accepted
// state writes: compares <before>, a copy of the state before sealing, with
// <after>, the state sealing left (by default this one). Both are plain
// directories; nothing else is consulted.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [before, after = ".", ...rest] = process.argv.slice(2);
  if (!before || rest.length) {
    console.error("usage: sealing-check.ts <before> [after]");
    process.exitCode = 2;
  } else {
    const errors = sealingOutputErrors(stateChanges(before, after));
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  }
}
