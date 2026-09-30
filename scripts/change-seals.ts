import path from "node:path";
import { identity, readChanges, ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";
import { validate } from "../skills/managing-change/scripts/validate.js";
import {
  checkChain,
  HEADS_FILE,
  type Head,
  isSealed,
  LOCK_FILE,
  readHeads,
  SEAL_FILE,
  sealChains,
} from "../skills/using-seals/scripts/seals.js";
import { entries, type SealState } from "./brain-seals.js";
import fs from "node:fs";
import os from "node:os";

/**
 * KAAL's sealing policy for Changes. managing-change births and validates
 * Changes and knows nothing of seals; using-seals seals and checks units and
 * knows nothing of Changes. This decides how they meet: one chain per Change
 * lineage, named after the lineage, with one unit per Change, in
 * managing-change's traversal order. A Change is closed when it is sealed.
 *
 * The seal root is the repository, not the Change root: managing-change owns
 * its root and refuses anything there that is not a Change, while using-seals
 * keeps its chain heads at the root it seals. So the heads are `seals.json` at
 * the repository's top, each unit is `change/<lineage>/YY/MM/DD/CC`, and each
 * unit's seal is the `seal.json` using-seals writes inside it.
 *
 * The chain's order is the order sealed history is appended in, nothing more:
 * sealed units must begin a chain, so a Change born into a lineage with sealed
 * history is sealable only if its identity sorts after that history. It is not
 * the order Changes compose in, which no Change or seal knows.
 */

/** Every Change lineage's Changes as units beneath the repository, in traversal order: `change/<lineage>/YY/MM/DD/CC`. */
export function changeChains(repo = "."): Map<string, string[]> {
  const chains = new Map<string, string[]>();
  for (const change of readChanges(path.join(repo, CHANGE_ROOT)).changes) {
    const units = chains.get(change.lineage) ?? [];
    units.push(`${CHANGE_ROOT}/${identity(change)}`);
    chains.set(change.lineage, units);
  }
  return chains;
}

/**
 * Every broken seal over KAAL's Changes, lineage by lineage: every lineage
 * there is, and every chain recorded in the heads even if its lineage is gone,
 * so removing a whole lineage is noticed.
 */
export function checkChanges(repo = "."): string[] {
  let chains: Map<string, string[]>;
  try {
    chains = changeChains(repo);
    for (const chain of readHeads(repo).keys()) if (!chains.has(chain)) chains.set(chain, []);
  } catch (e) {
    return [`${HEADS_FILE}: unreadable chain heads (${e instanceof Error ? e.message : String(e)})`];
  }
  return [...chains].flatMap(([lineage, units]) => checkChain(repo, lineage, units));
}

/** Everything that stops KAAL's Changes from being sealed: invalid Changes and broken seals. */
export function changeErrors(repo = "."): string[] {
  return [...validate(path.join(repo, CHANGE_ROOT)).map((e) => `${CHANGE_ROOT}/${e}`), ...checkChanges(repo)];
}

/**
 * Seals every Change not yet sealed, lineage by lineage, and returns them. A
 * sealed Change can never be fixed, so sealing first requires every Change to
 * be valid and every existing seal intact, and refuses before writing
 * anything.
 */
export function sealChanges(repo = "."): string[] {
  const errors = changeErrors(repo);
  if (errors.length) throw new Error(`refusing to seal Changes:\n${errors.join("\n")}`);
  return sealChains(
    repo,
    [...changeChains(repo)].filter(([, units]) => units.length),
  );
}

/**
 * Change Sealing: seals the named Change occurrences (`<lineage>/YY/MM/DD/CC`,
 * as `change:list` names them) before their evolution reaches main. It is the
 * same sealing main runs, over the same chains and the same units, and writes
 * the same seal state; only which Changes it seals differs. Chains keep
 * sealed history first, so a Change can be sealed only once every Change
 * before it in its lineage is sealed or named too: sealing never seals a
 * Change nobody asked for. Refuses, writing nothing, on any invalid Change,
 * any broken seal, an unknown Change, or a Change that would drag another in.
 */
export function sealChange(repo: string, ...occurrences: string[]): string[] {
  if (!occurrences.length) throw new Error("name at least one Change to seal");
  const errors = changeErrors(repo);
  if (errors.length) throw new Error(`refusing to seal Changes:\n${errors.join("\n")}`);
  const chains = changeChains(repo);
  const named = new Map<string, Set<string>>();
  for (const occurrence of occurrences) {
    const unit = `${CHANGE_ROOT}/${occurrence}`;
    const lineage = occurrence.split("/")[0];
    if (!chains.get(lineage)?.includes(unit)) throw new Error(`${occurrence}: not a Change`);
    named.set(lineage, (named.get(lineage) ?? new Set()).add(unit));
  }
  const toSeal: [string, string[]][] = [];
  for (const [lineage, units] of named) {
    const all = chains.get(lineage)!;
    const upTo = all.slice(0, Math.max(...[...units].map((u) => all.indexOf(u))) + 1);
    const dragged = upTo.filter((u) => !units.has(u) && !isSealed(repo, u));
    if (dragged.length) throw new Error(`sealing would also seal ${dragged.join(", ")}: name it too`);
    toSeal.push([lineage, upTo]);
  }
  return sealChains(repo, toSeal);
}

/**
 * The one definition of which paths are seal state for Changes. `file` is a
 * posix path relative to the repository: the chain heads and the lock at its
 * top, and each Change's seal (`change/<lineage>/YY/MM/DD/CC/seal.json`). A
 * seal file anywhere else under the Change root is still seal state, never
 * one sealing writes, so no Change can own material named like a seal.
 */
export function changeSealState(file: string): SealState | undefined {
  if (file === HEADS_FILE) return "heads";
  if (file === LOCK_FILE) return "lock";
  if (!file.startsWith(`${CHANGE_ROOT}/`) || path.posix.basename(file) !== SEAL_FILE) return undefined;
  const unit = file.split("/").slice(1, -1);
  return unit.length === 5 && unit.slice(1).every((part) => /^\d{2}$/.test(part)) ? "unit-seal" : "misplaced-seal";
}

/**
 * Seal state over Changes is written only by sealing on main, never by a
 * change: one error per seal-state path a `git diff --name-status
 * --no-renames` output touches.
 */
export function changeSealStateChanges(nameStatus: string): string[] {
  return entries(nameStatus)
    .filter(({ file }) => changeSealState(file))
    .map(({ status, file }) => `${file}: seal state may only be written by sealing on main (${status})`);
}

/**
 * What sealing on main may commit for Changes: a seal added to each newly
 * sealed Change, and the heads added or updated; nothing else. Takes staged
 * `git diff --cached --name-status --no-renames` output and returns one error
 * per entry sealing could not have produced.
 */
export function changeSealingOutputErrors(nameStatus: string): string[] {
  return entries(nameStatus).flatMap(({ status, file }) => {
    const kind = changeSealState(file);
    if (kind === "unit-seal" && status === "A") return [];
    if (kind === "heads" && (status === "A" || status === "M")) return [];
    const what =
      kind === undefined
        ? "not seal state"
        : `${kind} ${status === "A" ? "added" : status === "M" ? "modified" : status === "D" ? "deleted" : status}`;
    return [`${file}: sealing never commits this (${what})`];
  });
}

/**
 * Why the seal state of Changes a change touches is not the output of Change
 * Sealing, or none where it is. `touched` is a `git diff --name-status
 * --no-renames` output; `before` is the chain heads the change started from.
 *
 * A Change is sealed the same way on main and before it, so nothing marks who
 * sealed it and authority cannot be a marker: seal state is Change Sealing's
 * output exactly when it is what sealing writes and nothing else. Every touched
 * path must be one sealing writes (a seal added to a Change, the heads added or
 * extended), every chain of `before` must be kept and only extended, and the
 * Changes at `repo` must verify with the existing checks, which accept only the
 * exact bytes sealing writes. All or nothing: one entry sealing could not have
 * written refuses every seal-state path.
 */
export function changeSealingAuthorityErrors(repo: string, before: Map<string, Head>, touched: string): string[] {
  const state = entries(touched).filter(({ file }) => changeSealState(file));
  if (!state.length) return [];
  const lines = state.map(({ status, file }) => `${status}\t${file}`).join("\n");
  const refuse = changeSealStateChanges(lines);
  if (changeSealingOutputErrors(lines).length) return refuse;
  let heads: Map<string, Head>;
  try {
    heads = readHeads(repo);
  } catch {
    return refuse;
  }
  for (const [chain, head] of before) {
    const now = heads.get(chain)?.units;
    if (!now || head.units.some((unit, i) => now[i] !== unit)) return refuse;
  }
  return checkChanges(repo).length ? refuse : [];
}

/** The chain heads recorded in `text`, or none where there were none. */
export function headsFromText(text: string | undefined): Map<string, Head> {
  if (text === undefined) return new Map();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-heads-"));
  try {
    fs.writeFileSync(path.join(dir, HEADS_FILE), text);
    return readHeads(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
