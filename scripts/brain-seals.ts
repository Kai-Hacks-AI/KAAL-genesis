import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../skills/using-brain/scripts/brain.js";
import { validate } from "../skills/using-brain/scripts/validate.js";
import {
  checkChain,
  HEADS_FILE,
  LOCK_FILE,
  readHeads,
  SEAL_FILE,
  sealChains,
} from "../skills/using-seals/scripts/seals.js";

/**
 * KAAL's sealing policy for BRAIN. using-seals is the mechanism and knows
 * nothing of BRAIN; this decides what it seals: one chain per lineage, named
 * after the lineage, with one unit per learning, oldest first. A learning is
 * closed when it is sealed.
 */

const LEARNING = /^\d{2}$/;

/** Every lineage's learnings as units, oldest first: `<lineage>/YY/MM/DD/CC`. */
export function brainChains(root = ROOT): Map<string, string[]> {
  const chains = new Map<string, string[]>();
  if (!fs.existsSync(root)) return chains;
  const dirs = (dir: string) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  for (const lineage of dirs(root)) {
    const units: string[] = [];
    // YY/MM/DD/CC are fixed-width, so sorting each level orders learnings in time.
    const walk = (dir: string, parts: string[]) => {
      if (parts.length === 4) {
        units.push([lineage, ...parts].join("/"));
        return;
      }
      for (const part of dirs(dir).filter((d) => LEARNING.test(d))) walk(path.join(dir, part), [...parts, part]);
    };
    walk(path.join(root, lineage), []);
    chains.set(lineage, units);
  }
  return chains;
}

/**
 * The chains to check: every lineage in BRAIN, and every chain recorded in the
 * heads even if its lineage is gone, so removing a whole lineage is noticed.
 */
function chainsToCheck(root: string): Map<string, string[]> {
  const chains = brainChains(root);
  for (const chain of readHeads(root).keys()) if (!chains.has(chain)) chains.set(chain, []);
  return chains;
}

/**
 * Seals every learning not yet sealed, lineage by lineage. Returns the
 * learnings it sealed. A sealed learning can never be fixed, so sealing first
 * requires the whole BRAIN to be valid and every existing seal intact, and
 * refuses before writing anything, never leaving BRAIN partly closed.
 */
export function sealBrain(root = ROOT): string[] {
  const errors = brainErrors(root);
  if (errors.length) throw new Error(`refusing to seal BRAIN:\n${errors.join("\n")}`);
  // One transaction under one lock: a lineage that fails while sealing (an
  // entry that cannot be sealed, a failed write) leaves every lineage as it was.
  return sealChains(
    root,
    [...brainChains(root)].filter(([, units]) => units.length),
  );
}

/** Every broken seal in BRAIN, lineage by lineage. */
export function checkBrain(root = ROOT): string[] {
  let chains: Map<string, string[]>;
  try {
    chains = chainsToCheck(root);
  } catch (e) {
    return [`${HEADS_FILE}: unreadable chain heads (${e instanceof Error ? e.message : String(e)})`];
  }
  return [...chains].flatMap(([lineage, units]) => checkChain(root, lineage, units));
}

/** What a path is to KAAL's seal state. */
export type SealState = "unit-seal" | "misplaced-seal" | "heads" | "lock";

/**
 * The one definition of which paths are seal state. `file` is a posix path
 * relative to the repository; seal state lives only under the BRAIN root:
 * each learning's seal (`<lineage>/YY/MM/DD/CC/seal.json`), the chain heads
 * and the sealing lock. A seal file anywhere else under the root is still
 * seal state, but never one sealing writes. Anything else is not seal state.
 */
export function sealState(file: string, root = ROOT): SealState | undefined {
  const prefix = `${root.split(path.sep).join("/")}/`;
  if (!file.startsWith(prefix)) return undefined;
  const inRoot = file.slice(prefix.length);
  if (inRoot === HEADS_FILE) return "heads";
  if (inRoot === LOCK_FILE) return "lock";
  if (inRoot !== SEAL_FILE && !inRoot.endsWith(`/${SEAL_FILE}`)) return undefined;
  const unit = inRoot.split("/").slice(0, -1);
  return unit.length === 5 && unit.slice(1).every((part) => LEARNING.test(part)) ? "unit-seal" : "misplaced-seal";
}

/** Each entry of `git diff --name-status --no-renames` output: its status letter and path. */
export function entries(nameStatus: string): { status: string; file: string }[] {
  return nameStatus
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [status = "", file = ""] = line.split("\t");
      return { status, file };
    });
}

/**
 * Seal state is written only by sealing on main, never by a change: a change
 * that adds, modifies or deletes a seal, the chain heads or the lock would let
 * it rewrite sealed history, which file-based seals alone cannot detect.
 * Takes `git diff --name-status --no-renames` output and returns one error per
 * seal-state path it touches.
 */
export function sealStateChanges(nameStatus: string, root = ROOT): string[] {
  return entries(nameStatus)
    .filter(({ file }) => sealState(file, root))
    .map(({ status, file }) => `${file}: seal state may only be written by sealing on main (${status})`);
}

/**
 * The other side of the same boundary: what sealing on main may commit. It
 * adds a seal to each newly sealed learning and adds or updates the chain
 * heads; it never changes or removes existing seal state, never commits the
 * lock, and never commits anything that is not seal state. Takes
 * `git diff --cached --name-status --no-renames` output for everything staged
 * and returns one error per entry sealing could not have produced.
 */
export function sealingOutputErrors(nameStatus: string, root = ROOT): string[] {
  return entries(nameStatus).flatMap(({ status, file }) => {
    const kind = sealState(file, root);
    if (kind === "unit-seal" && status === "A") return [];
    if (kind === "heads" && (status === "A" || status === "M")) return [];
    const what =
      kind === undefined
        ? "not seal state"
        : `${kind} ${status === "A" ? "added" : status === "M" ? "modified" : status === "D" ? "deleted" : status}`;
    return [`${file}: sealing never commits this (${what})`];
  });
}

/** Everything that stops a BRAIN from being sealed: invalid nodes and broken seals. */
export function brainErrors(root = ROOT): string[] {
  return [...validate(root), ...checkBrain(root)];
}
