import type { Address, Observation } from "./observe.js";

/**
 * Which cases a test suite reaches, and what a run of it observed of them. A
 * suite groups cases around a shared testing concern; it is named by the
 * place its using system states it in, and each case says which suites it
 * belongs to, so a suite never lists its cases and one case may belong to
 * several suites. Nothing here depends on where suites or cases are kept, or
 * on how cases are executed.
 */

/** A case of a testing state, by address, with the suites it says it belongs to. */
export type Member = Address & { suites: string[] };

/**
 * The cases of `cases` that belong to `suite`, in their order: none for a
 * suite no case belongs to yet, whose concern no case supplies proof for.
 */
export function members(suite: string, cases: Member[]): Address[] {
  return cases.filter((c) => c.suites.includes(suite)).map(({ file, title }) => ({ file, title }));
}

/**
 * What a run of `suite` observed, from `observations`, one for each of `cases`
 * in the same order: the observation of each case that belongs to the suite,
 * and of no other, whatever the others observed. A suite no case belongs to
 * observes nothing, which is no evidence, never success.
 */
export function reached(suite: string, cases: Member[], observations: Observation[]): Observation[] {
  if (
    observations.length !== cases.length ||
    observations.some((o, i) => o.file !== cases[i]!.file || o.title !== cases[i]!.title)
  )
    throw new Error("the observations are not of these cases, one for each, in their order");
  return observations.filter((_, i) => cases[i]!.suites.includes(suite));
}
