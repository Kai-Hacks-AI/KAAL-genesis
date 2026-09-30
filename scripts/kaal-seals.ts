import path from "node:path";
import { ROOT as BRAIN_ROOT } from "../skills/using-brain/scripts/brain.js";
import {
  brainErrors,
  type Entry,
  entries,
  sealBrain,
  sealingOutputErrors,
  sealState,
  sealStateChanges,
} from "./brain-seals.js";
import {
  changeErrors,
  changeNonFiles,
  changeRewrites,
  changeSealingOutputErrors,
  changeSealStateChanges,
  sealChanges,
  type TreeEntry,
} from "./change-seals.js";

/**
 * KAAL's sealed history: its BRAIN learnings and its Changes, each under its
 * own policy and its own seal root. What the entry points and CI run.
 */

/** Everything that stops the repository at `repo` from being sealed. */
export function kaalSealErrors(repo = "."): string[] {
  return [...brainErrors(path.join(repo, BRAIN_ROOT)), ...changeErrors(repo)];
}

/**
 * Seals every learning and every Change not yet sealed. Both are checked
 * before either is sealed, so a history that cannot be sealed stops sealing
 * before anything is written.
 */
export function sealKaal(repo = "."): string[] {
  const errors = kaalSealErrors(repo);
  if (errors.length) throw new Error(`refusing to seal:\n${errors.join("\n")}`);
  return [...sealBrain(path.join(repo, BRAIN_ROOT)).map((unit) => `${BRAIN_ROOT}/${unit}`), ...sealChanges(repo)];
}

/** One error per seal-state path, of BRAIN or of Changes, that a change touches. */
export function kaalSealStateChanges(nameStatus: string | Entry[]): string[] {
  return [...sealStateChanges(nameStatus), ...changeSealStateChanges(nameStatus)];
}

/**
 * Everything the guard refuses in a candidate, given every file its target
 * holds and the candidate's own Change tree: seal state written, any Change
 * already born on the target rewritten, and anything in a Change that Git
 * holds but a checkout would not present as a file.
 */
export function kaalGuardErrors(nameStatus: string | Entry[], target: string[], candidate: TreeEntry[] = []): string[] {
  return [...kaalSealStateChanges(nameStatus), ...changeRewrites(nameStatus, target), ...changeNonFiles(candidate)];
}

/** One error per staged entry that sealing, of BRAIN or of Changes, could not have produced. */
export function kaalSealingOutputErrors(nameStatus: string): string[] {
  return entries(nameStatus).flatMap(({ status, file }) => {
    const line = `${status}\t${file}`;
    return sealState(file) !== undefined ? sealingOutputErrors(line) : changeSealingOutputErrors(line);
  });
}
