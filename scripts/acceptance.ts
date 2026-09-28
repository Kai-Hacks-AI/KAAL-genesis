import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { portableNameError } from "../skills/using-brain/scripts/brain.js";
import {
  type Case,
  caseFiles,
  linkErrors,
  PLAN,
  planCommitments,
  planEntries,
  repoCases,
  unnamedCases,
} from "./links.js";
import { kindAt, type PlanRequirement, planRequirements, suitePlans } from "./plans.js";
import {
  judge,
  runCandidate,
  runTrusted,
  SKIP_LIMIT,
  skipArguments,
  unmatchedCases,
  unreplayable,
} from "./regression.js";

/**
 * What a candidate is allowed to give up of the accepted regression, read from
 * both states' files alone: both are directories, and nothing here asks Git or
 * GitHub which is which. Acceptance is only what a candidate explicitly
 * excludes of the accepted regression: inherited cases and suites, each named,
 * with why, in an acceptance record it adds; at best, nothing. What it does
 * not name, it retains, so silence never gives up anything. The accepted
 * protection is the accepted Regression Plan run without those exclusions:
 * what the accepted plan requires, shown by the accepted regression's own
 * cases, replayed against the candidate. New protection comes only with what
 * the candidate newly promises, never from here. What the candidate's own plan
 * says is never read: it cannot give up what is inherited by saying less. What
 * Acceptance is for KAAL is stated in
 * brain/learning/genesis/26/09/28/03/nodes/acceptance.md.
 */

/** Where KAAL keeps its acceptance records: one file each, `acceptance/<name>.md`, never rewritten. */
export const ACCEPTANCE = "acceptance";
const REQUIREMENT_PLACE = /^requirements\/[^/*]+\/requirement\.md$/;

/** What an acceptance record excludes of the accepted regression: one of its cases, by its address there, or a suite that serves its plan. */
export type Exclusion = { case: { file: string; title: string } } | { suite: string };

/** An entry of an acceptance record: what it excludes, and why. */
export type Accepted = { exclusion: Exclusion; because: string; record: string };

/** An exclusion named the same way however it was written. */
export function named(e: Exclusion): string {
  return "case" in e ? `case: ${e.case.file}: ${JSON.stringify(e.case.title)}` : `suite: ${e.suite}`;
}

/** The entry of an acceptance record as written, read as what it excludes, or why it excludes nothing it can say. */
function entryOf(entry: unknown): Exclusion | string {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "not a mapping";
  const { because: _, ...rest } = entry as Record<string, unknown>;
  const keys = Object.keys(rest).sort().join();
  const text = (v: unknown) => typeof v === "string" && v.trim() !== "";
  // A title is whatever the case is titled, even nothing at all, as a case can be.
  if (keys === "case,title" && text(rest.case) && typeof rest.title === "string")
    return { case: { file: rest.case as string, title: rest.title as string } };
  if (keys === "suite" && text(rest.suite)) return { suite: rest.suite as string };
  return "excludes nothing: either a case, with its title, or a suite";
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

/** The entries a record holds, or why it holds nothing it can say. */
function accepts(place: string, bytes: Buffer): { accepted: Accepted[]; errors: string[] } {
  const text = bytes.toString("utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  let data: unknown;
  try {
    data = match ? YAML.parse(match[1]!) : undefined;
  } catch {
    data = undefined;
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).join() !== "excludes")
    return { accepted: [], errors: [`${place}: its frontmatter says only what it excludes, as excludes: [...]`] };
  const list = (data as { excludes: unknown }).excludes;
  if (!Array.isArray(list) || !list.length)
    return { accepted: [], errors: [`${place}: excludes nothing; a candidate that gives up nothing adds no record`] };
  const accepted: Accepted[] = [];
  const errors: string[] = [];
  list.forEach((entry, i) => {
    const exclusion = entryOf(entry);
    const because = (entry as { because?: unknown } | null)?.because;
    if (typeof exclusion === "string") errors.push(`${place}: entry ${i + 1} ${exclusion}`);
    else if (typeof because !== "string" || !because.trim())
      errors.push(`${place}: entry ${i + 1} says not why it is given up, as because: <why>`);
    else accepted.push({ exclusion, because: because.trim(), record: place });
  });
  return { accepted, errors };
}

export function acceptedExclusions(accepted: string, candidate: string): { accepted: Accepted[]; errors: string[] } {
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
 * The accepted protection of `accepted` less `exclusions`: what the accepted
 * Regression Plan requires, as KAAL reads any plan's requirements, less each
 * suite excluded and each commitment every inherited case of which is
 * excluded and which nothing but its cases shows; and the inherited cases that
 * show it, less those excluded. An exclusion must name what the accepted
 * regression has: a case it keeps, at its address there, or a suite that
 * serves its plan; excluding a suite gives up only that requirement, never the
 * cases that belong to it, which still show what they help prove.
 */
export function acceptedProtection(
  accepted: string,
  exclusions: Accepted[],
): { requires: PlanRequirement[]; given: PlanRequirement[]; cases: Case[]; errors: string[] } {
  const errors: string[] = [];
  // An accepted regression without a plan requires nothing named, but its cases are still inherited, as its own
  // replay runs them all.
  const hasPlan = !!fs.lstatSync(path.join(accepted, PLAN), { throwIfNoEntry: false });
  let requirements: PlanRequirement[] = [];
  try {
    if (hasPlan) {
      // What the links check refuses of the accepted regression, such as a link belonging to no case, is refused here
      // too, rather than read past while its cases are found.
      const wrong = linkErrors(accepted);
      if (wrong.length) throw new Error(wrong.join("\n"));
      requirements = planRequirements(accepted, PLAN);
    } else {
      // Without a plan there are no links to check, but a case whose title cannot be read would still be passed over
      // as none, and never replayed.
      const unnamed = unnamedCases(accepted);
      if (unnamed.length)
        throw new Error(
          unnamed.map((at) => `${at}: a case whose title cannot be read, so it cannot be inherited`).join("\n"),
        );
    }
    // The runner runs a case titled with nothing at all under another name, so no result could be told to be its, and
    // it could not be kept from running beside the cases kept: its title names nothing that runs.
    const untitled = repoCases(accepted).filter((c) => c.title === "");
    if (untitled.length)
      throw new Error(
        untitled
          .map(
            (c) =>
              `${c.file}: a case titled with nothing at all, which runs under another name, so it cannot be inherited`,
          )
          .join("\n"),
      );
  } catch (e) {
    return {
      requires: [],
      given: [],
      cases: [],
      errors: [`${accepted}: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
  const inherited = repoCases(accepted);
  // Without a plan, no suite serves one, whatever it says it serves.
  const serving = new Set(
    hasPlan ? suitePlans(accepted).flatMap((s) => (s.serves.includes(PLAN) ? [s.suite] : [])) : [],
  );
  const excludedCase = (c: { file: string; title: string }) =>
    exclusions.some(
      (a) => "case" in a.exclusion && a.exclusion.case.file === c.file && a.exclusion.case.title === c.title,
    );
  const lookalike = (file: string, title: string) =>
    inherited.find((c) => c.file === file && c.title !== title && c.title.trim() === title && !excludedCase(c))?.title;
  const seen = new Set<string>();
  for (const { exclusion, record } of exclusions) {
    const n = named(exclusion);
    if (seen.has(n)) errors.push(`${record}: excludes ${n} again`);
    else if (
      "case" in exclusion &&
      !inherited.some((c) => c.file === exclusion.case.file && c.title === exclusion.case.title)
    )
      errors.push(`${record}: excludes ${n}, which the accepted regression has no case of`);
    // Two cases at one address are two cases, which one exclusion could not tell apart.
    else if (
      "case" in exclusion &&
      inherited.filter((c) => c.file === exclusion.case.file && c.title === exclusion.case.title).length > 1
    )
      errors.push(`${record}: excludes ${n}, an address the accepted regression holds more than one case at`);
    // The runner passes over, with the case a title names, any whose title is the same but for the space around it,
    // so such a case must be excluded with it, or neither is.
    else if ("case" in exclusion && lookalike(exclusion.case.file, exclusion.case.title) !== undefined)
      errors.push(
        `${record}: excludes ${n}, which the runner cannot tell from ${JSON.stringify(lookalike(exclusion.case.file, exclusion.case.title))} kept beside it, whose title differs only by the space around it`,
      );
    else if ("suite" in exclusion && !serving.has(exclusion.suite))
      errors.push(`${record}: excludes ${n}, which serves no Regression Plan of the accepted regression`);
    seen.add(n);
  }
  const cases = inherited.filter((c) => !excludedCase(c));
  const text = hasPlan ? `\n${fs.readFileSync(path.join(accepted, PLAN), "utf8").replace(/\r\n/g, "\n")}` : "";
  const onlyCases = (place: string) =>
    // Every entry the plan states the place in says what shows it, not only the first.
    planEntries(text)
      .filter((e) => e.place === place)
      .flatMap((e) => e.shownBy ?? ["its cases"])
      .every((by) => by === "its cases");
  const requires = requirements.filter((r) => {
    if (r.kind === "suite") return !exclusions.some((a) => "suite" in a.exclusion && a.exclusion.suite === r.name);
    if (r.kind !== "commitment") return true;
    // A commitment its cases alone show is given up once every inherited case of it is excluded, never by less.
    const own = inherited.filter((c) => c.places.includes(r.name));
    return !(own.length && own.every(excludedCase) && onlyCases(r.name));
  });
  return { requires, given: requirements.filter((r) => !requires.includes(r)), cases, errors };
}

/**
 * Every link in `state`, beside its dependencies and Git's own files, that does
 * not lead within it by a relative path that never leaves it: the replay copies
 * links as they are, so an inherited case following one would run or read what
 * the copy does not hold, even the state it was copied from.
 */
function escapingLinks(state: string): string[] {
  const root = path.resolve(state);
  const found: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const at = rel ? `${rel}/${entry.name}` : entry.name;
      if (!rel && (entry.name === "node_modules" || entry.name === ".git")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        // Judged by what the link says, not where it leads now: an absolute target leads wherever the copy is made,
        // and a relative one that climbs out of the state leads out of the copy, whatever it comes back into.
        const text = fs.readlinkSync(full).split(path.sep).join("/");
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(at), text));
        if (path.isAbsolute(text) || /^[a-zA-Z]:/.test(text) || target === ".." || target.startsWith("../"))
          found.push(at);
      } else if (entry.isDirectory()) walk(full, at);
    }
  };
  walk(root, "");
  return found.sort();
}

/**
 * What the accepted regression runs, in each file a case is excluded from,
 * that its source does not name, or names without it running: an exclusion
 * gives up a case by its title, which is how the runner is told to pass it
 * over, so a test run under that title without being named, such as one
 * registered through `it`, would be given up with it unnamed. The accepted
 * regression refuses any such test as the next regression, so an accepted
 * state holding one is refused. The files are run as the accepted state's own.
 */
function unaddressed(accepted: string, exclusions: Accepted[]): string[] {
  const files = [...new Set(exclusions.flatMap((a) => ("case" in a.exclusion ? [a.exclusion.case.file] : [])))].sort();
  if (!files.length) return [];
  const unmatched = unmatchedCases(
    repoCases(accepted).filter((c) => files.includes(c.file)),
    runCandidate(accepted, files),
  );
  return unmatched.length
    ? [
        `the accepted regression runs what it does not name beside an excluded case (${unmatched.join(", ")}), so no title can say which case is given up`,
      ]
    : [];
}

/** A requirement named for reading: its kind and name. */
const requirementName = (r: PlanRequirement) => `${r.kind}: ${r.name}`;

/**
 * Whether `candidate` holds the accepted protection of `accepted`: every
 * inherited case not excluded passes, replayed against the candidate as the
 * accepted regression replays its cases, so nothing but an explicit exclusion
 * gives up an inherited case; each exclusion names what the accepted
 * regression has; and every Requirement the accepted plan names keeps its
 * record, which is history, even once every case of it is excluded. With what
 * the accepted protection still requires, which is all the next regression
 * inherits of the accepted one. A candidate that gives up nothing adds no
 * record, the best acceptance there is, and holds the accepted protection
 * only when every inherited case passes against it.
 */
export function acceptance(
  accepted: string,
  candidate: string,
): { excluded: Accepted[]; requires: string[]; errors: string[] } {
  for (const state of [accepted, candidate])
    if (!fs.statSync(state, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${state}: not a directory`);
  const stated = acceptedExclusions(accepted, candidate);
  const plan = acceptedProtection(accepted, stated.accepted);
  const errors = [...stated.errors, ...plan.errors];
  // Each Requirement the accepted plan names, directly or by a wildcard, as the links check finds what a place names.
  const requirementsNamed = [
    ...new Set(
      plan.requires
        .concat(plan.given)
        .filter((r) => r.kind === "commitment")
        .flatMap((r) =>
          r.name.includes("*")
            ? fs.globSync(r.name, { cwd: accepted }).map((f) => f.split(path.sep).join("/"))
            : [r.name],
        )
        .filter((p) => REQUIREMENT_PLACE.test(p)),
    ),
  ].sort();
  // A record reached through a link anywhere along its path is not one the candidate holds.
  const own = (place: string) => {
    try {
      const real = path.relative(fs.realpathSync(candidate), fs.realpathSync(path.join(candidate, place)));
      return real.split(path.sep).join("/") === place;
    } catch {
      return false;
    }
  };
  for (const place of requirementsNamed) {
    const is = fs.lstatSync(path.join(candidate, place), { throwIfNoEntry: false });
    if (!is)
      errors.push(
        `${place}: removed; a Requirement is history, so its record stays even once it is no longer required`,
      );
    else if (!own(place)) errors.push(`${place}: reached through a link, so the candidate does not hold its record`);
    else if (
      !is.isFile() ||
      !fs.readFileSync(path.join(accepted, place)).equals(fs.readFileSync(path.join(candidate, place)))
    )
      errors.push(`${place}: rewritten; a Requirement never changes, so a new commitment is a new Requirement`);
  }
  // An accepted regression that cannot be replayed is refused even when no inherited case is left to run: what its
  // exclusions name was read from it all the same.
  const unfaithful = errors.length ? undefined : unreplayable(accepted);
  if (unfaithful) errors.push(unfaithful);
  const clean = !errors.length;
  const excluded = (file: string, title: string) =>
    stated.accepted.some(
      (a) => "case" in a.exclusion && a.exclusion.case.file === file && a.exclusion.case.title === title,
    );
  // A file whose every case is excluded is not run at all, so nothing it would do against the candidate, such as
  // never finishing, can hold up what is kept. Any other file is, even one holding no case, whose tests the replay
  // holds as it holds any it runs without naming.
  const inherited = clean ? repoCases(accepted) : [];
  const kept = (file: string) => {
    const own = inherited.filter((c) => c.file === file);
    return !own.length || own.some((c) => !excluded(c.file, c.title));
  };
  const running = clean ? caseFiles(accepted).filter(kept) : [];
  if (running.length) {
    const escaping = escapingLinks(candidate);
    if (escaping.length)
      errors.push(
        `the candidate links other than within itself by a relative path (${escaping.join(", ")}), so its inherited cases would not judge it alone`,
      );
    else {
      // Nor is a case excluded from a file that keeps others run beside them, where it could still disturb them.
      const skipped = (file: string) =>
        stated.accepted.flatMap((a) =>
          "case" in a.exclusion && a.exclusion.case.file === file ? [a.exclusion.case.title] : [],
        );
      // Titles are named to the runner on its command line, which no platform lets grow without end.
      const unnameable = running.flatMap((file) => {
        const length = skipArguments(skipped(file)).join(" ").length;
        return length > SKIP_LIMIT
          ? [
              `${file}: the titles excluded beside the cases it keeps would take ${length} characters to name to the runner, more than the ${SKIP_LIMIT} any platform's command line is sure to carry`,
            ]
          : [];
      });
      errors.push(...unnameable);
      if (!unnameable.length) {
        // Only what is excluded is given up: a file's own report counts while the file is run, and a result no case
        // accounts for is held, as the accepted regression's replay holds it.
        const results = runTrusted(accepted, candidate, kept, skipped).filter((r) =>
          r.name.split("\\").join("/") === r.file ? kept(r.file) : !excluded(r.file, r.name),
        );
        errors.push(...judge(plan.cases, results, new Set()).map((e) => `inherited case not excluded: ${e}`));
      }
    }
  }
  // So is one running what it does not name where a case is excluded, even from a file not run at all. Its own run of
  // those files runs the excluded cases too, so it comes after the replay: nothing they leave, even outside the copy
  // they run in, can reach what the replay judges.
  if (clean) errors.push(...unaddressed(accepted, stated.accepted));
  return { excluded: stated.accepted, requires: plan.requires.map(requirementName), errors };
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
            excluded: result.excluded.map((a) => ({
              excludes: named(a.exclusion),
              because: a.because,
              record: a.record,
            })),
            requires: result.requires,
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
