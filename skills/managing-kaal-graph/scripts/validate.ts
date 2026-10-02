import { pathToFileURL } from "node:url";
import { readNodes } from "./graph.js";

// Checks the Nodes directly in <dir>: prints one line per thing that is not a Node.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, ...rest] = process.argv.slice(2);
  if (!dir || rest.length) {
    console.error("usage: validate.ts <dir>");
    process.exitCode = 2;
  } else {
    const { errors } = readNodes(dir);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  }
}
