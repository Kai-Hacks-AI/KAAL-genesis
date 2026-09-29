import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { type Case, caseFiles, fileCases } from "./links.js";
import { CHANGE, HELD_EVIDENCE } from "./regression.js";

/**
 * Regression projection: where a regression keeps the evidence it projects.
 * Feature adds, Acceptance removes, Regression projects: the evidence that
 * demonstrates what a regression protects is the accepted evidence itself,
 * held as it was admitted, never a candidate's own testing proven like it. A
 * regression holds it under `change/<name>/test/`, each change's evidence as
 * that change brought it in, at the paths it was kept at: its case files and
 * the test data they were admitted with, byte for byte, with `held.md`
 * naming the cases held there that are no longer projected. The candidate's
 * own testing is what it carries today; the held evidence is what judges it
 * and its successors, whatever the candidate does with its own.
 */

/** The record in a change's held evidence naming the cases held there that are no longer projected. */
export const HELD = "held.md";

/**
 * The name held for the evidence a regression had before it projected any:
 * everything its own testing carried, which no one change brought in.
 */
export const GENESIS = "genesis";

/**
 * Evidence a regression projects from one place: a change's held evidence,
 * named by the change, or, for a regression that holds none yet, its own
 * testing, which is then all the evidence it has.
 */
export type Source = { change?: string; root: string };

/** A case held but no longer projected, and why. */
export type Skip = { file: string; title: string; because: string };

/**
 * Where `state` keeps the evidence its regression projects: each change's held
 * evidence, in name order, or, where it holds none, its own testing.
 */
export function sources(state: string): Source[] {
  const dir = path.join(state, CHANGE);
  const names = fs.lstatSync(dir, { throwIfNoEntry: false })?.isDirectory()
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .filter((name) => fs.lstatSync(path.join(dir, name, HELD_EVIDENCE), { throwIfNoEntry: false })?.isDirectory())
        .sort()
    : [];
  return names.length
    ? names.map((change) => ({ change, root: path.join(dir, change, HELD_EVIDENCE) }))
    : [{ root: state }];
}

/** How the evidence of `source` is named where it is reported: by where it is held, nothing for a state's own testing. */
export const label = (source: Source) => (source.change ? `${CHANGE}/${source.change}/${HELD_EVIDENCE}/` : "");

/** The cases `source` holds that are no longer projected: none for a state's own testing. */
export function heldSkips(source: Source): Skip[] {
  if (!source.change) return [];
  const at = path.join(source.root, HELD);
  if (!fs.lstatSync(at, { throwIfNoEntry: false })?.isFile()) throw new Error(`${label(source)}${HELD}: missing`);
  const text = fs.readFileSync(at, "utf8").replace(/\r\n/g, "\n");
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
  const read = front === undefined ? undefined : (YAML.parse(front) as { skips?: unknown } | null);
  const skips = read?.skips;
  if (
    !Array.isArray(skips) ||
    !skips.every(
      (s) =>
        s &&
        typeof s === "object" &&
        typeof (s as Skip).file === "string" &&
        typeof (s as Skip).title === "string" &&
        typeof (s as Skip).because === "string",
    )
  )
    throw new Error(`${label(source)}${HELD}: its skips cannot be read`);
  return skips as Skip[];
}

/** Whether `skips` passes over the case at `file` titled `title`: every case of that title there, as the runner does. */
export const skipped = (skips: Skip[], file: string, title: string) =>
  skips.some((s) => s.file === file && s.title === title);

/**
 * Every case `source` holds, in the order they are read, as `state`'s own
 * `npm test` finds cases, whether or not it still projects them.
 */
export function heldCases(state: string, source: Source): Case[] {
  return caseFiles(state, source.root).flatMap((file) =>
    fileCases(file, fs.readFileSync(path.join(source.root, file), "utf8")),
  );
}

/**
 * Every case `state`'s regression projects: each source's cases, less those it
 * holds skipped, with the source they are held in.
 */
export function projectedCases(state: string): { source: Source; cases: Case[] }[] {
  return sources(state).map((source) => {
    const skips = heldSkips(source);
    return { source, cases: heldCases(state, source).filter((c) => !skipped(skips, c.file, c.title)) };
  });
}

/** `held.md` for a change whose evidence holds `skips`: the same text for the same skips, in whatever order they came. */
export function heldRecord(change: string, skips: Skip[]): string {
  const ordered = [...skips].sort((a, b) =>
    a.file !== b.file ? (a.file < b.file ? -1 : 1) : a.title < b.title ? -1 : a.title > b.title ? 1 : 0,
  );
  return [
    "---",
    YAML.stringify({ skips: ordered }, { lineWidth: 0 }).trimEnd(),
    "---",
    "",
    `The evidence the change \`${change}\` brought into KAAL's regression, held as it was admitted: its case files and the test data they were admitted with, at the paths they were kept at, byte for byte. The regression projects every case held here but those skipped above, whether given up by Acceptance or never admitted, and replays them against every later candidate, whatever that candidate does with its own testing.`,
    "",
  ].join("\n");
}
