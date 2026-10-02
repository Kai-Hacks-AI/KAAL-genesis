import { pathToFileURL } from "node:url";
import { readRequirements } from "./requirements.js";

// Collects the Requirements directly in each <dir>, together: prints them as a
// JSON array, or, when anything in a <dir> claims to be a Requirement and is
// not, prints why and nothing else. Local: it never descends into a directory.
// A caller supplies the scope and learns nothing of how Requirements are kept.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) {
    console.error("usage: collect.ts <dir>...");
    process.exitCode = 2;
  } else {
    const { requirements, errors } = readRequirements(dirs);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else console.log(JSON.stringify(requirements, null, 2));
  }
}
