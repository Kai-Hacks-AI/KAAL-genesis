import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../skills/using-brain/scripts/brain.js";
import { sealStateChanges, stateChanges } from "./brain-seals.js";

// Refuses a candidate, the KAAL state at <candidate> (by default this one),
// that adds, changes or removes seal state compared with <accepted>, the
// accepted state it would succeed. Both are plain directories: what selects
// them, such as a checkout of a pull request, is not KAAL's concern. CI runs
// this from the accepted side, so this code, never the candidate's, guards.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [accepted, candidate = ".", ...rest] = process.argv.slice(2);
  if (!accepted || rest.length) {
    console.error("usage: seal-guard.ts <accepted> [candidate]");
    process.exitCode = 2;
  } else {
    const changes = stateChanges(path.join(accepted, ROOT), path.join(candidate, ROOT)).map((c) => ({
      ...c,
      file: `${ROOT}/${c.file}`,
    }));
    const errors = sealStateChanges(changes);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  }
}
