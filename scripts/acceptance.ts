import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import type { Conditions } from "../skills/testing/scripts/plan.js";
import { portableNameError } from "../skills/using-brain/scripts/brain.js";
import { PLAN, planCommitments, planEntries, SUITES } from "./links.js";
import { kindAt, planError, readPlan, suitePlans } from "./plans.js";

/**
 * What a candidate would reduce of the accepted regression, and which of those
 * reductions it explicitly accepts, read from both states' files alone: both
 * are directories, and nothing here asks Git or GitHub which is which. What
 * the accepted regression protects is what its Regression Plan requires: the
 * commitments it names, each file a place it names by a wildcard, the checks
 * it says show each of them, the sets of conditions it must be shown under,
 * and the suites that serve it. A reduction is any of those the candidate's
 * Regression Plan no longer requires. A candidate accepts a reduction only by
 * naming it, and why, in an acceptance record it adds; whatever it does not
 * name, it retains, so silence never accepts a reduction. What Acceptance is
 * for KAAL is stated in brain/learning/genesis/26/09/28/03/nodes/acceptance.md.
 */

/** Where KAAL keeps its acceptance records: one file each, `acceptance/<name>.md`, never rewritten. */
export const ACCEPTANCE = "acceptance";
const REQUIREMENT_PLACE = /^requirements\/[^/]+\/requirement\.md$/;

/** One piece of the accepted regression's protection: a commitment, a check showing one, a set of conditions, or a suite. */
export type Protection =
  | { commitment: string; within?: string }
  | { proof: string; of: string }
  | { conditions: Conditions }
  | { suite: string };

/** An entry of an acceptance record: the protection it accepts losing, and why. */
export type Accepted = { protection: Protection; because: string; record: string };

/** A protection named the same way however it was written, so a reduction and its acceptance can be matched. */
export function named(p: Protection): string {
  if ("commitment" in p) return `commitment: ${p.commitment}`;
  if ("proof" in p) return `proof: ${p.proof} of ${p.of}`;
  if ("suite" in p) return `suite: ${p.suite}`;
  const sorted = Object.fromEntries(Object.entries(p.conditions).sort(([a], [b]) => a.localeCompare(b)));
  return `conditions: ${JSON.stringify(sorted)}`;
}

/** The Regression Plan's text as its sections are read, or why `state` states none of its own. */
function planOf(state: string): { text?: string; error?: string } {
  if (!fs.lstatSync(path.join(state, PLAN), { throwIfNoEntry: false })) return {};
  const wrong = planError(state, PLAN);
  if (wrong) return { error: `${state}: ${wrong}` };
  return { text: `\n${fs.readFileSync(path.join(state, PLAN), "utf8").replace(/\r\n/g, "\n")}` };
}

/**
 * Everything `state`'s Regression Plan protects, by name, in its order, and
 * why it cannot be read from the state's own files, if it cannot. A state
 * without a Regression Plan protects nothing.
 */
export function protection(state: string): { protects: Protection[]; errors: string[] } {
  const { text, error } = planOf(state);
  if (error) return { protects: [], errors: [error] };
  if (text === undefined) return { protects: [], errors: [] };
  const errors: string[] = [];
  const protects: Protection[] = [];
  for (const place of planCommitments(text)) {
    protects.push({ commitment: place });
    // A place named by a wildcard, such as each skill's SKILL.md, protects each file it names, each on its own.
    if (place.includes("*"))
      for (const file of fs
        .globSync(place, { cwd: state })
        .map((f) => f.split(path.sep).join("/"))
        .sort())
        protects.push({ commitment: file, within: place });
  }
  for (const { place, shownBy } of planEntries(text))
    for (const check of (shownBy ?? []).filter((c) => c !== "its cases"))
      if (place) protects.push({ proof: check, of: place });
  try {
    for (const conditions of readPlan(state, PLAN).conditions) protects.push({ conditions });
  } catch (e) {
    errors.push(`${state}: ${e instanceof Error ? e.message : String(e)}`);
  }
  // Suites reached through a link are not the state's own, and would be read as serving nothing.
  if (fs.lstatSync(path.join(state, SUITES), { throwIfNoEntry: false })?.isSymbolicLink())
    errors.push(`${state}: ${SUITES}: reached through a link`);
  for (const { suite, serves } of suitePlans(state)) if (serves.includes(PLAN)) protects.push({ suite });
  return { protects, errors };
}

/**
 * What `candidate` would reduce of the protection `accepted` states: each
 * protection the accepted Regression Plan requires that the candidate's no
 * longer does, in the accepted plan's order; and what cannot be accepted at
 * all: a Requirement the accepted plan names that the candidate still names
 * but has rewritten, since a Requirement never changes, so its inherited
 * meaning would be lost at a place that seems to keep it. Only the two
 * Regression Plans, and those Requirements, are read, never a diff of files:
 * what a candidate adds, moves or rearranges reduces nothing unless the
 * candidate's plan stops requiring something.
 */
export function reductions(accepted: string, candidate: string): { reductions: Protection[]; errors: string[] } {
  for (const state of [accepted, candidate])
    if (!fs.statSync(state, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${state}: not a directory`);
  const before = protection(accepted);
  const after = protection(candidate);
  const errors = [...before.errors, ...after.errors];
  if (errors.length) return { reductions: [], errors };
  const kept = new Set(after.protects.map(named));
  const lost = new Set(before.protects.filter((p) => !kept.has(named(p))).map(named));
  // A file a wildcard names is reduced on its own only while the candidate still names the wildcard: losing the whole
  // commitment is one reduction, not one for each file it covered.
  const reduced = before.protects.filter(
    (p) => lost.has(named(p)) && !("within" in p && p.within && lost.has(`commitment: ${p.within}`)),
  );
  for (const p of before.protects) {
    if (!("commitment" in p) || !REQUIREMENT_PLACE.test(p.commitment) || !kept.has(named(p))) continue;
    const [was, is] = [accepted, candidate].map((s) => path.join(s, p.commitment));
    const file = (at: string) => fs.lstatSync(at, { throwIfNoEntry: false })?.isFile();
    if (!file(was) || !file(is))
      errors.push(`${p.commitment}: not a file of its own in both states, so whether it was kept cannot be read`);
    else if (!fs.readFileSync(was).equals(fs.readFileSync(is)))
      errors.push(
        `${p.commitment}: rewritten in place, which no acceptance can accept: a Requirement never changes, so state the new commitment as a new Requirement and accept losing this one`,
      );
  }
  return { reductions: reduced, errors };
}

/** The entry of an acceptance record as written, read as the protection it names, or why it names none. */
function entryOf(entry: unknown): Protection | string {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "not a mapping";
  const { because: _, ...rest } = entry as Record<string, unknown>;
  const keys = Object.keys(rest).sort();
  const text = (v: unknown) => typeof v === "string" && v.trim() !== "";
  if (keys.join() === "commitment" && text(rest.commitment)) return { commitment: rest.commitment as string };
  if (keys.join() === "suite" && text(rest.suite)) return { suite: rest.suite as string };
  if (keys.join() === "of,proof" && text(rest.proof) && text(rest.of))
    return { proof: rest.proof as string, of: rest.of as string };
  const c = rest.conditions;
  if (
    keys.join() === "conditions" &&
    c &&
    typeof c === "object" &&
    !Array.isArray(c) &&
    Object.keys(c).length &&
    Object.values(c).every((v) => typeof v === "string")
  )
    return { conditions: c as Conditions };
  return "names no protection: exactly one of commitment, suite, conditions, or proof with of";
}

/**
 * The acceptance records `state` keeps, by place, with their bytes, and why
 * its acceptance/ cannot be read from its own files, if it cannot: a record is
 * a file of its own there, never one reached through a link.
 */
function records(state: string): { records: Map<string, Buffer>; errors: string[] } {
  const dir = path.join(state, ACCEPTANCE);
  const found = new Map<string, Buffer>();
  const kind = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!kind) return { records: found, errors: [] };
  if (!kind.isDirectory()) return { records: found, errors: [`${state}: ${ACCEPTANCE}: not a directory of its own`] };
  const errors: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const place = `${ACCEPTANCE}/${entry.name}`;
    // Guidance for working among the records, such as AGENTS.md, is not a record.
    if (entry.name === "AGENTS.md") continue;
    const name = entry.name.endsWith(".md") ? entry.name.slice(0, -3) : undefined;
    const portable =
      name === undefined
        ? "not an acceptance record, which is <name>.md"
        : portableNameError(name, "an acceptance record's name");
    if (portable || !entry.isFile() || kindAt(path.join(dir, entry.name)) !== "file") {
      errors.push(`${state}: ${place}: ${portable ?? "not a file of its own"}`);
      continue;
    }
    found.set(place, fs.readFileSync(path.join(dir, entry.name)));
  }
  return { records: found, errors };
}

/** The entries a record accepts, or why it accepts nothing it can say. */
function accepts(place: string, bytes: Buffer): { accepted: Accepted[]; errors: string[] } {
  const text = bytes.toString("utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  let data: unknown;
  try {
    data = match ? YAML.parse(match[1]!) : undefined;
  } catch {
    data = undefined;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).join() !== "accepts")
    return { accepted: [], errors: [`${place}: its frontmatter says only what it accepts, as accepts: [...]`] };
  const list = (data as { accepts: unknown }).accepts;
  if (!Array.isArray(list) || !list.length)
    return {
      accepted: [],
      errors: [`${place}: accepts nothing; a candidate that accepts no reduction adds no record`],
    };
  const accepted: Accepted[] = [];
  const errors: string[] = [];
  list.forEach((entry, i) => {
    const protection = entryOf(entry);
    const because = (entry as { because?: unknown } | null)?.because;
    if (typeof protection === "string") errors.push(`${place}: entry ${i + 1} ${protection}`);
    else if (typeof because !== "string" || !because.trim())
      errors.push(`${place}: entry ${i + 1} says not why its loss is accepted, as because: <why>`);
    else accepted.push({ protection, because: because.trim(), record: place });
  });
  return { accepted, errors };
}

/**
 * What `candidate` explicitly accepts losing of what `accepted` protects: the
 * entries of the acceptance records it adds, those it holds that the accepted
 * state does not. A record the accepted state holds is history: it accepted
 * reductions of an earlier regression, and accepts nothing more, so a waiver
 * never waits for a later loss; rewritten, it is refused. With no record added,
 * the candidate accepts no reduction at all.
 */
export function acceptedReductions(accepted: string, candidate: string): { accepted: Accepted[]; errors: string[] } {
  const before = records(accepted);
  const after = records(candidate);
  const errors = [...before.errors, ...after.errors];
  const entries: Accepted[] = [];
  for (const [place, bytes] of after.records) {
    const was = before.records.get(place);
    if (was) {
      if (!was.equals(bytes)) errors.push(`${place}: rewritten; an acceptance record is history, never rewritten`);
      continue;
    }
    const read = accepts(place, bytes);
    entries.push(...read.accepted);
    errors.push(...read.errors);
  }
  return { accepted: entries, errors };
}

/**
 * Whether `candidate` may reduce what `accepted` protects: every reduction it
 * would make is accepted by an entry of a record it adds, and every such entry
 * accepts a reduction it makes, once; with the reductions and what accepts
 * them, which are all the next regression needs to know of what was given up.
 * A candidate that reduces nothing and accepts nothing is acceptable; one that
 * reduces anything it does not name is not.
 */
export function acceptance(
  accepted: string,
  candidate: string,
): { reductions: Protection[]; accepted: Accepted[]; errors: string[] } {
  const observed = reductions(accepted, candidate);
  const stated = acceptedReductions(accepted, candidate);
  const errors = [...observed.errors, ...stated.errors];
  const reduced = new Set(observed.reductions.map(named));
  const seen = new Set<string>();
  for (const a of stated.accepted) {
    const n = named(a.protection);
    if (seen.has(n)) errors.push(`${a.record}: accepts losing ${n} again`);
    else if (!reduced.has(n)) errors.push(`${a.record}: accepts losing ${n}, which the candidate does not reduce`);
    seen.add(n);
  }
  for (const r of observed.reductions)
    if (!seen.has(named(r)))
      errors.push(`${named(r)}: the candidate reduces it, but no acceptance record it adds accepts that`);
  return { reductions: observed.reductions, accepted: stated.accepted, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [accepted, candidate = ".", ...rest] = process.argv.slice(2);
  if (!accepted || rest.length || accepted.startsWith("-")) {
    console.error("usage: acceptance.ts <accepted-state> [candidate-state]");
    process.exitCode = 2;
  } else {
    try {
      const result = acceptance(accepted, candidate);
      console.log(
        JSON.stringify(
          {
            reductions: result.reductions.map(named),
            accepted: result.accepted.map((a) => ({
              reduction: named(a.protection),
              because: a.because,
              record: a.record,
            })),
          },
          null,
          2,
        ),
      );
      if (result.errors.length) {
        console.error(result.errors.join("\n"));
        process.exitCode = 1;
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
