import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";
import { ROOT } from "../skills/using-brain/scripts/brain.js";
import { HEADS_FILE, LOCK_FILE } from "../skills/using-seals/scripts/seals.js";
import { kaalSealStateChanges } from "./kaal-seals.js";

/** `<mode> <type> <object id>` of `file` at `rev`, or undefined where `rev` has no such path. */
function stateAt(repo: string, rev: string, file: string): string | undefined {
  const line = execFileSync("git", ["-C", repo, "ls-tree", rev, "--", file], { encoding: "utf8" }).trim();
  return line ? line.split("\t")[0] : undefined;
}

/**
 * One error per seal-state path the change at `repo`'s HEAD touches compared
 * with `base`. `accepted` is a ref to accepted main, which the change cannot
 * move: a touched path whose state in the change is exactly its state there,
 * present or absent, is main's own seal state coming into an older lineage and
 * is not an error. Without `accepted` every touch is refused. An `accepted`
 * that does not resolve throws, so a missing reference refuses rather than allows.
 */
export function sealGuardErrors(base: string, repo = ".", accepted?: string): string[] {
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
  if (accepted === undefined) return kaalSealStateChanges(diff);
  const main = execFileSync("git", ["-C", repo, "rev-parse", "--verify", "--quiet", `${accepted}^{commit}`], {
    encoding: "utf8",
  }).trim();
  return kaalSealStateChanges(diff, (file) => stateAt(repo, "HEAD", file) === stateAt(repo, main, file));
}

// Refuses a change that touches seal state compared with <base>, unless that
// state is exactly what <accepted>, a ref to accepted main, already holds.
// <repo> is the change's checkout, by default this one; CI passes the change's
// checkout so this code, never the change's, does the guarding.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, repo = ".", accepted] = process.argv.slice(2);
  if (!base) {
    console.error("usage: seal-guard.ts <base> [repo] [accepted]");
    process.exitCode = 2;
  } else {
    const errors = sealGuardErrors(base, repo, accepted);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  }
}
