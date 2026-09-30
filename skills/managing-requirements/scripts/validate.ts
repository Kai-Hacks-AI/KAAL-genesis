import { pathToFileURL } from "node:url";
import { readRequirements } from "./requirements.js";

// Validates the Requirements directly in each <dir>, together: prints one line
// per thing that is not a Requirement, including an id defined twice.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) {
    console.error("usage: validate.ts <dir>...");
    process.exitCode = 2;
  } else {
    const { errors } = readRequirements(dirs);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  }
}
