import type { Observation } from "./observe.js";

/**
 * Whether what runs of a test plan observed demonstrates what the plan
 * requires. A plan states a testing purpose: what must be shown, each
 * requirement named as its using system names it, such as a suite that serves
 * the plan, a commitment, or a proof other than cases, and under which sets of
 * conditions. Runs record what they reached of each requirement and the
 * conditions they had; the plan, not the runs, says whether that is enough.
 * Nothing here knows how any requirement is tested, or how runs are executed.
 */

/** Conditions by name, as a run records them and a plan requires them. */
export type Conditions = Record<string, string>;

/** What a plan requires shown, and the sets of conditions it must be shown under; none means under any. */
export type Requirement = { name: string; under: Conditions[] };

/** One run of a plan: the conditions it had, whether it kept anything apart, and what it observed of each requirement. */
export type PlanRun = {
  conditions: Conditions;
  unaccounted: number;
  shown: Record<string, Observation["observed"][]>;
};

export type Verdict = "held" | "failed" | "not demonstrated";

/**
 * Whether conditions a run recorded are ones a plan required: every condition
 * the plan names is recorded with its very value, or, for a version, one whose
 * value ends in a number, with that version further qualified by numbers, so
 * `node v22` is met by `node v22.22.2`, but `plain` is not met by `plain.2`.
 */
export function satisfies(recorded: Conditions, required: Conditions): boolean {
  return Object.entries(required).every(([name, value]) => {
    const had = Object.hasOwn(recorded, name) ? recorded[name] : undefined;
    if (had === undefined) return false;
    if (had === value) return true;
    return /\d$/.test(value) && had.startsWith(value) && /^(\.\d+)+$/.test(had.slice(value.length));
  });
}

/**
 * What `runs` demonstrate of `requirements`. Under each set of conditions it
 * is required under, a requirement failed if a run under them observed it
 * fail or kept something apart; it held if a run under them reached it and
 * observed every case it reached pass; otherwise it is not demonstrated, as
 * when no run had those conditions, it reached nothing, or what it reached was
 * not run. A plan is demonstrated only when every requirement held under every
 * set; one that requires nothing demonstrates nothing.
 */
export function evidence(
  requirements: Requirement[],
  runs: PlanRun[],
): { verdict: Verdict; requirements: { name: string; under: { conditions: Conditions; verdict: Verdict }[] }[] } {
  const judged = requirements.map(({ name, under }) => ({
    name,
    under: (under.length ? under : [{}]).map((conditions) => {
      const shown = runs.filter((r) => satisfies(r.conditions, conditions));
      const failed = shown.some((r) => r.unaccounted > 0 || (r.shown[name] ?? []).includes("failed"));
      const held = shown.some((r) => (r.shown[name] ?? []).length > 0 && r.shown[name]!.every((o) => o === "passed"));
      return { conditions, verdict: (failed ? "failed" : held ? "held" : "not demonstrated") as Verdict };
    }),
  }));
  const verdicts = judged.flatMap((r) => r.under.map((u) => u.verdict));
  const verdict: Verdict = verdicts.includes("failed")
    ? "failed"
    : verdicts.length && verdicts.every((v) => v === "held")
      ? "held"
      : "not demonstrated";
  return { verdict, requirements: judged };
}
