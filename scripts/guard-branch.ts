import { pathToFileURL } from "node:url";

export interface PullRequestOrigin {
  /** Branch the pull request comes from. */
  headRef: string;
  /** `owner/name` of the repository that branch lives in. */
  headRepo: string;
  /** Login of the pull request's author. */
  author: string;
  /** `owner/name` of the repository the pull request targets. */
  thisRepo: string;
}

/**
 * Why a pull request into `main` is refused, or undefined where it is allowed:
 * it must come from a `kaal/*` branch of this repository, which includes
 * `kaal/hotfix/*`, the path for repairing accepted evidence, or from Dependabot.
 * Anything else, such as an unnamed agent branch or a fork, is refused.
 */
export function guardBranchError({ headRef, headRepo, author, thisRepo }: PullRequestOrigin): string | undefined {
  const local = headRepo === thisRepo;
  if (local && author === "dependabot[bot]" && headRef.startsWith("dependabot/")) return undefined;
  if (local && headRef.startsWith("kaal/")) return undefined;
  return `Pull requests into main must come from a kaal/* branch of ${thisRepo} or from Dependabot; this one comes from ${headRepo}:${headRef}.`;
}

// Reads the pull request from the environment, never from arguments or script
// text, so a branch name cannot inject anything.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { HEAD_REF = "", HEAD_REPO = "", AUTHOR = "", THIS_REPO = "" } = process.env;
  const error = guardBranchError({ headRef: HEAD_REF, headRepo: HEAD_REPO, author: AUTHOR, thisRepo: THIS_REPO });
  if (error) {
    console.error(`::error::${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Branch ${HEAD_REF} is allowed into main.`);
  }
}
