import fs from "node:fs";
import path from "node:path";

/** Where Changes live by default: `change/<lineage>/YY/MM/DD/CC/`. */
export const ROOT = "change";

/** A Change's place: the lineage it contributes to and its `YY/MM/DD/CC` occurrence within it. */
export type Change = { lineage: string; occurrence: string };

/** Windows reserves these device names as file names, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/**
 * A lineage is a path component, so it must resolve to the same directory on
 * every supported platform: lowercase kebab-case rules out case collisions,
 * dots and separators, and Windows reserved device names are refused outright.
 */
export function lineageError(lineage: string): string | undefined {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(lineage)) {
    return `lineage "${lineage}" must be lowercase kebab-case (a-z, 0-9, single hyphens)`;
  }
  if (RESERVED.test(lineage)) return `lineage "${lineage}" is reserved on Windows`;
  return undefined;
}

/**
 * An occurrence is `YY/MM/DD/CC`: the calendar date a Change was born and a
 * counter from 01 for Changes born the same day. Fixed-width digits are
 * portable, and sorting each level makes traversal deterministic.
 */
export function occurrenceError(occurrence: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})$/.exec(occurrence);
  if (!match) return `occurrence "${occurrence}" must be YY/MM/DD/CC`;
  const [yy, mm, dd, cc] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(2000 + yy, mm - 1, dd));
  if (date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) {
    return `occurrence "${occurrence}" is not a calendar date`;
  }
  if (cc === 0) return `occurrence "${occurrence}" must count from 01`;
  return undefined;
}

/** A Change's identity beneath the root, as a posix path. */
export function identity(change: Change): string {
  return `${change.lineage}/${change.occurrence}`;
}

/** Entries of a directory in a fixed order, independent of platform and locale. */
function entries(dir: string): fs.Dirent[] {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * Every Change beneath `root`, lineages by name and each lineage's Changes
 * in sorted occurrence order, with everything at the levels Changes own that
 * is not a Change. What a Change holds is never interpreted: only that it is its own
 * files and directories, never a symlink or special entry. A missing root
 * holds no Changes.
 */
export function readChanges(root = ROOT): { changes: Change[]; errors: string[] } {
  const changes: Change[] = [];
  const errors: string[] = [];
  const stat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!stat) return { changes, errors };
  if (!stat.isDirectory()) return { changes, errors: [`${root}: not a directory`] };

  const owned = (dir: string, rel: string) => {
    for (const entry of entries(dir)) {
      const at = `${rel}/${entry.name}`;
      if (entry.isDirectory()) owned(path.join(dir, entry.name), at);
      else if (!entry.isFile()) errors.push(`${at}: a Change owns only files and directories`);
    }
  };

  // Level 0 holds lineages; levels 1 to 4 the YY, MM, DD and CC of occurrences.
  const structural = (dir: string, parts: string[]) => {
    const found = entries(dir);
    if (!found.length && parts.length) errors.push(`${parts.join("/")}: holds no Change`);
    for (const entry of found) {
      const here = [...parts, entry.name];
      const at = here.join("/");
      if (!entry.isDirectory()) {
        errors.push(`${at}: ${parts.length ? "not an occurrence level" : "not a lineage"}`);
        continue;
      }
      const error = parts.length
        ? /^\d{2}$/.test(entry.name)
          ? undefined
          : `"${entry.name}" must be two digits`
        : lineageError(entry.name);
      if (error) {
        errors.push(`${at}: ${error}`);
        continue;
      }
      if (here.length < 5) {
        structural(path.join(dir, entry.name), here);
        continue;
      }
      const change = { lineage: here[0], occurrence: here.slice(1).join("/") };
      const invalid = occurrenceError(change.occurrence);
      if (invalid) {
        errors.push(`${at}: ${invalid}`);
        continue;
      }
      changes.push(change);
      owned(path.join(dir, entry.name), at);
    }
  };

  structural(root, []);
  return { changes, errors };
}
