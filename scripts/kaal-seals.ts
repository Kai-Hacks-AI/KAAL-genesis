import path from "node:path";
import { ROOT as BRAIN_ROOT } from "../skills/using-brain/scripts/brain.js";
import { brainErrors, entries, sealBrain, sealingOutputErrors, sealState, sealStateChanges } from "./brain-seals.js";
import {
  changeErrors,
  changeSealingOutputErrors,
  changeSealState,
  changeSealStateChanges,
  sealChanges,
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

/**
 * One error per seal-state path, of BRAIN or of Changes, that a change touches,
 * except a path `accepted` says already holds, in the change, exactly the state
 * accepted on main: that is main's own seal state, incorporated unchanged, not
 * written by the change. `accepted` is asked only about seal-state paths.
 * `changeSealing`, where given, judges the seal state of Changes that remains
 * (see changeSealingAuthorityErrors); BRAIN seal state is never its concern.
 */
export function kaalSealStateChanges(
  nameStatus: string,
  accepted: (file: string) => boolean = () => false,
  changeSealing?: (touched: string) => string[],
): string[] {
  const touched = entries(nameStatus)
    .filter(({ file }) => !((sealState(file) || changeSealState(file)) && accepted(file)))
    .map(({ status, file }) => `${status}\t${file}`)
    .join("\n");
  return [...sealStateChanges(touched), ...(changeSealing ?? changeSealStateChanges)(touched)];
}

/** One error per staged entry that sealing, of BRAIN or of Changes, could not have produced. */
export function kaalSealingOutputErrors(nameStatus: string): string[] {
  return entries(nameStatus).flatMap(({ status, file }) => {
    const line = `${status}\t${file}`;
    return sealState(file) !== undefined ? sealingOutputErrors(line) : changeSealingOutputErrors(line);
  });
}
