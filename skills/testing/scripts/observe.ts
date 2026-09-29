/**
 * What a test run observed of each case its testing state holds, from what
 * whatever executed them reported. A case is named by its address within the
 * testing state: where it is kept and its title. An executor's report is not
 * yet an observation: a skipped case was not run, so it proves nothing, and a
 * case with no report was not run either. A report no case of the testing
 * state accounts for observes nothing about its cases, so it is returned apart.
 * Nothing here depends on how the cases were executed.
 */

export type Address = { file: string; title: string };
export type Report = Address & { outcome: "passed" | "failed" | "skipped" };
export type Observation = Address & { observed: "passed" | "failed" | "not run" };

/**
 * One observation for each of `cases`, in their order, and the reports none
 * accounts for. Reports are matched to cases one to one, in order, so two
 * cases at one address need two reports.
 */
export function observe(cases: Address[], reports: Report[]): { observations: Observation[]; unaccounted: Report[] } {
  const left = [...reports];
  const observations = cases.map(({ file, title }): Observation => {
    const i = left.findIndex((r) => r.file === file && r.title === title);
    const report = i < 0 ? undefined : left.splice(i, 1)[0];
    const observed = !report || report.outcome === "skipped" ? "not run" : report.outcome;
    return { file, title, observed };
  });
  return { observations, unaccounted: left };
}
