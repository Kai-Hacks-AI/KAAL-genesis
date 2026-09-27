import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { type Observation, observe, type Report } from "../skills/testing/scripts/observe.js";
import { caseFiles, repoCases } from "./links.js";
import { execute, type Positioned } from "./regression.js";

/**
 * KAAL's runs of cases. A test run executes something testing can run, a
 * case, a suite or a plan; what a test run is, is the testing skill's. KAAL
 * runs cases, and this is how it does so, from files alone: both states are
 * directories, and nothing here asks Git or GitHub. What it means for KAAL is
 * stated in brain/learning/genesis/26/09/27/05/nodes/run.md.
 *
 * A run of cases executes the cases a testing state selects, found and
 * addressed as KAAL reads its cases, where they are kept, so they reach the
 * code they import there; the tested state is handed to them, so a case about
 * a state judges that one. A run keeps no record of itself: it is returned,
 * and whoever started it may keep or report it.
 */

export type Run = {
  /** The state that supplied what was run: here, its cases and their test data. */
  testing: string;
  /** The state those cases were handed as what they test. */
  tested: string;
  /** What the run was executed under, where it can change what is observed: measured, and given by whoever started it. */
  conditions: Record<string, string>;
  /** One observation for each case the run was to reach, here every case the testing state selects: passed, failed, or not run. */
  observations: Observation[];
  /** What the executor reported that no case of the testing state accounts for, such as a file that did not run as a whole. */
  unaccounted: Report[];
};

/**
 * Carries out a run of `testing`'s cases against `tested`, by default the
 * testing state itself. `conditions` are those whoever starts the run knows
 * and the run cannot measure, such as how the files were checked out; the
 * platform and runtime are measured, and refused if given.
 */
export function testRun({
  testing,
  tested = testing,
  conditions = {},
}: {
  testing: string;
  tested?: string;
  conditions?: Record<string, string>;
}): Run {
  const measured = { platform: process.platform, runtime: `node ${process.version}` };
  for (const key of Object.keys(conditions).filter((k) => Object.hasOwn(measured, k)))
    throw new Error(`${key}: a run measures it, so it cannot be given`);
  for (const state of [testing, tested])
    if (!fs.statSync(state, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${state}: not a directory`);
  // A run executes only cases its testing state holds: a case file its npm test names outside it, by its path or
  // through a link, is refused, never run as if the state supplied it.
  const root = fs.realpathSync(testing);
  const files = caseFiles(testing);
  for (const file of files) {
    const at = path.relative(root, fs.realpathSync(path.join(testing, file)));
    if (!at || at === ".." || at.startsWith(`..${path.sep}`) || path.isAbsolute(at))
      throw new Error(`${file}: a case file outside the testing state ${testing}`);
    // Reached through a link, a case file is reported where the link leads, not at its address in the testing state.
    if (at !== path.normalize(file)) throw new Error(`${file}: a case file reached through a link`);
  }
  const cases = repoCases(testing).map(({ file, title }) => ({ file, title }));
  const results = execute(testing, files, tested, true);
  // A file that does not run as a whole is reported under its own path, at its first line and column; a case titled
  // with its file's path is reported where it is declared, which is there too only when the file declares a case on its
  // first line, as the testing state's source shows. None of such a file's cases' reports can be relied on, so none is
  // observed, and the file's own report observes none of the testing state's cases.
  const startsWithCase = (file: string) =>
    /^test\(/.test(fs.readFileSync(path.join(testing, file), "utf8").split(/\r?\n/, 1)[0] ?? "");
  // Reported there and failed, it is the file's own even beside such a case: a file's own report is never a pass, and
  // a case the file never got to declare was not run.
  const whole = (r: Positioned) =>
    r.name.split("\\").join("/") === r.file &&
    r.line === 1 &&
    r.column === 1 &&
    (r.outcome === "fail" || !startsWithCase(r.file));
  const broken = new Set(results.filter(whole).map((r) => r.file));
  const report = (r: Positioned): Report => ({
    file: r.file,
    title: r.name,
    // A todo case's body runs: reported as a skip, it held.
    outcome: r.outcome === "fail" ? "failed" : r.outcome === "pass" || r.todo ? "passed" : "skipped",
  });
  // A failure the runner does not say came from executing the case, such as one cancelled before it started, or a hook
  // around it failing, did not exercise its claim: the case was not run, and the failure is kept apart, so it still
  // fails the run. A hook that fails after the case ran leaves it not run too: no evidence, never a pass.
  const unexercised = (r: Positioned) =>
    r.outcome === "fail" &&
    (r.failureType === undefined || ["cancelledByParent", "hookFailed"].includes(r.failureType));
  const { observations, unaccounted } = observe(
    cases,
    // An unexercised report still holds its case's place, so a later case at the same address gets its own report.
    results
      .filter((r) => !broken.has(r.file))
      .map((r) => (unexercised(r) ? { ...report(r), outcome: "skipped" as const } : report(r))),
  );
  return {
    testing: path.resolve(testing),
    tested: path.resolve(tested),
    conditions: { ...measured, ...conditions },
    observations,
    // A file's own report is named by the file's address in the testing state, which the runner writes natively.
    unaccounted: [
      ...unaccounted,
      ...results.filter((r) => !broken.has(r.file) && unexercised(r)).map(report),
      ...results.filter(whole).map((r) => ({ ...report(r), title: r.file })),
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [testing, tested, ...rest] = process.argv.slice(2);
  if (!testing || rest.length) {
    console.error("usage: run.ts <testing-state> [tested-state]");
    process.exitCode = 2;
  } else {
    try {
      const run = testRun({ testing, tested });
      console.log(JSON.stringify(run, null, 2));
      // A run fails when a case failed or something ran that no case accounts for; a case not run is not evidence, which
      // is for whoever reads the run to judge, not a failure of the run.
      if (run.unaccounted.length || run.observations.some((o) => o.observed === "failed")) process.exitCode = 1;
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
