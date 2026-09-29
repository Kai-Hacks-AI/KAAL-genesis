import { pathToFileURL } from "node:url";
import { ROOT } from "../skills/using-brain/scripts/brain.js";
import { sealStateChanges, stateBrain, stateChanges, stateDir } from "./brain-seals.js";

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
    // The whole states are compared, so every path is seen as the repository names it, and seal state is picked out.
    try {
      // Both are states, and the accepted one holds BRAIN: a path that is not a state is refused, never
      // compared as empty. A candidate without BRAIN is not refused here: its seal state is then gone, which is seen.
      stateBrain(accepted);
      stateDir(candidate);
      const errors = sealStateChanges(stateChanges(accepted, candidate), ROOT);
      if (errors.length) {
        console.error(errors.join("\n"));
        process.exitCode = 1;
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
