import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { type Conditions, evidence } from "../skills/testing/scripts/plan.js";
import { acceptance, acceptedExclusions, acceptedProtection } from "./acceptance.js";
import { featureRun, newPromises } from "./feature.js";
import { type Case, caseSuites, PLAN, planEntries, repoCases } from "./links.js";
import { type PlanRequirement, planError, planRequirements, readPlan } from "./plans.js";
import { address, type Change, evolution, pairing } from "./evolution.js";
import { derivedFrom, snapshot, successorErrors, unreplayable } from "./regression.js";
import { entriesIn, entryAt, entryBytes } from "./state.js";

/**
 * The next regression, derived from the accepted one, never restated by hand:
 * R(n+1) is what the accepted regression protects, less exactly what the
 * candidate explicitly gives up in the acceptance records it adds, with what
 * the candidate newly promises and demonstrates. Both states are plain
 * directories, read from their files alone. The candidate's own regression is
 * what judges the next candidate once it is accepted, so it must carry the
 * derived regression: nothing inherited left out that no record gives up, and
 * every way it demonstrates that protection otherwise, a change to the
 * protection definition shown preserved or strengthened, as
 * scripts/evolution.ts classifies it. FAR decides what is protected; evolution
 * decides only how it is demonstrated. Once accepted, the candidate is the
 * accepted regression the
 * same derivation starts from next. What the regression is for KAAL is stated
 * in brain/learning/genesis/26/09/29/04/nodes/testing.md.
 */

/** A commitment a regression requires, by its place, with what shows it. */
export type Required = { place: string; shownBy: string[] };

/** A case of a regression, by its address, with the commitments it helps prove and the suites it belongs to, of those the regression requires. */
export type Held = { file: string; title: string; places: string[]; suites: string[] };

/**
 * The protection a regression carries: the commitments it requires and what
 * shows each, the suites that serve its plan, the sets of conditions and the
 * proof other than cases it requires, the data it hands its cases, and its
 * cases, found from those through their links and memberships, as any plan's
 * are, never listed by it.
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
/** Cases in the order of their addresses, so a regression's cases are the same however they were found. */
const byAddress = (cases: Held[]) =>
  [...cases].sort((a, b) =>
    a.file !== b.file ? (a.file < b.file ? -1 : 1) : a.title < b.title ? -1 : a.title > b.title ? 1 : 0,
  );

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
  return { conditions, proof, ...(data === undefined ? {} : { data, dataHeld: held(path.join(state, data)) }) };
}

/** What is under `dir`, every entry by its path and as the regression's identity reads it, as one digest. */
function held(dir: string): string {
  const hash = createHash("sha256");
  const walk = (at: string | Buffer, rel: string) => {
    for (const { name, at: below } of entriesIn(at).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const entry = entryAt(below);
      if (!entry) continue;
      const bytes = entryBytes(entry);
      const file = Buffer.from(`${rel}${name}`, "utf8");
      hash.update(`${file.length}:`).update(file).update(`${bytes.length}:`).update(bytes);
      if (entry.kind === "directory") walk(below, `${rel}${name}/`);
    }
  };
  if (entryAt(dir)?.kind === "directory") walk(dir, "");
  return hash.digest("hex");
}

/** Each of `state`'s cases for which `keep` holds, with only the commitments and suites of `protection` it names. */
function heldCases(state: string, keep: (c: Case) => boolean, commitments: Set<string>, suites: Set<string>): Held[] {
  const joined = caseSuites(state);
  return repoCases(state).flatMap((c, i) =>
    keep(c)
      ? [
          {
            file: c.file,
            title: c.title,
            places: sorted(c.places.filter((p) => commitments.has(p))),
            suites: sorted((joined[i]?.suites ?? []).filter((s) => suites.has(s))),
          },
        ]
      : [],
  );
}

/**
 * The protection `state`'s own regression carries, as it would stand as the
 * accepted regression with nothing given up: what its plan requires, as KAAL
 * reads any plan's requirements, and all its cases. Whether its links hold is
 * the links check's to say; where what its plan requires cannot be read at
 * all, why.
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
  return {
    protection: {
      commitments: sorted(commitments).map((place) => ({ place, shownBy: shownBy(text, place) })),
      suites,
      ...(errors.length ? { conditions: [], proof: {} } : planSettings(state)),
      cases: byAddress(heldCases(state, () => true, new Set(commitments), new Set(suites))),
    },
    errors,
  };
}

/** Whether `c` keeps every link and membership `d` has. */
const keepsAll = (d: Held, c: Held) =>
  d.places.every((p) => c.places.includes(p)) && d.suites.every((s) => c.suites.includes(s));

/**
 * The cases of the next regression: each inherited case as the candidate
 * carries it, found by a complete matching at each address with a case of the
 * candidate keeping its every link and membership, so a case that comes to
 * prove a new promise too is carried once, as the case it is; each case of the
 * candidate demonstrating a new promise, with its links to what it
 * demonstrates and, back at the address of a case `given` up whose every link
 * and membership still held it keeps, with those; and each inherited case the
 * candidate does not carry, as it was, which the candidate is then held to.
 */
function carriedCases(inherited: Held[], given: Held[], candidate: Held[], proving: Set<string>): Held[] {
  const demonstrates = (c: Held) => c.places.some((p) => proving.has(p));
  const cases: Held[] = [];
  const carried = new Set<number>();
  for (const at of new Set(inherited.map(address))) {
    const is = inherited.filter((c) => address(c) === at);
    const slots = candidate.flatMap((c, k) => (address(c) === at ? [k] : []));
    // A case demonstrating a new promise carries an inherited one only where no other case at the address can, so a
    // demonstrating duplicate added beside the inherited case enters as the new case it is.
    const partner = pairing(
      is,
      slots,
      (c, k) => keepsAll(c, candidate[k]!),
      (k) => !demonstrates(candidate[k]!),
    );
    is.forEach((c, i) => {
      const k = partner[i] === undefined ? undefined : slots[partner[i]!];
      if (k === undefined) cases.push(c);
      // Carried with what it had, and a link to a new promise it came to prove: nothing else it gained enters with it.
      else {
        carried.add(k);
        cases.push({ ...c, places: sorted([...c.places, ...candidate[k]!.places.filter((p) => proving.has(p))]) });
      }
    });
  }
  // A case of the candidate's own enters as a case of what it newly promises, and as nothing else: a link to an
  // inherited commitment or a membership of an inherited suite is protection no new promise brought in. Only a case
  // given up and back at its address, keeping all the given-up case had that the regression still holds, keeps that:
  // it restores what the regression had, and adds nothing to it.
  const entering = candidate.filter((c, k) => !carried.has(k) && demonstrates(c));
  return [
    ...cases,
    ...[...new Set(entering.map(address))].flatMap((at) => {
      const back = given.filter((c) => address(c) === at);
      const here = entering.filter((c) => address(c) === at);
      const partner = pairing(here, back, (c, g) => keepsAll(g, c));
      return here.map((c, i) => {
        const was = partner[i] === undefined ? undefined : back[partner[i]!];
        const places = c.places.filter((p) => proving.has(p));
        return was
          ? { ...c, places: sorted([...places, ...was.places]), suites: was.suites }
          : { ...c, places, suites: [] };
      });
    }),
  ];
}

/**
 * The next regression derived from `accepted` for `candidate`: the accepted
 * protection less what the acceptance records the candidate adds give up, as
 * Acceptance reads them, with each commitment the candidate newly promises, as
 * Feature reads them, that the candidate's own cases demonstrate, together with
 * those cases. The inherited commitments keep what the accepted plan says shows
 * them, and a new one is shown by its cases. The conditions, the proof other
 * than cases and the data are the accepted plan's, as they were: nothing gives
 * them up, and nothing adds to them. New promises are demonstrated by the
 * Feature Plan's run of the candidate's own cases against the candidate: a
 * promise whose cases all passed, and nothing else. With why the derivation
 * cannot be made, if it cannot.
 */
export function nextRegression(
  accepted: string,
  candidate: string,
): { protection: Protection; inherited: Held[]; promises: string[]; demonstrated: string[]; errors: string[] } {
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
  const keptCase = (c: { file: string; title: string }) =>
    kept.cases.some((k) => k.file === c.file && k.title === c.title);
  const proving = new Set(demonstrated);
  const text = planText(accepted);
  const inheritedCases = heldCases(accepted, keptCase, commitments, suites);
  return {
    protection: {
      commitments: [
        ...sorted(inherited).map((place) => ({ place, shownBy: shownBy(text, place) })),
        ...sorted(demonstrated).map((place) => ({ place, shownBy: ["its cases"] })),
      ].sort((a, b) => (a.place < b.place ? -1 : a.place > b.place ? 1 : 0)),
      suites: sorted([...suites]),
      ...planSettings(accepted),
      cases: byAddress(
        carriedCases(
          inheritedCases,
          heldCases(accepted, (c) => !keptCase(c), commitments, suites),
          heldCases(candidate, () => true, commitments, suites),
          // Each case by its own links: one at the same address as a case demonstrating a promise is not that case.
          proving,
        ),
      ),
    },
    inherited: inheritedCases,
    promises,
    demonstrated,
    errors,
  };
}

/**
 * The next regression for `candidate` over `accepted`: the regression FAR
 * derives, with the changes to its protection definition the candidate's own
 * regression makes, each classified by Testing's protection evolution. Where
 * every change is preserved or strengthened, and FAR's derivation holds, the
 * candidate's own regression is the next regression: what it carries beyond
 * FAR's is approved evolution. Otherwise it has none, and the errors say why.
 * `refused` are the addresses of the candidate's cases that do not pass as the
 * next regression, which the successor checks already refuse.
 */
export function evolvedRegression(
  accepted: string,
  candidate: string,
  refused: Set<string> = new Set(),
): {
  derived: ReturnType<typeof nextRegression>;
  next?: Protection;
  changes: Change[];
  errors: string[];
  unread?: string[];
} {
  const derived = nextRegression(accepted, candidate);
  const own = protectionOf(candidate);
  // A regression that cannot be read from the candidate's files carries nothing: the checks of its links say why.
  if (own.errors.length) return { derived, changes: [], errors: derived.errors, unread: own.errors };
  const { changes, errors } = evolution(
    accepted,
    candidate,
    derived.protection,
    own.protection,
    derived.inherited,
    derived.promises,
    refused,
  );
  const all = [...derived.errors, ...errors];
  return { derived, ...(all.length ? {} : { next: own.protection }), changes, errors: all };
}

/**
 * Everything that stops `candidate` from being accepted over the accepted
 * regression `trusted`, whose identity is `base`: it could not judge the next
 * candidate once accepted; its plan names another regression as the one it was
 * derived from; it does not hold the accepted protection less what it gives
 * up, as Acceptance judges, every inherited case not excluded replayed against
 * it; or its own regression does not carry the next regression derived for it.
 */
export function regressionErrors(trusted: string, candidate: string, base: string): string[] {
  // No trusted case would judge nothing and accept everything, so that is refused.
  const unfaithful = unreplayable(trusted);
  if (unfaithful) return [unfaithful];
  if (!repoCases(trusted).length)
    return ["the accepted regression's npm test runs no case it can name, so nothing could judge the candidate"];
  const { errors: successor, inventory } = successorErrors(candidate);
  const passed = new Set(inventory.results.filter((r) => r.outcome === "pass").map((r) => `${r.file}\0${r.name}`));
  const refused = new Set(inventory.cases.map((c) => `${c.file}\0${c.title}`).filter((at) => !passed.has(at)));
  const derived = derivedFrom(planText(candidate));
  const provenance =
    derived === base ? [] : [`${PLAN}: derived from ${derived ?? "nothing"}, not from the accepted regression ${base}`];
  return [
    ...new Set([
      ...successor,
      ...provenance,
      ...acceptance(trusted, candidate).errors,
      ...evolvedRegression(trusted, candidate, refused).errors,
    ]),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [accepted, candidate = ".", ...rest] = process.argv.slice(2);
  if (!accepted || rest.length || accepted.startsWith("-")) {
    console.error("usage: next-regression.ts <accepted-state> [candidate-state]");
    process.exitCode = 2;
  } else {
    try {
      const evolved = evolvedRegression(accepted, candidate);
      const { derived, next, changes } = evolved;
      const errors = [...evolved.errors, ...(evolved.unread ?? [])];
      console.log(
        JSON.stringify(
          {
            promises: derived.promises,
            demonstrated: derived.demonstrated,
            derived: derived.protection,
            changes,
            next,
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
