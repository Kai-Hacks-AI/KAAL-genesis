import { pathToFileURL } from "node:url";
import { sealBrain, stateBrain } from "./brain-seals.js";

// Seals the accepted state, <state> (by default the current directory), a
// plain directory: closes every BRAIN learning of it not yet sealed. Where
// BRAIN lives in a state is KAAL's, never the caller's. What the accepted
// state is, and when this runs, such as after each acceptance, is arranged
// outside KAAL.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [state = ".", ...rest] = process.argv.slice(2);
    if (rest.length) {
      console.error("usage: seal.ts [state]");
      process.exit(2);
    }
    for (const learning of sealBrain(stateBrain(state))) console.log(`sealed ${learning}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
