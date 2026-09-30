import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { kaalSealingOutputErrors } from "./kaal-seals.js";

// Refuses a staged commit unless everything in it is what sealing on main
// produces. <repo> is the checkout, by default this one.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [repo = ".", ...rest] = process.argv.slice(2);
  if (rest.length) {
    console.error("usage: sealing-check.ts [repo]");
    process.exitCode = 2;
  } else {
    const staged = execFileSync("git", ["-C", repo, "diff", "--cached", "--name-status", "--no-renames"], {
      encoding: "utf8",
    });
    const errors = kaalSealingOutputErrors(staged);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  }
}
