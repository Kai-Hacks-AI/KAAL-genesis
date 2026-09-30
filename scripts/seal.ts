import { pathToFileURL } from "node:url";
import { sealKaal } from "./kaal-seals.js";

// Run by sealing on main: closes every BRAIN learning and every Change not yet sealed.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    for (const unit of sealKaal()) console.log(`sealed ${unit}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
