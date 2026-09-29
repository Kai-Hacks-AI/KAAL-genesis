import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { type Conditions, evidence } from "../skills/testing/scripts/plan.js";
import { acceptance, acceptedExclusions, acceptedProtection } from "./acceptance.js";
import { type Carried, carriedCases, carriedErrors, carrying } from "./carried.js";
import { featureRun, newPromises } from "./feature.js";
import { caseDefects, caseFiles, fileCases, PLAN, planEntries } from "./links.js";
import { type PlanRequirement, planError, planRequirements, readPlan } from "./plans.js";
import {
  GENESIS,
  HELD,
  heldCases,
  heldRecord,
  heldSkips,
  label,
  projectedCases,
  type Skip,
  skipped,
  sources,
} from "./projection.js";
import {
  CHANGE,
  dataOf,
  derivedFrom,
  HELD_EVIDENCE,
  type Result,
  runTrusted,
  snapshot,
  successorErrors,
  unreplayable,
} from "./regression.js";
import { entriesIn, entryAt, entryBytes } from "./state.js";

/**
 * The next regression, derived from the accepted one, never restated by hand.
 * Feature adds, Acceptance removes, Regression projects: R(n+1) protects what
 * the accepted regression protects, less exactly what the candidate explicitly
 * gives up in the acceptance records it adds, with what the candidate newly
 * promises and demonstrates; and it projects the evidence that demonstrates
 * it. The evidence it inherits is the accepted regression's own, held as it
 * was admitted, which the candidate's own testing, whatever it does with its
 * own cases, neither replaces nor removes: each held case not given up is
 * replayed against the candidate, and carried into the next regression as it
 * is. Evidence of the candidate's own enters beside it only as admitted: a case
 * demonstrating a new promise, one testing a recorded defect, or one that
 * holds against the accepted code, so no candidate's own output is its only
 * judge. Both states are plain directories, read from their files alone. What
 * the regression is for KAAL is stated in
 * brain/learning/genesis/26/09/29/04/nodes/testing.md.
 */

/** A commitment a regression requires, by its place, with what shows it. */
export type Required = { place: string; shownBy: string[] };

/**
 * A case of a regression, by its address, with the commitments it helps prove
 * of those the regression requires: once regressions hold evidence, as held by
 * a change; before, as the candidate's own testing carries it, with the suites
 * it belongs to.
 */
export type Held = { change?: string; file: string; title: string; places: string[]; suites?: string[] };

/**
 * The protection a regression carries: the commitments it requires and what
 * shows each, the suites that serve its plan, the sets of conditions and the
 * proof other than cases it requires, the data it hands its cases, and the
 * cases it projects, found from the evidence it holds through their links, as
 * any plan's are, never listed by it.
 */
export type Protection = {
  commitments: Required[];
  suites: string[];
  conditions: Conditions[];
  proof: Record<string, Conditions[]>;
  data?: string;
  /** What the data holds, entry by entry, as the regression's identity reads it. */
  dataHeld?: string;
  cases: Held[];
};

/** Sorted, once each. */
const sorted = (values: string[]) => [...new Set(values)].sort();
/** Whether `state` holds evidence its regression projects, as every regression does once one has. */
const holdsEvidence = (state: string) => sources(state).some((s) => s.change);
/** The addresses of a candidate's own cases that did not pass as the next regression, which the successor checks already refuse. */
const refused = (inventory: { cases: { file: string; title: string }[]; results: Result[] }) => {
  const passed = new Set(inventory.results.filter((r) => r.outcome === "pass").map((r) => `${r.file}\0${r.name}`));
  return new Set(inventory.cases.map((c) => `${c.file}\0${c.title}`).filter((at) => !passed.has(at)));
};
/** Cases in the order of where they are held and their addresses, so a regression's cases are the same however they were found. */
const ordered = (cases: Held[]) =>
  [...cases].sort((a, b) => {
    const [x, y] = [`${a.change ?? ""}\0${a.file}\0${a.title}`, `${b.change ?? ""}\0${b.file}\0${b.title}`];
    return x < y ? -1 : x > y ? 1 : 0;
  });

/** What a plan's text says shows the commitment at `place`, every entry for it together: its cases where it says nothing. */
function shownBy(plan: string, place: string): string[] {
  return sorted(
    planEntries(plan)
      .filter((e) => e.place === place)
      .flatMap((e) => e.shownBy ?? ["its cases"]),
  );
}

/** A state's Regression Plan as its sections are read, or nothing where it has none. */
const planText = (state: string) =>
  fs.existsSync(path.join(state, PLAN))
    ? `\n${fs.readFileSync(path.join(state, PLAN), "utf8").replace(/\r\n/g, "\n")}`
    : "";

/** What a state's Regression Plan says runs read of it; nothing where it has no plan. */
function planSettings(state: string): Pick<Protection, "conditions" | "proof" | "data" | "dataHeld"> {
  if (!fs.existsSync(path.join(state, PLAN)) || planError(state, PLAN)) return { conditions: [], proof: {} };
  const { conditions, proof, data } = readPlan(state, PLAN);
  return { conditions, proof, ...(data === undefined ? {} : { data, dataHeld: digest(path.join(state, data)) }) };
}

/** What is at `at`, or under it, every entry by its path and as the regression's identity reads it, as one digest. */
function digest(at: string): string {
  const hash = createHash("sha256");
  const walk = (dir: string | Buffer, rel: string) => {
    for (const { name, at: below } of entriesIn(dir).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const entry = entryAt(below);
      if (!entry) continue;
      const bytes = entryBytes(entry);
      const file = Buffer.from(`${rel}${name}`, "utf8");
      hash.update(`${file.length}:`).update(file).update(`${bytes.length}:`).update(bytes);
      if (entry.kind === "directory") walk(below, `${rel}${name}/`);
    }
  };
  const entry = entryAt(at);
  if (entry?.kind === "directory") walk(at, "");
  else if (entry) hash.update(`${entry.kind}:`).update(entryBytes(entry));
  return hash.digest("hex");
}

/** The cases `state` projects, each with only the commitments of `commitments` it names, less those `keep` does not. */
function projected(state: string, commitments: Set<string>, keep: (c: Held) => boolean = () => true): Held[] {
  return projectedCases(state).flatMap(({ source, cases }) =>
    cases
      .map((c) => ({
        ...(source.change ? { change: source.change } : {}),
        file: c.file,
        title: c.title,
        places: sorted(c.places.filter((p) => commitments.has(p))),
      }))
      .filter(keep),
  );
}

/**
 * The protection `state`'s own regression carries, as it would stand as the
 * accepted regression with nothing given up: what its plan requires, as KAAL
 * reads any plan's requirements, and every case it projects. Whether its links
 * hold is the links check's to say; where what its plan requires cannot be read
 * at all, why.
 */
export function protectionOf(state: string): { protection: Protection; errors: string[] } {
  let requires: PlanRequirement[] = [];
  const errors: string[] = [];
  if (fs.lstatSync(path.join(state, PLAN), { throwIfNoEntry: false }))
    try {
      requires = planRequirements(state, PLAN);
    } catch (e) {
      errors.push(`${state}: ${e instanceof Error ? e.message : String(e)}`);
    }
  const commitments = requires.filter((r) => r.kind === "commitment").map((r) => r.name);
  const suites = sorted(requires.filter((r) => r.kind === "suite").map((r) => r.name));
  const text = planText(state);
  let cases: Held[] = [];
  try {
    cases = ordered(
      holdsEvidence(state)
        ? projected(state, new Set(commitments))
        : carriedCases(state, () => true, new Set(commitments), new Set(suites)),
    );
  } catch (e) {
    errors.push(`${state}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return {
    protection: {
      commitments: sorted(commitments).map((place) => ({ place, shownBy: shownBy(text, place) })),
      suites,
      ...(errors.length ? { conditions: [], proof: {} } : planSettings(state)),
      cases,
    },
    errors,
  };
}

/**
 * The next regression derived from `accepted` for `candidate`: the accepted
 * protection less what the acceptance records the candidate adds give up, as
 * Acceptance reads them, with each commitment the candidate newly promises, as
 * Feature reads them, that the candidate's own cases demonstrate. The inherited
 * commitments keep what the accepted plan says shows them, and a new one is
 * shown by its cases. The conditions, the proof other than cases and the data
 * are the accepted plan's, as they were: nothing gives them up, and nothing
 * adds to them. Its cases are the ones the accepted regression projects, less
 * those given up; what of the candidate's own enters beside them is the
 * projection's to say. New promises are demonstrated by the Feature Plan's run
 * of the candidate's own cases against the candidate: a promise whose cases
 * all passed, and nothing else. With why the derivation cannot be made, if it
 * cannot.
 */
export function nextRegression(
  accepted: string,
  candidate: string,
): { protection: Protection; promises: string[]; demonstrated: string[]; errors: string[] } {
  const stated = acceptedExclusions(accepted, candidate);
  const kept = acceptedProtection(accepted, stated.accepted);
  const errors = [...stated.errors, ...kept.errors];
  const { promises, errors: unstated } = newPromises(accepted, candidate);
  errors.push(...unstated);
  // Only runs of the candidate's own cases against it show what it newly promises; a promise no case of it proves, or
  // one whose case did not pass, is not demonstrated, and does not enter the regression.
  let demonstrated: string[] = [];
  if (promises.length && !unstated.length) {
    // In a copy of the candidate, as every run of its cases is, so nothing they write reaches the state judged; the copy
    // is removed once they have run, whatever came of it.
    let copy: string | undefined;
    try {
      copy = snapshot(candidate);
      const { run } = featureRun({ accepted, candidate: copy });
      const judged = evidence(
        promises.map((p) => ({ name: `commitment: ${p}`, under: [] })),
        [
          {
            conditions: run.conditions as Conditions,
            unaccounted: run.unaccounted.length,
            shown: Object.fromEntries(
              (run.requirements ?? []).map((r) => [`${r.kind}: ${r.name}`, r.observations.map((o) => o.observed)]),
            ),
          },
        ],
      );
      demonstrated = promises.filter(
        (p) => judged.requirements.find((r) => r.name === `commitment: ${p}`)?.under[0]?.verdict === "held",
      );
    } catch (e) {
      errors.push(
        `${candidate}: its new promises cannot be demonstrated: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      if (copy) fs.rmSync(path.dirname(copy), { recursive: true, force: true });
    }
  }
  const inherited = kept.requires.filter((r) => r.kind === "commitment").map((r) => r.name);
  const commitments = new Set([...inherited, ...demonstrated]);
  const suites = new Set(kept.requires.filter((r) => r.kind === "suite").map((r) => r.name));
  const given = (c: Held) =>
    stated.accepted.some(
      (a) => "case" in a.exclusion && a.exclusion.case.file === c.file && a.exclusion.case.title === c.title,
    );
  const text = planText(accepted);
  let cases: Held[] = [];
  try {
    // Once regressions hold evidence, the next one's cases are what the accepted one projects, less those given up;
    // before, they were the candidate's own, carrying each inherited case, and each demonstrating a new promise.
    cases = ordered(
      holdsEvidence(accepted) || holdsEvidence(candidate)
        ? projected(accepted, commitments, (c) => !given(c))
        : carrying(
            carriedCases(accepted, (c) => !given(c), commitments, suites),
            carriedCases(accepted, given, commitments, suites),
            carriedCases(candidate, () => true, commitments, suites),
            new Set(demonstrated),
          ),
    );
  } catch (e) {
    errors.push(`${accepted}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return {
    protection: {
      commitments: [
        ...sorted(inherited).map((place) => ({ place, shownBy: shownBy(text, place) })),
        ...sorted(demonstrated).map((place) => ({ place, shownBy: ["its cases"] })),
      ].sort((a, b) => (a.place < b.place ? -1 : a.place > b.place ? 1 : 0)),
      suites: sorted([...suites]),
      ...planSettings(accepted),
      cases,
    },
    promises,
    demonstrated,
    errors,
  };
}

/** Sets of conditions as the sets they are, in no order. */
export const asSets = (sets: Conditions[]) => [...new Set(sets.map((set) => canonical(set)))].sort();
/** What a plan says runs read of it, each set of conditions in no order. */
const settings = (p: Protection) => ({
  conditions: asSets(p.conditions),
  proof: Object.fromEntries(Object.entries(p.proof).map(([name, under]) => [name, asSets(under)])),
  data: p.data === undefined ? null : { place: p.data, held: p.dataHeld ?? null },
});

/** Values the same once written the same way, whatever order their keys were written in. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );

/**
 * Why `own`, what a candidate's own Regression Plan requires, is not what the
 * regression derived for it requires, if it is not: the same commitments, each
 * shown as the derivation says, the same suites, conditions, proof and data,
 * and nothing more, since once accepted it would be protection inherited
 * without having entered. Which cases show them is the projection's to say,
 * never the candidate's own testing.
 */
export function planErrors(derived: Protection, own: Protection, promises: string[]): string[] {
  const errors: string[] = [];
  const derivedPlaces = new Set(derived.commitments.map((c) => c.place));
  const ownPlaces = new Set(own.commitments.map((c) => c.place));
  for (const { place } of derived.commitments.filter((c) => !ownPlaces.has(c.place)))
    errors.push(
      promises.includes(place)
        ? `${place}: newly promised and demonstrated, but the candidate's regression does not require it`
        : `${place}: inherited, and no acceptance record gives it up, but the candidate's regression no longer requires it`,
    );
  for (const { place } of own.commitments.filter((c) => !derivedPlaces.has(c.place)))
    errors.push(
      promises.includes(place)
        ? `${place}: newly promised but not demonstrated, so it cannot enter the regression`
        : `${place}: the candidate's regression requires it, but it is neither inherited nor newly promised`,
    );
  for (const { place, shownBy: was } of derived.commitments) {
    const is = own.commitments.find((c) => c.place === place)?.shownBy;
    if (is && canonical(is) !== canonical(was))
      errors.push(`${place}: the regression shows it by ${was.join(", ")}, but the candidate's by ${is.join(", ")}`);
  }
  for (const suite of derived.suites.filter((s) => !own.suites.includes(s)))
    errors.push(
      `${suite}: serves the regression, and no acceptance record gives it up, but no longer serves the candidate's`,
    );
  for (const suite of own.suites.filter((s) => !derived.suites.includes(s)))
    errors.push(
      `${suite}: serves the candidate's regression, but nothing newly promised brings it into the regression`,
    );
  const [ownSettings, derivedSettings] = [settings(own), settings(derived)];
  for (const key of ["conditions", "proof", "data"] as const)
    if (canonical(ownSettings[key]) !== canonical(derivedSettings[key]))
      errors.push(
        key === "data" && own.data !== undefined && own.data === derived.data
          ? `${PLAN}: its data, ${own.data}, hold other than the regression's, which nothing gives up or adds to`
          : `${PLAN}: its ${key} are ${canonical(own[key] ?? null)}, but the regression's are ${canonical(derived[key] ?? null)}, which nothing gives up or adds to`,
      );
  return errors;
}

/**
 * The evidence one change holds in the next regression: each path it holds,
 * a case file or test data, with where its bytes come from, which of them are
 * test data, and the cases held there that are no longer projected.
 */
export type HeldChange = { change: string; files: { rel: string; from: string }[]; data: string[]; skips: Skip[] };

/** A change's name, as the branch it is collected from names it: lowercase words joined by single hyphens. */
const CHANGE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether `a` and `b`, entries at the same path in two states, hold the same, as the regression's identity reads them. */
const same = (a: string, b: string) => digest(a) === digest(b);

/**
 * The evidence the next regression derived from `accepted` for `candidate`
 * projects, change by change. What the accepted regression projects is
 * carried as it is held, byte for byte: each case an acceptance record the
 * candidate adds gives up is held skipped, a case file every case of which is
 * skipped is no longer held, and a change holding no case file any more is
 * not either. The evidence of a regression that held none yet, its own
 * testing, is carried as held by `genesis`. Given `change`, the candidate's own
 * evidence is admitted to that change's: each of its case files whose bytes no
 * evidence carried holds at its path, with its test data, so long as the
 * change does not already hold that path, or test data other than the
 * candidate's. A case of it is projected only where something other than the
 * candidate's own output judges it: it demonstrates a promise `demonstrated`,
 * tests a defect the candidate records, or holds against the accepted code.
 * Any other case of it is held skipped. Every promise demonstrated must be
 * shown by a case projected. With what is not admitted, and why the projection
 * cannot be derived, if it cannot.
 */
export function projection(
  accepted: string,
  candidate: string,
  demonstrated: string[],
  change?: string,
): { held: HeldChange[]; notes: string[]; errors: string[] } {
  const stated = acceptedExclusions(accepted, candidate);
  const errors = [...stated.errors];
  const notes: string[] = [];
  const givenUp = (file: string, title: string) =>
    stated.accepted.find(
      (a) => "case" in a.exclusion && a.exclusion.case.file === file && a.exclusion.case.title === title,
    )?.record;
  const held: HeldChange[] = [];
  for (const source of sources(accepted)) {
    const name = source.change ?? GENESIS;
    const cases = heldCases(accepted, source);
    const skips = [...heldSkips(source)];
    for (const c of cases) {
      const record = givenUp(c.file, c.title);
      if (record && !skipped(skips, c.file, c.title))
        skips.push({ file: c.file, title: c.title, because: `given up by ${record}` });
    }
    // A file holding no case is kept, as the replay runs it, holding whatever tests it runs without naming.
    const files = caseFiles(accepted, source.root).filter((file) => {
      const own = cases.filter((c) => c.file === file);
      return !own.length || own.some((c) => !skipped(skips, c.file, c.title));
    });
    if (!files.length) {
      notes.push(
        `${label(source) || `${accepted}: `}every case it held is given up, so its evidence is no longer held`,
      );
      continue;
    }
    const data = dataOf(source.root).map(([rel]) => rel);
    held.push({
      change: name,
      files: [...files, ...data].map((rel) => ({ rel, from: source.root })),
      data,
      skips: skips.filter((s) => files.includes(s.file)),
    });
  }
  const promised = new Set(demonstrated);
  if (change !== undefined) admit(change);
  // A promise enters with its evidence, or not at all: once accepted, nothing else would show it.
  for (const promise of promised) {
    const shown = held.some((h) =>
      h.files.some(
        ({ rel, from }) =>
          !h.data.includes(rel) &&
          fileCases(rel, fs.readFileSync(path.join(from, rel), "utf8")).some(
            (c) => c.places.includes(promise) && !skipped(h.skips, c.file, c.title),
          ),
      ),
    );
    if (!shown)
      errors.push(
        `${promise}: newly promised and demonstrated, but no evidence the regression projects shows it; hold the candidate's with npm run regression:derive -- <accepted> <candidate> --change <name>`,
      );
  }
  return { held, notes, errors };

  function admit(name: string) {
    if (!CHANGE_NAME.test(name)) {
      errors.push(`${name}: not a change's name, which is lowercase words joined by single hyphens`);
      return;
    }
    const carried = (file: string) =>
      held.some((h) =>
        h.files.some(({ rel, from }) => rel === file && same(path.join(from, rel), path.join(candidate, file))),
      );
    let collector = held.find((h) => h.change === name);
    const admitting: string[] = [];
    for (const file of caseFiles(candidate)) {
      if (carried(file)) continue;
      if (collector?.files.some(({ rel }) => rel === file)) {
        notes.push(`${file}: ${name} already holds evidence at this path, so the candidate's is not admitted`);
        continue;
      }
      admitting.push(file);
    }
    if (!admitting.length) return;
    const data = dataOf(candidate).map(([rel]) => rel);
    if (collector) {
      const other = collector.data.filter((rel) => {
        const from = collector!.files.find((f) => f.rel === rel)!.from;
        return !data.includes(rel) || !same(path.join(from, rel), path.join(candidate, rel));
      });
      if (other.length) {
        notes.push(
          `${name}: holds test data (${other.join(", ")}) other than the candidate's, so none of the candidate's evidence is admitted to it`,
        );
        return;
      }
    }
    // What judges each case of the candidate's own, other than its own output: a new promise it demonstrates, a defect
    // it records that the case tests, or the accepted code, which it must hold against.
    const cases = admitting.flatMap((file) => fileCases(file, fs.readFileSync(path.join(candidate, file), "utf8")));
    const nth = (i: number) =>
      cases.slice(0, i).filter((d) => d.file === cases[i]!.file && d.title === cases[i]!.title).length;
    const defects = caseDefects(candidate);
    const recorded = (i: number) => {
      // The n-th case read at an address is the n-th read there with its defects: both read the file the same way.
      const own = defects.filter((d) => d.file === cases[i]!.file && d.title === cases[i]!.title)[nth(i)];
      return (own?.defects ?? []).some(
        (d) => fs.lstatSync(path.join(candidate, d, "defect.md"), { throwIfNoEntry: false })?.isFile() === true,
      );
    };
    const railed = cases.map((c, i) => !c.places.some((p) => promised.has(p)) && !recorded(i));
    let holds: boolean[] = cases.map(() => false);
    if (railed.some(Boolean)) {
      const code = snapshot(accepted, candidate);
      try {
        const results = runTrusted(candidate, code, (file) => admitting.includes(file));
        holds = cases.map(
          (c, i) => results.filter((r) => r.file === c.file && r.name === c.title)[nth(i)]?.outcome === "pass",
        );
      } finally {
        fs.rmSync(path.dirname(code), { recursive: true, force: true });
      }
    }
    const skips: Skip[] = [];
    cases.forEach((c, i) => {
      if (!railed[i] || holds[i] || skipped(skips, c.file, c.title)) return;
      skips.push({
        file: c.file,
        title: c.title,
        because:
          "not admitted: it does not hold against the accepted code, and neither demonstrates a new promise nor tests a recorded defect, so nothing but the candidate's own output judges it",
      });
    });
    const files = admitting.filter((file) => cases.some((c) => c.file === file && !skipped(skips, c.file, c.title)));
    for (const file of admitting.filter((f) => !files.includes(f)))
      notes.push(`${file}: none of its cases is admitted, so it is not held`);
    if (!files.length) return;
    if (!collector) {
      collector = { change: name, files: [], data: [], skips: [] };
      held.push(collector);
      held.sort((a, b) => (a.change < b.change ? -1 : a.change > b.change ? 1 : 0));
    }
    const added = data.filter((rel) => !collector!.data.includes(rel));
    collector.files.push(...[...files, ...added].map((rel) => ({ rel, from: candidate })));
    collector.data.push(...added);
    collector.skips.push(...skips.filter((s) => files.includes(s.file)));
  }
}

/** Writes `held`, the evidence a regression projects, into `state`, in place of any it held. */
export function writeProjection(state: string, held: HeldChange[]): void {
  const dir = path.join(state, CHANGE);
  // Staged outside the state first: the evidence written may come from the very change it replaces.
  const staged = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-projection-"));
  try {
    for (const h of held) {
      const root = path.join(staged, h.change, HELD_EVIDENCE);
      for (const { rel, from } of h.files) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.cpSync(path.join(from, rel), path.join(root, rel), { recursive: true, verbatimSymlinks: true });
      }
      fs.writeFileSync(path.join(root, HELD), heldRecord(h.change, h.skips));
    }
    for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : [])
      fs.rmSync(path.join(dir, name, HELD_EVIDENCE), { recursive: true, force: true });
    for (const h of held) {
      fs.mkdirSync(path.join(dir, h.change), { recursive: true });
      fs.cpSync(path.join(staged, h.change, HELD_EVIDENCE), path.join(dir, h.change, HELD_EVIDENCE), {
        recursive: true,
        verbatimSymlinks: true,
      });
    }
    // A change holding nothing any more leaves no directory of its own behind.
    for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : [])
      if (!fs.readdirSync(path.join(dir, name)).length) fs.rmSync(path.join(dir, name), { recursive: true });
    if (fs.existsSync(dir) && !fs.readdirSync(dir).length) fs.rmSync(dir, { recursive: true });
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
}

/** What `held` would hold for its change once written, as one digest. */
function heldDigest(held: HeldChange): string {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-projected-"));
  try {
    writeProjection(scratch, [held]);
    return digest(path.join(scratch, CHANGE, held.change, HELD_EVIDENCE));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Why the evidence `candidate` holds is not what the next regression derived
 * for it projects, if it is not: it must hold exactly that, byte for byte,
 * since once accepted it is what judges every later candidate. The change the
 * candidate admits its own evidence to is whichever it holds otherwise than
 * carried; it may admit to one only. A candidate holding no evidence of a
 * regression that holds none either is judged as every regression was before
 * any projected evidence: by its own testing.
 */
export function projectionErrors(accepted: string, candidate: string, demonstrated: string[]): string[] {
  const at = (name: string) => path.join(candidate, CHANGE, name, HELD_EVIDENCE);
  const own = fs.lstatSync(path.join(candidate, CHANGE), { throwIfNoEntry: false })?.isDirectory()
    ? fs.readdirSync(path.join(candidate, CHANGE)).filter((name) => fs.existsSync(at(name)))
    : [];
  // Before any regression held evidence, each projected its own testing: a candidate of one that holds none, holding
  // none itself, is judged as every regression then was. Once either holds evidence, the candidate holds what is
  // projected, and no later one returns to projecting its own.
  if (!own.length && !sources(accepted).some((s) => s.change)) return [];
  const carried = projection(accepted, candidate, demonstrated);
  const admitting = own.filter((name) => {
    const was = carried.held.find((h) => h.change === name);
    return !was || heldDigest(was) !== digest(at(name));
  });
  if (admitting.length > 1)
    return [
      `${CHANGE}: holds evidence of ${admitting.join(", ")} other than the regression projects; a candidate admits its own to one change only`,
    ];
  const derived = admitting.length ? projection(accepted, candidate, demonstrated, admitting[0]) : carried;
  const errors = [...derived.errors];
  for (const name of [...new Set([...derived.held.map((h) => h.change), ...own])].sort()) {
    const want = derived.held.find((h) => h.change === name);
    const where = `${CHANGE}/${name}/${HELD_EVIDENCE}`;
    if (want && !own.includes(name))
      errors.push(`${where}: the regression projects it, but the candidate does not hold it`);
    else if (!want) errors.push(`${where}: held, but the regression projects nothing of it`);
    else if (heldDigest(want) !== digest(at(name)))
      errors.push(
        `${where}: not the evidence the regression projects, byte for byte; derive it with npm run regression:derive -- <accepted> <candidate>${admitting.includes(name) ? ` --change ${name}` : ""}`,
      );
  }
  return errors;
}

/**
 * Everything that stops `candidate` from being accepted over the accepted
 * regression `trusted`, whose identity is `base`: it could not judge the next
 * candidate once accepted; its plan names another regression as the one it was
 * derived from; it does not hold the accepted protection less what it gives
 * up, as Acceptance judges, every case the accepted regression projects and no
 * record gives up replayed against it; its plan does not require what the next
 * regression derived for it requires; or it does not hold the evidence the
 * next regression projects.
 */
export function regressionErrors(trusted: string, candidate: string, base: string): string[] {
  // No trusted case would judge nothing and accept everything, so that is refused.
  const unfaithful = unreplayable(trusted);
  if (unfaithful) return [unfaithful];
  let projects: number;
  try {
    projects = projectedCases(trusted).reduce((n, { cases }) => n + cases.length, 0);
  } catch (e) {
    return [`${trusted}: ${e instanceof Error ? e.message : String(e)}`];
  }
  if (!projects)
    return [
      holdsEvidence(trusted)
        ? "the accepted regression projects no case it can name, so nothing could judge the candidate"
        : "the accepted regression's npm test runs no case it can name, so nothing could judge the candidate",
    ];
  const { errors: successor, inventory } = successorErrors(candidate);
  const derived = derivedFrom(planText(candidate));
  const provenance =
    derived === base ? [] : [`${PLAN}: derived from ${derived ?? "nothing"}, not from the accepted regression ${base}`];
  const next = nextRegression(trusted, candidate);
  const own = protectionOf(candidate);
  return [
    ...new Set([
      ...successor,
      ...provenance,
      ...acceptance(trusted, candidate).errors,
      ...next.errors,
      // A regression that cannot be read from the candidate's files, which the checks above say why, carries nothing.
      ...(own.errors.length ? [] : planErrors(next.protection, own.protection, next.promises)),
      ...(next.errors.length || own.errors.length
        ? []
        : holdsEvidence(trusted) || holdsEvidence(candidate)
          ? projectionErrors(trusted, candidate, next.demonstrated)
          : carriedErrors(next.protection.cases as Carried[], own.protection.cases as Carried[], refused(inventory))),
    ]),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--change");
  const change = at < 0 ? undefined : args[at + 1];
  const [accepted, candidate = ".", ...rest] = at < 0 ? args : [...args.slice(0, at), ...args.slice(at + 2)];
  if (!accepted || rest.length || accepted.startsWith("-") || (at >= 0 && !change)) {
    console.error("usage: next-regression.ts <accepted-state> [candidate-state] [--change <name>]");
    process.exitCode = 2;
  } else {
    try {
      const next = nextRegression(accepted, candidate);
      const own = protectionOf(candidate);
      const projected = next.errors.length ? undefined : projection(accepted, candidate, next.demonstrated, change);
      // The evidence the next regression projects is written into the candidate as derived, never by hand.
      if (projected && !projected.errors.length) writeProjection(candidate, projected.held);
      const errors = [
        ...next.errors,
        ...own.errors,
        ...(own.errors.length ? [] : planErrors(next.protection, own.protection, next.promises)),
        ...(projected?.errors ?? []),
      ];
      console.log(
        JSON.stringify(
          {
            ...next,
            held: projected?.held.map((h) => ({
              change: h.change,
              files: h.files.map((f) => f.rel).filter((rel) => !h.data.includes(rel)),
              data: h.data,
              skips: h.skips,
            })),
            notes: projected?.notes ?? [],
            errors,
          },
          null,
          2,
        ),
      );
      if (errors.length) process.exitCode = 1;
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
