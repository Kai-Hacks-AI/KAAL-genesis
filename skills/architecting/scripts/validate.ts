import { pathToFileURL } from "node:url";
import { readArchitecture } from "./architecture.js";

// Validates the Architecture records directly in each <dir>, together: prints one line
// per thing that is not an Architecture, including an id defined twice.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) {
    console.error("usage: validate.ts <dir>...");
    process.exitCode = 2;
  } else {
    const { errors } = readArchitecture(dirs);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  }
}
