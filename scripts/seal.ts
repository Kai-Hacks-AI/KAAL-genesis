import { pathToFileURL } from "node:url";
import { brainRoot, sealBrain } from "./brain-seals.js";

// Seals the accepted state, <state> (by default this one), a plain directory:
// closes every BRAIN learning of it not yet sealed. When it runs, such as
// after each acceptance, is arranged outside KAAL.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [state = ".", ...rest] = process.argv.slice(2);
  if (rest.length) {
    console.error("usage: seal.ts [state]");
    process.exitCode = 2;
  } else {
    try {
      for (const learning of sealBrain(brainRoot(state))) console.log(`sealed ${learning}`);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
