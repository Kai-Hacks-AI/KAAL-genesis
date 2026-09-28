import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  readRequirements,
  REQUIREMENT,
  requirementErrors,
} from "../skills/managing-requirements/scripts/requirements.js";
import { PLAN, planCommitments } from "./links.js";
import { planError } from "./plans.js";
import { planEvidence, type Run, testRun } from "./run.js";

/**
 * What a candidate newly promises relative to the accepted state, read from
 * both states' files alone: both are directories, and nothing here asks Git
 * or GitHub which is which. A state states a commitment by naming its place in
 * its Regression Plan or by recording a Requirement, and a commitment is
 * identified by that place, as KAAL's cases point at it. A new promise is one
 * the candidate states and the accepted state does not. Nothing here reads
 * what the accepted state states and the candidate does not: that is never a
 * Feature, and deciding whether losing it is acceptable is not Feature's.
 * What a Feature is for KAAL is stated in
 * brain/learning/genesis/26/09/28/02/nodes/feature.md.
 */

/** KAAL's Feature Plan: what a candidate newly promises must be shown under the conditions it states. */
export const FEATURE_PLAN = "plans/feature.md";
/** Where KAAL records its Requirements. */
export const REQUIREMENTS = "requirements";

/** The place of each Requirement `state` records, as a case points at it. */
function requirementPlaces(state: string): string[] {
  return readRequirements(path.join(state, REQUIREMENTS)).map(({ name }) => `${REQUIREMENTS}/${name}/${REQUIREMENT}`);
}

/**
 * Why what `state` states cannot be read from its own files, if it cannot: its
 * Regression Plan is not a plan it states in its own place, such as one
 * reached through a link, or its Requirements are reached through one, or
 * are no complete records. What is stated through a link is stated by a file
 * the state does not hold, so what it promises is not the state's own.
 */
function unstatedErrors(state: string): string[] {
  const errors: string[] = [];
  if (fs.lstatSync(path.join(state, PLAN), { throwIfNoEntry: false })) {
    const wrong = planError(state, PLAN);
    if (wrong) errors.push(`${state}: ${wrong}`);
  }
  const dir = path.join(state, REQUIREMENTS);
  const kind = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (kind?.isSymbolicLink()) errors.push(`${state}: ${REQUIREMENTS}: reached through a link`);
  else if (kind?.isDirectory()) {
    // A Requirement's directory reached through a link would be passed over as no Requirement at all.
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isSymbolicLink()))
      errors.push(`${state}: ${REQUIREMENTS}/${entry.name}: reached through a link`);
    // A record that is not a file of its own, or cannot be read, could be a commitment the state states.
    errors.push(...requirementErrors(dir));
  }
  return errors;
}

/**
 * Every commitment `state` states, by place, sorted: those its Regression Plan
 * names, and every Requirement it records, whether or not a plan names it yet.
 * Refused where that cannot be read from the state's own files.
 */
export function statedCommitments(state: string): string[] {
  const errors = unstatedErrors(state);
  if (errors.length) throw new Error(errors.join("\n"));
  const plan = path.join(state, PLAN);
  const named = fs.existsSync(plan) ? planCommitments(`\n${fs.readFileSync(plan, "utf8")}`) : [];
  return [...new Set([...named, ...requirementPlaces(state)])].sort();
}

/**
 * What `candidate` newly promises relative to `accepted`: every commitment it
 * states that the accepted state does not, by place, sorted; and why that
 * cannot be said, if it cannot. It depends only on what the two states state,
 * never on their cases, suites, runs or code, so a candidate that states
 * nothing new promises nothing new. A Requirement at the same place in both
 * whose record differs was rewritten in place, and is refused: a Requirement
 * never changes, so what it now says is neither the accepted promise kept nor
 * a new one, and whether its old meaning may go is not Feature's to decide.
 */
export function newPromises(accepted: string, candidate: string): { promises: string[]; errors: string[] } {
  for (const state of [accepted, candidate])
    if (!fs.statSync(state, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${state}: not a directory`);
  // What either state states must be read from its own files, or what the candidate newly promises is not yet known.
  const errors = [...unstatedErrors(accepted), ...unstatedErrors(candidate)];
  if (errors.length) return { promises: [], errors };
  const before = new Set(statedCommitments(accepted));
  const kept = new Set(requirementPlaces(accepted));
  for (const place of requirementPlaces(candidate).filter((p) => kept.has(p)))
    if (!fs.readFileSync(path.join(accepted, place)).equals(fs.readFileSync(path.join(candidate, place))))
      errors.push(
        `${place}: rewritten in place: a Requirement never changes, so this is neither kept nor newly promised`,
      );
  return { promises: statedCommitments(candidate).filter((place) => !before.has(place)), errors };
}

/**
 * A run of KAAL's Feature Plan for `candidate` against `accepted`: the
 * candidate's own cases, run against the candidate, reaching what the plan
 * requires, and, as commitments it requires, every new promise, so a new
 * promise is shown by the cases of the candidate that say they help prove it,
 * and by nothing else. Refused where what the candidate newly promises cannot
 * be said.
 */
export function featureRun({
  accepted,
  candidate,
  conditions = {},
}: {
  accepted: string;
  candidate: string;
  conditions?: Record<string, string>;
}): { promises: string[]; run: Run } {
  const { promises, errors } = newPromises(accepted, candidate);
  if (errors.length) throw new Error(errors.join("\n"));
  return { promises, run: testRun({ testing: candidate, plan: FEATURE_PLAN, conditions, commitments: promises }) };
}

/**
 * What `runs` of the Feature Plan demonstrate of what `candidate` newly
 * promises relative to `accepted`, as the plan judges any runs: each new
 * promise, and whatever else the plan requires, under each set of conditions
 * it states. Only runs of the candidate's own testing against the candidate
 * itself are evidence. A new promise no case proves is not demonstrated; a
 * candidate that newly promises nothing gives the plan nothing more to require.
 */
export function featureEvidence(
  accepted: string,
  candidate: string,
  runs: Run[],
): { promises: string[]; evidence: ReturnType<typeof planEvidence> } {
  const { promises, errors } = newPromises(accepted, candidate);
  if (errors.length) throw new Error(errors.join("\n"));
  // Only runs against the candidate show what it promises: cases passing against any other state say nothing of it.
  for (const run of runs)
    if (run.tested !== path.resolve(candidate))
      throw new Error(`a run against ${run.tested} shows nothing of what ${candidate} newly promises`);
  return { promises, evidence: planEvidence(candidate, FEATURE_PLAN, runs, promises) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let args: { values: { run?: boolean; condition?: string[] }; positionals: string[] } | undefined;
  try {
    args = parseArgs({
      allowPositionals: true,
      options: { run: { type: "boolean" }, condition: { type: "string", multiple: true } },
    });
  } catch {
    args = undefined; // An option it does not know, or one without its value.
  }
  const [accepted, candidate = ".", ...rest] = args?.positionals ?? [];
  const values = args?.values ?? {};
  const given = (values.condition ?? []).map((c) => /^([^=]+)=(.*)$/.exec(c));
  if (!args || !accepted || rest.length || given.some((g) => !g) || (given.length && !values.run)) {
    console.error("usage: feature.ts [--run [--condition <name>=<value>]...] <accepted-state> [candidate-state]");
    process.exitCode = 2;
  } else {
    try {
      if (!values.run) {
        const { promises, errors } = newPromises(accepted, candidate);
        console.log(JSON.stringify({ promises }, null, 2));
        if (errors.length) {
          console.error(errors.join("\n"));
          process.exitCode = 1;
        }
      } else {
        const conditions = Object.fromEntries(given.map((g) => [g![1]!, g![2]!]));
        const { promises, run } = featureRun({ accepted, candidate, conditions });
        const { evidence } = featureEvidence(accepted, candidate, [run]);
        console.log(JSON.stringify({ promises, run, evidence }, null, 2));
        // A plan that requires nothing demonstrates nothing, and owes nothing: a candidate that newly promises nothing,
        // with nothing else required of it, is no failure. Anything required that did not hold is.
        if (evidence.requirements.length && evidence.verdict !== "held") {
          console.error(`${FEATURE_PLAN}: ${evidence.verdict}`);
          process.exitCode = 1;
        } else if (!evidence.requirements.length)
          console.error(`${FEATURE_PLAN}: nothing newly promised, so it requires nothing and demonstrates nothing`);
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
