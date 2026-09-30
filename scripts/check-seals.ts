import { pathToFileURL } from "node:url";
import { kaalSealErrors } from "./kaal-seals.js";

// Checks a repository, by default this one, that sealing would accept: its
// BRAIN and its Changes are valid and every sealed learning and Change is
// intact. CI passes a change's checkout as <repo>, so this code, never the
// change's, does the checking.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [repo = ".", ...rest] = process.argv.slice(2);
  if (rest.length) {
    console.error("usage: check-seals.ts [repo]");
    process.exitCode = 2;
  } else {
    const errors = kaalSealErrors(repo);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  }
}
