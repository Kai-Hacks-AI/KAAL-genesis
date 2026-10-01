import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";
import { isSealed } from "../skills/using-seals/scripts/seals.js";
import { changeChains, sealChange } from "./change-seals.js";
import type { PullRequestOrigin } from "./guard-branch.js";

/**
 * KAAL's policy for when Change Sealing runs on a pull request into a flight
 * or main: CI, not the agent, invokes it, whenever it can write the result back.
 * Where it cannot, the Changes must arrive sealed and CI refuses them unsealed. This decides which Changes are the pull request's
 * and whether CI may write the result back; what sealing means, and the bytes
 * it writes, stay with `sealChange` in change-seals.ts, which this only calls.
 * Nothing here knows of GitHub: the workflow hands the pull request's facts in
 * as arguments and the environment.
 */

/** A Change occurrence as `change:list` names it: `<lineage>/YY/MM/DD/CC`. */
const OCCURRENCE = /^[a-z0-9]+(?:-[a-z0-9]+)*\/\d{2}\/\d{2}\/\d{2}\/\d{2}$/;

/**
 * The Change occurrences that `paths`, relative to the repository, are inside,
 * sorted. Only a path beneath an occurrence counts: anything else under the
 * Change root is not a Change, and validation refuses it.
 */
export function touchedOccurrences(paths: string[]): string[] {
  const found = new Set<string>();
  for (const file of paths) {
    const parts = file.split("/");
    if (parts[0] !== CHANGE_ROOT || parts.length < 7) continue;
    const occurrence = parts.slice(1, 6).join("/");
    if (OCCURRENCE.test(occurrence)) found.add(occurrence);
  }
  return [...found].sort();
}

/**
 * The Changes that belong to the change at `repo`'s HEAD: every occurrence it
 * touches compared with `base`, as the seal guard compares (`base...HEAD`), so
 * what `base` gained since the change branched is never the change's own. Only
 * those still present and not yet sealed are returned: a sealed Change needs
 * no sealing, and whether it is intact is for the existing checks. A Change the
 * change did not touch is never returned, however unsealed it is.
 */
export function unsealedOccurrences(base: string, repo = "."): string[] {
  const diff = execFileSync(
    "git",
    ["-C", repo, "diff", "--name-only", "-z", "--no-renames", `${base}...HEAD`, "--", CHANGE_ROOT],
    { encoding: "utf8" },
  );
  const units = new Set([...changeChains(repo).values()].flat());
  return touchedOccurrences(diff.split("\0").filter(Boolean)).filter((occurrence) => {
    const unit = `${CHANGE_ROOT}/${occurrence}`;
    return units.has(unit) && !isSealed(repo, unit);
  });
}

/**
 * Where a pull request is admitted to KAAL, or undefined where Change Sealing
 * does not apply. Changes enter a KAAL lineage at a `kaal/*` flight branch,
 * normally from an agent's `claude/*` branch, and reach the default branch
 * from the flight: both are admissions, and both need their Changes sealed.
 * Any other base is not an admission.
 */
export function admission(baseRef: string, defaultBranch: string): "main" | "flight" | undefined {
  if (baseRef === defaultBranch) return "main";
  return baseRef.startsWith("kaal/") ? "flight" : undefined;
}

/** Branches of this repository CI may write seal state back to: an agent's `claude/*` and a flight's `kaal/*`. */
const WRITEBACK = ["claude/", "kaal/"];

/**
 * Why CI may not write seal state back to the pull request's branch, or
 * undefined where it may: only to a `claude/*` or `kaal/*` branch of this
 * repository, never the default branch, a fork or any other branch. Where it
 * may not, the Changes must arrive sealed (npm run seal:change); that is the
 * whole of the refusal, never a weaker check.
 */
export function writebackRefusal(origin: PullRequestOrigin): string | undefined {
  if (origin.headRepo === origin.thisRepo && WRITEBACK.some((prefix) => origin.headRef.startsWith(prefix))) {
    return undefined;
  }
  return `CI writes seal state only to a claude/* or kaal/* branch of ${origin.thisRepo}; this pull request comes from ${origin.headRepo}:${origin.headRef}, so its Changes must arrive sealed (npm run seal:change).`;
}

export type Outcome = { status: "hold"; reason: string } | { status: "sealed"; units: string[]; occurrences: string[] };

/**
 * Change Sealing for the pull request at `repo`'s HEAD, invoked by CI. A draft
 * is investigatory: nothing is read or written, so incomplete Changes stay
 * exactly as they are until the pull request is ready, and a draft is never
 * reported as sealed. Otherwise exactly the pull request's unsealed Changes are
 * handed to the existing `sealChange`, which refuses, writing nothing, on an
 * invalid Change, a broken seal, or a Change that would drag an unrelated one
 * in. Refuses before sealing anything where CI could not write the result back,
 * and never reports success while a Change it touches is unsealed.
 */
export function sealPullRequest(options: {
  base: string;
  repo?: string;
  draft: boolean;
  origin: PullRequestOrigin;
}): Outcome {
  const { base, repo = ".", draft, origin } = options;
  if (draft) return { status: "hold", reason: "draft: investigatory, Change Sealing runs when it is ready for review" };
  const occurrences = unsealedOccurrences(base, repo);
  if (!occurrences.length) return { status: "sealed", units: [], occurrences };
  const refused = writebackRefusal(origin);
  if (refused) throw new Error(refused);
  const units = sealChange(repo, ...occurrences);
  const left = unsealedOccurrences(base, repo);
  if (left.length) throw new Error(`still unsealed: ${left.join(", ")}`);
  return { status: "sealed", units, occurrences };
}

/**
 * How the gate judges the change at `repo`'s HEAD. For a ready pull request into
 * a flight or main, a Change it touches and has not sealed is refused; a draft's
 * is held, never refused and never passed, and a held status stays pending. A
 * pull request against a base that is no admission is not judged and is always
 * held: what it touches, and whether a seal in it is valid, depend on the base, so
 * no verdict about it could be kept from becoming wrong if it were retargeted.
 * Success is therefore published only for an admitted base where every Change the
 * pull request touches is sealed, however its draft state changes. This is the
 * requirement; CI's sealing is how it is met where it can write.
 */
export function gateOutcome(options: { base: string; repo?: string; draft: boolean; admitted: boolean }): {
  outcome: "pass" | "hold" | "refuse";
  errors: string[];
} {
  const { base, repo, draft, admitted } = options;
  if (!admitted) return { outcome: "hold", errors: [] };
  const errors = unsealedOccurrences(base, repo).map(
    (occurrence) =>
      `${CHANGE_ROOT}/${occurrence}: Change is not sealed (CI seals it where it can write; otherwise npm run seal:change)`,
  );
  if (!errors.length) return { outcome: "pass", errors };
  return { outcome: draft ? "hold" : "refuse", errors };
}

// `seal <base> [repo]` seals the pull request's Changes; `admission` names
// where its base admits it; `gate` refuses a ready, admitted pull request with an unsealed Change and holds a draft's and any outside an admission. The pull request reaches it as environment variables, never
// as arguments or script text, so a branch name cannot inject anything.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { HEAD_REF = "", HEAD_REPO = "", AUTHOR = "", THIS_REPO = "", DRAFT = "" } = process.env;
  const [command, base, repo] = process.argv.slice(2);
  const draft = DRAFT === "true";
  if (command === "admission") {
    const { BASE_REF = "", DEFAULT_BRANCH = "" } = process.env;
    console.log(admission(BASE_REF, DEFAULT_BRANCH) ?? "none");
  } else if (command === "gate" && base) {
    const { BASE_REF = "", DEFAULT_BRANCH = "" } = process.env;
    const { outcome, errors } = gateOutcome({
      base,
      repo,
      draft,
      admitted: admission(BASE_REF, DEFAULT_BRANCH) !== undefined,
    });
    if (outcome === "hold") console.log("hold");
    if (outcome === "refuse") {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  } else if (command === "seal" && base) {
    try {
      const outcome = sealPullRequest({
        base,
        repo,
        draft,
        origin: { headRef: HEAD_REF, headRepo: HEAD_REPO, author: AUTHOR, thisRepo: THIS_REPO },
      });
      if (outcome.status === "hold") console.log(outcome.reason);
      else for (const unit of outcome.units) console.log(`sealed ${unit}`);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  } else {
    console.error("usage: pull-request-sealing.ts seal <base> [repo] | admission | gate <base> [repo]");
    process.exitCode = 2;
  }
}
