import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { regressionErrors } from "./regression.js";

// Judges a candidate, the checkout at <candidate>, by KAAL's trusted
// regression: this checkout, by default this one, as `main`. The regression
// is named by this checkout's commit, never inferred from Git's ancestry. CI
// runs this from main, so main's cases, links and runner do the judging.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [candidate, trusted = ".", ...rest] = process.argv.slice(2);
  if (!candidate || rest.length) {
    console.error("usage: check-regression.ts <candidate> [trusted]");
    process.exitCode = 2;
  } else {
    const base = execFileSync("git", ["-C", trusted, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const errors = regressionErrors(trusted, candidate, base);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else console.log(`main at ${base} holds against ${candidate}`);
  }
}
