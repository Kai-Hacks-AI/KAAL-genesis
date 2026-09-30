import fs from "node:fs";
import path from "node:path";
import { portableNameError } from "../skills/using-brain/scripts/brain.js";

/** Where KAAL keeps its Changes: `change/<lineage>/<occurrence>/`. */
export const CHANGE = "change";

/** Files beside the lineages: guidance for working among them, part of no Change. */
const BESIDE = new Set(["AGENTS.md"]);

/**
 * An occurrence is named by its place in its lineage's births: a positive
 * integer in its one canonical spelling, so `1` and `01` can never both name
 * it. Digits alone are portable and no platform reserves them.
 */
const OCCURRENCE = /^[1-9][0-9]*$/;

export function occurrenceNameError(value: string): string | undefined {
  if (!OCCURRENCE.test(value)) return `occurrence "${value}" must be a positive integer without leading zeros`;
  return undefined;
}

/** Earlier births first: canonical integers order by length, then by digits. */
function byBirth(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

function isDirectory(p: string): boolean {
  return fs.lstatSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/** What is out of place in one lineage: its name, its shape and each occurrence's. Nothing inside an occurrence is read. */
function lineageErrors(root: string, lineage: string): string[] {
  const nameError = portableNameError(lineage, "lineage");
  if (nameError) return [`${CHANGE}/${lineage}: ${nameError}`];
  const dir = path.join(root, lineage);
  const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!stat) return [];
  if (!stat.isDirectory()) return [`${CHANGE}/${lineage}: a lineage must be a directory`];
  const errors: string[] = [];
  for (const occurrence of fs.readdirSync(dir).sort()) {
    const id = `${CHANGE}/${lineage}/${occurrence}`;
    const error = occurrenceNameError(occurrence);
    if (error) errors.push(`${id}: ${error}`);
    else if (!isDirectory(path.join(dir, occurrence))) errors.push(`${id}: an occurrence must be a directory`);
  }
  return errors;
}

/**
 * Everything out of place in a Change tree: directly beneath it only lineages,
 * portably named directories, and the files beside them; directly beneath a
 * lineage only occurrences. What an occurrence holds is its own, and never read.
 * A tree that does not exist yet holds no Change and nothing out of place.
 */
export function changeErrors(root: string): string[] {
  const stat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!stat) return [];
  if (!stat.isDirectory()) return [`${CHANGE}: must be a directory`];
  const errors: string[] = [];
  for (const entry of fs.readdirSync(root).sort()) {
    if (BESIDE.has(entry) && fs.lstatSync(path.join(root, entry)).isFile()) continue;
    errors.push(...lineageErrors(root, entry));
  }
  return errors;
}

/** The occurrences born in one lineage, earliest first. */
function occurrencesOf(root: string, lineage: string): string[] {
  const dir = path.join(root, lineage);
  if (!isDirectory(dir)) return [];
  return fs.readdirSync(dir).sort(byBirth);
}

/**
 * Every Change occurrence in a well formed tree, by its identity
 * `<lineage>/<occurrence>`: lineages in code-unit order, each lineage's
 * occurrences in the order they were born. The order is the files' alone.
 */
export function changes(root: string): string[] {
  const errors = changeErrors(root);
  if (errors.length) throw new Error(errors.join("\n"));
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((entry) => !BESIDE.has(entry))
    .sort()
    .flatMap((lineage) => occurrencesOf(root, lineage).map((occurrence) => `${lineage}/${occurrence}`));
}

/**
 * Births exactly `occurrence` in `lineage`: an empty directory, and nothing
 * else but the lineage and tree that hold it when they are missing. It is
 * refused, changing nothing, unless the lineage is well formed and the
 * occurrence is later than every one already born there, so an occurrence
 * is born once and never born again over an earlier one.
 */
export function birthOccurrence(root: string, lineage: string, occurrence: string): string {
  const errors = [...lineageErrors(root, lineage)];
  const nameError = occurrenceNameError(occurrence);
  if (nameError) errors.push(`${CHANGE}/${lineage}/${occurrence}: ${nameError}`);
  if (errors.length) throw new Error(errors.join("\n"));
  const id = `${lineage}/${occurrence}`;
  const latest = occurrencesOf(root, lineage).at(-1);
  if (latest !== undefined && byBirth(occurrence, latest) <= 0) {
    throw new Error(
      occurrence === latest
        ? `${CHANGE}/${id} is already born`
        : `${CHANGE}/${id} is not later than ${lineage}/${latest}`,
    );
  }
  fs.mkdirSync(path.join(root, lineage), { recursive: true });
  // Not recursive: if another birth got there first, this one is refused rather than sharing it.
  try {
    fs.mkdirSync(path.join(root, lineage, occurrence));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`${CHANGE}/${id} is already born`);
    throw e;
  }
  return id;
}

/** Births the next Change occurrence in `lineage`, the one after its latest, and returns its identity. */
export function birthChange(root: string, lineage: string): string {
  const errors = lineageErrors(root, lineage);
  if (errors.length) throw new Error(errors.join("\n"));
  const latest = occurrencesOf(root, lineage).at(-1);
  return birthOccurrence(root, lineage, latest === undefined ? "1" : (BigInt(latest) + 1n).toString());
}
