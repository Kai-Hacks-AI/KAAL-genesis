import fs from "node:fs";
import path from "node:path";
import { type Observation } from "../skills/testing/scripts/observe.js";
import { planEntries, repoCases, section } from "./links.js";
import { type Run, testRun } from "./run.js";

/**
 * KAAL's plan composition: a Plan composes reusable Suites (commitments) and
 * can be run without knowing the Cases that currently satisfy those Suites.
 * What a Test Plan is, is the testing skill's. This is how KAAL represents and
 * runs the Regression Plan as a composition of Suites.
 *
 * A Suite is a commitment that its cases prove together, identified by the
 * place where that commitment is stated. A Plan names the Suites it must
 * demonstrate, never the Cases directly. Cases are reached through the Suites
 * they help prove, so they can change beneath a Suite without changing the
 * Plan. A Suite may be required by several Plans.
 *
 * What a Plan is, is the testing skill's (skills/testing/SKILL.md). What it
 * means for KAAL is stated in
 * brain/learning/genesis/26/09/26/03/nodes/testing.md.
 */

/** A Suite a Plan requires: a commitment, identified by where it is stated. */
export type Suite = {
  /** The place where this commitment is stated — its identity across Plans. */
  place: string;
  /**
   * What the Plan says shows this commitment: "its cases", "the seal checks",
   * or both.
   */
  shownBy: string[];
};

/**
 * A Plan: states what testing must be carried out, naming Suites
 * (commitments) and required conditions, without enumerating Cases.
 * Cases are reached through the Suites they help prove at run time.
 */
export type Plan = {
  /** Path to the plan file, relative to the testing state. */
  path: string;
  /**
   * The Suites this Plan requires, in the Plan's order, each identified by the
   * place where the commitment is stated. Never a list of Cases: Cases are found
   * through the Suites they help prove, so changing which Cases belong to a Suite
   * requires no change to the Plan.
   */
  suites: Suite[];
  /**
   * The conditions under which every Suite must be demonstrated, as stated in
   * the Plan. Conditions remain at the Plan level: a Run records which conditions
   * one occurrence was executed under; satisfying the Plan's full set of
   * required conditions may take several Runs (e.g. one on Linux, one on Windows).
   */
  conditions: string[];
};

/** Observations of Cases that help prove one Suite in a Plan Run. */
export type SuiteRun = {
  /** Suite identity: the place where the commitment is stated. */
  place: string;
  /** What the Plan says shows this commitment, carried from the Plan. */
  shownBy: string[];
  /**
   * Observations of the Cases from this Run that point at this Suite through
   * their `// Why: <place>` links. Cases are not listed by the Plan; they are
   * found here through the links they hold in the testing state.
   */
  observations: Observation[];
};

/**
 * A Plan Run: one occurrence of running a Plan, resulting in a Run of the
 * Cases the Plan's Suites require. The Plan's required conditions are not
 * the Run's to enforce: a Run records which conditions it was executed under,
 * and whether those satisfy the Plan is for whoever reads the Run to say.
 */
export type PlanRun = {
  /** The Plan that was run. */
  plan: Plan;
  /** The underlying case Run: all cases the testing state holds, with what the run observed. */
  run: Run;
  /** Each Suite the Plan requires, with the observations of its Cases from this Run. */
  suites: SuiteRun[];
};

/**
 * Reads a Plan from its file within a testing state. Extracts Suites by the
 * place where each commitment is stated, and required conditions as stated in
 * the Plan. Never enumerates Cases: Cases are reached through Suites at run
 * time, so they can change without changing the Plan.
 */
export function readPlan(planPath: string, repo: string): Plan {
  const content = fs.readFileSync(path.join(repo, planPath), "utf8");
  const entries = planEntries(content);
  const conditions = [...section(content, "Conditions").matchAll(/^- (.+)$/gm)].map((m) => m[1]!);
  return {
    path: planPath,
    suites: entries.filter((e) => e.place !== undefined).map((e) => ({ place: e.place!, shownBy: e.shownBy ?? [] })),
    conditions,
  };
}

/**
 * Runs a Plan: executes the testing state's Cases through `testRun`, then
 * projects observations onto the Plan's Suites through each Case's `// Why:`
 * links.
 *
 * A Plan Run does not enumerate Cases: Cases are found at run time through
 * the `// Why: <place>` links they hold in the testing state, which name the
 * Suites they help prove. Changing which Cases belong to a Suite — adding or
 * removing a `// Why:` link — requires no change to the Plan.
 *
 * Conditions remain at the Plan level: they are what the Plan requires
 * demonstrated. The Run records which conditions this occurrence was executed
 * under. Satisfying the Plan's full required conditions may need several Runs
 * (e.g. one on Linux, one on Windows): a Plan Run is one such occurrence.
 */
export function planRun({
  plan,
  testing,
  tested = testing,
  conditions = {},
  cases: givenCases,
}: {
  plan: Plan;
  testing: string;
  tested?: string;
  conditions?: Record<string, string>;
  /**
   * Cases pre-read from the testing state, if already available. When
   * omitted, `repoCases(testing)` is called here. Providing it avoids a
   * second traversal when the caller has already read the cases (e.g. to
   * validate links before running).
   */
  cases?: ReturnType<typeof repoCases>;
}): PlanRun {
  const run = testRun({ testing, tested, conditions });
  const cases = givenCases ?? repoCases(testing);
  // `cases[i]` and `run.observations[i]` correspond to the same Case: `observe()`
  // matches reports to cases in order, one-to-one, so positional indexing is correct
  // even when two Cases share the same `file:title` address. A Map keyed by address
  // would silently drop the first of any two Cases at the same address.
  return {
    plan,
    run,
    suites: plan.suites.map(({ place, shownBy }) => ({
      place,
      shownBy,
      observations: run.observations.filter((_, i) => cases[i]?.places.includes(place)),
    })),
  };
}
