import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { type Conditions, evidence } from "../skills/testing/scripts/plan.js";
import { acceptance, acceptedExclusions, acceptedProtection } from "./acceptance.js";
import { featureRun, newPromises } from "./feature.js";
import { type Case, caseSuites, PLAN, planEntries, repoCases } from "./links.js";
import { type PlanRequirement, planError, planRequirements, readPlan } from "./plans.js";
import { derivedFrom, successorErrors, unreplayable } from "./regression.js";

/**
 * The next regression, derived from the accepted one, never restated by hand:
 * R(n+1) is what the accepted regression protects, less exactly what the
 * candidate explicitly gives up in the acceptance records it adds, with what
 * the candidate newly promises and demonstrates. Both states are plain
 * directories, read from their files alone. The candidate's own regression is
 * what judges the next candidate once it is accepted, so it must carry the
 * derived regression exactly: nothing inherited left out that no record gives
 * up, nothing new let in that the candidate did not newly promise and
 * demonstrate. Once accepted, the candidate is the accepted regression the
 * same derivation starts from next. What the regression is for KAAL is stated
 * in brain/learning/genesis/26/09/28/06/nodes/testing.md.
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
function planSettings(state: string): Pick<Protection, "conditions" | "proof" | "data"> {
  if (!fs.existsSync(path.join(state, PLAN)) || planError(state, PLAN)) return { conditions: [], proof: {} };
  const { conditions, proof, data } = readPlan(state, PLAN);
  return { conditions, proof, ...(data === undefined ? {} : { data }) };
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
    try {
      const { run } = featureRun({ accepted, candidate });
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
    }
  }
  const inherited = kept.requires.filter((r) => r.kind === "commitment").map((r) => r.name);
  const commitments = new Set([...inherited, ...demonstrated]);
  const suites = new Set(kept.requires.filter((r) => r.kind === "suite").map((r) => r.name));
  const keptCase = (c: { file: string; title: string }) =>
    kept.cases.some((k) => k.file === c.file && k.title === c.title);
  const proving = new Set(demonstrated);
  const text = planText(accepted);
  return {
    protection: {
      commitments: [
        ...sorted(inherited).map((place) => ({ place, shownBy: shownBy(text, place) })),
        ...sorted(demonstrated).map((place) => ({ place, shownBy: ["its cases"] })),
      ].sort((a, b) => (a.place < b.place ? -1 : a.place > b.place ? 1 : 0)),
      suites: sorted([...suites]),
      ...planSettings(accepted),
      cases: byAddress([
        ...heldCases(accepted, keptCase, commitments, suites),
        ...heldCases(
          candidate,
          // Each case by its own links: one at the same address as a case demonstrating a promise is not that case.
          (c) => c.places.some((p) => proving.has(p)),
          commitments,
          suites,
        ),
      ]),
    },
    promises,
    demonstrated,
    errors,
  };
}

/** Sets of conditions as the sets they are, in no order. */
const asSets = (sets: Conditions[]) => [...new Set(sets.map((set) => canonical(set)))].sort();
/** What a plan says runs read of it, each set of conditions in no order. */
const settings = (p: Protection) => ({
  conditions: asSets(p.conditions),
  proof: Object.fromEntries(Object.entries(p.proof).map(([name, under]) => [name, asSets(under)])),
  data: p.data ?? null,
});

/** Values the same once written the same way, whatever order their keys were written in. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );

/**
 * Why `own`, a candidate's own regression, does not carry `derived`, the
 * regression derived for it, exactly, if it does not. It requires the same
 * commitments, each shown as the derivation says, the same suites, conditions,
 * proof and data, and keeps every case the derivation holds at its address,
 * still helping prove each commitment and belonging to each suite the
 * derivation says it does. A case the candidate adds that helps prove what its
 * regression requires is part of it through that link, as any case is: that
 * adds testing to protection the regression already has, never protection.
 */
export function carriedErrors(derived: Protection, own: Protection, promises: string[]): string[] {
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
        `${PLAN}: its ${key} are ${canonical(own[key] ?? null)}, but the regression's are ${canonical(derived[key] ?? null)}, which nothing gives up or adds to`,
      );
  // Cases are matched one to one, so two cases at one address need two. At each address the derived cases are paired
  // with the candidate's by a complete matching that keeps every relation, found whatever order either lists them in;
  // only what no such pairing can keep is reported.
  const keeps = (d: Held, o: Held) =>
    d.places.every((p) => o.places.includes(p)) && d.suites.every((s) => o.suites.includes(s));
  const addresses = [...new Set(derived.cases.map((c) => `${c.file}\0${c.title}`))];
  for (const address of addresses) {
    const at = (c: Held) => `${c.file}\0${c.title}` === address;
    const ds = derived.cases.filter(at);
    const os = own.cases.filter(at);
    // Each derived case's partner among the candidate's, as a matching grown by augmenting paths.
    const partner: (number | undefined)[] = os.map(() => undefined);
    const assign = (d: number, seen: Set<number>): boolean =>
      os.some((o, k) => {
        if (seen.has(k) || !keeps(ds[d]!, o)) return false;
        seen.add(k);
        if (partner[k] === undefined || assign(partner[k]!, seen)) return ((partner[k] = d), true);
        return false;
      });
    const kept = new Set(ds.flatMap((_, d) => (assign(d, new Set()) ? [d] : [])));
    // What is left unkept is paired with what the candidate has left at the address, if anything, and its losses said.
    const spare = os.filter((_, k) => partner[k] === undefined);
    ds.forEach((c, d) => {
      if (kept.has(d)) return;
      const name = `${c.file}: ${JSON.stringify(c.title)}`;
      const is = spare.shift();
      if (!is) {
        errors.push(
          `${name}: in the regression, and no acceptance record excludes it, but the candidate no longer has it`,
        );
        return;
      }
      for (const place of c.places.filter((p) => !is.places.includes(p)))
        errors.push(`${name}: helps prove ${place} in the regression, but no longer does in the candidate's`);
      for (const suite of c.suites.filter((s) => !is.suites.includes(s)))
        errors.push(`${name}: belongs to ${suite} in the regression, but no longer does in the candidate's`);
    });
  }
  return errors;
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
  const successor = successorErrors(candidate).errors;
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
      ...(own.errors.length ? [] : carriedErrors(next.protection, own.protection, next.promises)),
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
      const next = nextRegression(accepted, candidate);
      const own = protectionOf(candidate);
      const errors = [...next.errors, ...own.errors, ...carriedErrors(next.protection, own.protection, next.promises)];
      console.log(JSON.stringify({ ...next, errors }, null, 2));
      if (errors.length) process.exitCode = 1;
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
