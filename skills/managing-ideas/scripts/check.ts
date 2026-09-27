import { pathToFileURL } from "node:url";
import { ideaErrors, readIdeas } from "./ideas.js";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, ...rest] = process.argv.slice(2);
  if (!dir || rest.length) {
    console.error("usage: check.ts <dir>");
    process.exitCode = 2;
  } else {
    const errors = ideaErrors(dir);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else {
      for (const idea of readIdeas(dir)) console.log(`${idea.name}: ${idea.idea}`);
    }
  }
}
