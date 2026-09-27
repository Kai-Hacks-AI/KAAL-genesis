import { pathToFileURL } from "node:url";
import { linkErrors } from "./links.js";

// Checks the testing links of a checkout, this one by default, from its files
// alone: no Git history, no GitHub. What runs this, locally or in CI, and what
// accepts a change because of it, act on the answer; they do not define it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [repo = ".", ...rest] = process.argv.slice(2);
  if (rest.length) {
    console.error("usage: check-links.ts [repo]");
    process.exitCode = 2;
  } else {
    const errors = linkErrors(repo);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else console.log(`the testing links of ${repo} hold`);
  }
}
