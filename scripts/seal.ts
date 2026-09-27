import { pathToFileURL } from "node:url";
import { sealBrain } from "./brain-seals.js";

// Seals the accepted state: closes every BRAIN learning not yet sealed. When
// it runs, such as after each acceptance, is arranged outside KAAL.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    for (const learning of sealBrain()) console.log(`sealed ${learning}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
