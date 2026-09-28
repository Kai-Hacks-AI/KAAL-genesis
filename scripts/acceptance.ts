import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { type Conditions, satisfies } from "../skills/testing/scripts/plan.js";
import { portableNameError } from "../skills/using-brain/scripts/brain.js";
import { PLAN, planEntries } from "./links.js";
import { kindAt, type PlanRequirement, planRequirements } from "./plans.js";

/**
 * What a candidate would reduce of the accepted regression, and which of those
 * reductions it explicitly accepts, read from both states' files alone: both
 * are directories, and nothing here asks Git or GitHub which is which. What
 * the accepted regression protects is what its Regression Plan requires, read
 * as KAAL reads any plan's requirements: its commitments, the suites that serve
 * it and its proof other than cases, each under the sets of conditions it is
 * required under; with what the plan says shows each commitment, and each file
 * a wildcard commitment covers. A reduction is any of those the candidate's
 * Regression Plan no longer requires. Cases are evidence for those
 * requirements, not requirements, so they are never a reduction. A candidate
 * accepts a reduction only by naming it, or the whole it is part of, and why,
 * in an acceptance record it adds; whatever it does not name, it retains, so
 * silence never accepts a reduction. What Acceptance is for KAAL is stated in
 * brain/learning/genesis/26/09/28/03/nodes/acceptance.md.
 */

/** Where KAAL keeps its acceptance records: one file each, `acceptance/<name>.md`, never rewritten. */
export const ACCEPTANCE = "acceptance";
const REQUIREMENT_PLACE = /^requirements\/[^/]+\/requirement\.md$/;

/**
 * A reduction of what the accepted Regression Plan requires, one of: a
 * requirement it no longer requires at all; one it no longer requires under a
 * set of conditions; a check it no longer says shows a commitment; a file a
 * wildcard commitment no longer covers; or a set of conditions it no longer
 * requires anything under.
 */
export type Reduction =
  | { kind: PlanRequirement["kind"]; name: string; under?: Conditions; of?: string; within?: string }
  | { kind: "conditions"; conditions: Conditions };

/** An entry of an acceptance record: the reduction it accepts, and why. */
export type Accepted = { reduction: Reduction; because: string; record: string };

const setName = (c: Conditions) =>
  JSON.stringify(Object.fromEntries(Object.entries(c).sort(([a], [b]) => a.localeCompare(b))));

/** A reduction named the same way however it was written, so it can be reported and matched. */
export function named(r: Reduction): string {
  if (r.kind === "conditions") return `conditions: ${setName(r.conditions)}`;
  if (r.of !== undefined) return `proof: ${r.name} of ${r.of}`;
  return `${r.kind}: ${r.name}${r.under ? ` under ${setName(r.under)}` : ""}`;
}

/** Whether the entry `e` accepts the reduction `r`: exactly it, or the whole of what `r` reduces a part of. */
function covers(e: Reduction, r: Reduction): boolean {
  if (e.kind === "conditions")
    return r.kind === "conditions"
      ? setName(r.conditions) === setName(e.conditions)
      : !!r.under && setName(r.under) === setName(e.conditions);
  if (r.kind === "conditions") return false;
  if (e.kind === "commitment") return r.kind === "commitment" && (r.name === e.name || r.within === e.name);
  if (e.kind === "proof" && e.of !== undefined) return r.kind === "proof" && r.name === e.name && r.of === e.of;
  return r.kind === e.kind && r.name === e.name;
}

/**
 * The files `place`, a path whose segments may hold the wildcard *, names in
 * `state`, sorted. Each segment with a wildcard is matched against the names
 * its directory lists, never a hidden one unless the segment is, and any match
 * reached through a link is refused into `errors` rather than read through or
 * passed over, as a glob would pass it over.
 */
function expanded(state: string, place: string, errors: string[]): string[] {
  // Every path walked through, whether a segment names it or a wildcard matched it, is the state's own or refused:
  // one reached through a link is neither read through nor passed over as holding nothing.
  const own = (rel: string): boolean => {
    const kind = fs.lstatSync(path.join(state, rel), { throwIfNoEntry: false });
    if (kind?.isSymbolicLink()) errors.push(`${state}: ${rel}: a commitment stated through a link`);
    return !!kind && !kind.isSymbolicLink();
  };
  let found = [""];
  for (const segment of place.split("/")) {
    if (!segment.includes("*")) {
      found = found.map((at) => (at ? `${at}/${segment}` : segment)).filter(own);
      continue;
    }
    const matches = new RegExp(`^${segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
    found = found.flatMap((at) => {
      const dir = path.join(state, at);
      if (!fs.lstatSync(dir).isDirectory()) return [];
      return fs
        .readdirSync(dir)
        .filter((name) => matches.test(name) && (segment.startsWith(".") || !name.startsWith(".")))
        .map((name) => (at ? `${at}/${name}` : name))
        .filter(own);
    });
  }
  return found.sort();
}

/** A requirement of a Regression Plan as Acceptance reads it: what generic Plan reads, with what its plan says shows a commitment, and the files a wildcard commitment covers. */
type Required = PlanRequirement & { shownBy: string[]; files: string[] };

/**
 * What `state`'s Regression Plan requires, as KAAL reads any plan's
 * requirements, so what the links check refuses of it, such as a place outside
 * the state or a suite reached through a link, is refused here too; with, for
 * each commitment, the checks other than cases its plan says show it, and the
 * files a wildcard place covers. A state without a Regression Plan requires
 * nothing.
 */
export function required(state: string): { required: Required[]; errors: string[] } {
  if (!fs.lstatSync(path.join(state, PLAN), { throwIfNoEntry: false })) return { required: [], errors: [] };
  let requirements: PlanRequirement[];
  try {
    requirements = planRequirements(state, PLAN);
  } catch (e) {
    return { required: [], errors: [`${state}: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const entries = planEntries(`\n${fs.readFileSync(path.join(state, PLAN), "utf8").replace(/\r\n/g, "\n")}`);
  const errors: string[] = [];
  return {
    required: requirements.map((r) => ({
      ...r,
      // Required under no set of conditions, a requirement is required under any.
      under: r.under.length ? r.under : [{}],
      shownBy:
        r.kind === "commitment"
          ? (entries.find((e) => e.place === r.name)?.shownBy ?? []).filter((c) => c !== "its cases")
          : [],
      files: r.kind === "commitment" && r.name.includes("*") ? expanded(state, r.name, errors) : [],
    })),
    errors,
  };
}

/**
 * What `candidate` would reduce of what `accepted`'s Regression Plan requires,
 * in the accepted plan's order: each requirement the candidate's plan no longer
 * requires, or no longer under a set of conditions, as a plan's evidence judges
 * runs, so a stricter set, such as a later version of the same runtime, keeps
 * it; each check it no longer says shows a commitment it keeps; and each file
 * a wildcard it keeps no longer covers. A requirement lost is one reduction,
 * not one for each of its parts, and a set of conditions nothing is required
 * under any more is one reduction, not one for each requirement. What cannot
 * be accepted at all is refused: a Requirement the accepted plan names, removed
 * or rewritten, since a Requirement never changes and an accepted loss leaves
 * its record as history. Cases are not read: they are evidence for what is
 * required, so moving, merging or rewriting them reduces nothing it requires.
 */
export function reductions(accepted: string, candidate: string): { reductions: Reduction[]; errors: string[] } {
  for (const state of [accepted, candidate])
    if (!fs.statSync(state, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${state}: not a directory`);
  const before = required(accepted);
  const after = required(candidate);
  const errors = [...before.errors, ...after.errors];
  if (errors.length) return { reductions: [], errors };
  const sets = after.required.flatMap((r) => r.under);
  const found: Reduction[] = [];
  const dropped = new Set<string>();
  for (const r of before.required) {
    const kept = after.required.find((c) => c.kind === r.kind && c.name === r.name);
    if (!kept) {
      found.push({ kind: r.kind, name: r.name });
      continue;
    }
    for (const set of r.under.filter((s) => !kept.under.some((c) => satisfies(c, s)))) {
      // A set the candidate requires nothing under any more is one reduction of the plan's conditions.
      if (sets.some((c) => satisfies(c, set))) found.push({ kind: r.kind, name: r.name, under: set });
      else if (!dropped.has(setName(set))) {
        dropped.add(setName(set));
        found.push({ kind: "conditions", conditions: set });
      }
    }
    for (const check of r.shownBy.filter((c) => !kept.shownBy.includes(c)))
      found.push({ kind: "proof", name: check, of: r.name });
    for (const file of r.files.filter((f) => !kept.files.includes(f)))
      found.push({ kind: "commitment", name: file, within: r.name });
  }
  // A Requirement the accepted regression protects stays as it was, whether or not the candidate still names it: an
  // accepted loss lets its commitment leave the regression, never its record, which is history.
  for (const r of before.required) {
    if (r.kind !== "commitment" || !REQUIREMENT_PLACE.test(r.name)) continue;
    const is = path.join(candidate, r.name);
    const kind = fs.lstatSync(is, { throwIfNoEntry: false });
    if (!kind)
      errors.push(
        `${r.name}: removed, which no acceptance can accept: a Requirement is history, so its record stays when the loss of its commitment is accepted`,
      );
    else if (!kind.isFile())
      errors.push(`${r.name}: not a file of its own in the candidate, so whether its record was kept cannot be read`);
    else if (!fs.readFileSync(path.join(accepted, r.name)).equals(fs.readFileSync(is)))
      errors.push(
        `${r.name}: rewritten, which no acceptance can accept: a Requirement never changes, so state the new commitment as a new Requirement and accept losing this one`,
      );
  }
  return { reductions: found, errors };
}

/** The entry of an acceptance record as written, read as the reduction it accepts, or why it names none. */
function entryOf(entry: unknown): Reduction | string {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "not a mapping";
  const { because: _, ...rest } = entry as Record<string, unknown>;
  const keys = Object.keys(rest).sort().join();
  const text = (v: unknown) => typeof v === "string" && v.trim() !== "";
  if (keys === "commitment" && text(rest.commitment)) return { kind: "commitment", name: rest.commitment as string };
  if (keys === "suite" && text(rest.suite)) return { kind: "suite", name: rest.suite as string };
  if (keys === "proof" && text(rest.proof)) return { kind: "proof", name: rest.proof as string };
  if (keys === "of,proof" && text(rest.proof) && text(rest.of))
    return { kind: "proof", name: rest.proof as string, of: rest.of as string };
  const c = rest.conditions;
  if (
    keys === "conditions" &&
    c &&
    typeof c === "object" &&
    !Array.isArray(c) &&
    Object.keys(c).length &&
    Object.values(c).every((v) => typeof v === "string")
  )
    return { kind: "conditions", conditions: c as Conditions };
  return "names no reduction: exactly one of commitment, suite, proof (maybe with of), or conditions";
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
    const reduction = entryOf(entry);
    const because = (entry as { because?: unknown } | null)?.because;
    if (typeof reduction === "string") errors.push(`${place}: entry ${i + 1} ${reduction}`);
    else if (typeof because !== "string" || !because.trim())
      errors.push(`${place}: entry ${i + 1} says not why its loss is accepted, as because: <why>`);
    else accepted.push({ reduction, because: because.trim(), record: place });
  });
  return { accepted, errors };
}

/**
 * What `candidate` explicitly accepts losing of what `accepted` protects: the
 * entries of the acceptance records it adds, those it holds that the accepted
 * state does not. A record the accepted state holds is history: it accepted
 * reductions of an earlier regression, and accepts nothing more, so a waiver
 * never waits for a later loss; rewritten or removed, it is refused, so the
 * same record can never be added again as if new. With no record added, the
 * candidate accepts no reduction at all.
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
  for (const place of before.records.keys())
    if (!after.records.has(place)) errors.push(`${place}: removed; an acceptance record is history, never removed`);
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
): { reductions: Reduction[]; accepted: Accepted[]; errors: string[] } {
  const observed = reductions(accepted, candidate);
  const stated = acceptedReductions(accepted, candidate);
  const errors = [...observed.errors, ...stated.errors];
  const seen = new Set<string>();
  for (const a of stated.accepted) {
    const n = named(a.reduction);
    if (seen.has(n)) errors.push(`${a.record}: accepts losing ${n} again`);
    else if (!observed.reductions.some((r) => covers(a.reduction, r)))
      errors.push(`${a.record}: accepts losing ${n}, which the candidate does not reduce`);
    seen.add(n);
  }
  for (const r of observed.reductions)
    if (!stated.accepted.some((a) => covers(a.reduction, r)))
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
              reduction: named(a.reduction),
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
