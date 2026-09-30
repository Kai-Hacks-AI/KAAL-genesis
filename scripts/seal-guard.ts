import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";
import { ROOT } from "../skills/using-brain/scripts/brain.js";
import { HEADS_FILE, LOCK_FILE } from "../skills/using-seals/scripts/seals.js";
import { kaalGuardErrors } from "./kaal-seals.js";

// Refuses a change that touches seal state compared with <base>, or rewrites
// a Change <base> already holds. <repo> is the change's checkout, by default
// this one; CI passes the change's checkout so this code, never the change's,
// does the guarding.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, repo = "."] = process.argv.slice(2);
  if (!base) {
    console.error("usage: seal-guard.ts <base> [repo]");
    process.exitCode = 2;
  } else {
    const diff = execFileSync(
      "git",
      [
        "-C",
        repo,
        "diff",
        "--name-status",
        "--no-renames",
        `${base}...HEAD`,
        "--",
        ROOT,
        CHANGE_ROOT,
        HEADS_FILE,
        LOCK_FILE,
      ],
      { encoding: "utf8" },
    );
    const target = execFileSync("git", ["-C", repo, "ls-tree", "-r", "--name-only", base, "--", CHANGE_ROOT], {
      encoding: "utf8",
    });
    const errors = kaalGuardErrors(diff, target.split(/\r?\n/).filter(Boolean));
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  }
}
