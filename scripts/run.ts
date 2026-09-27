import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { type Observation, observe, type Report } from "../skills/testing/scripts/observe.js";
import { members, reached } from "../skills/testing/scripts/suite.js";
import { caseFiles, caseSuites, ownedBySkill, repoCases, suiteError } from "./links.js";
import { execute, type Positioned } from "./regression.js";

/**
 * KAAL's runs of cases. A test run executes something testing can run, a
 * case, a suite or a plan; what a test run is, is the testing skill's. KAAL
 * runs cases, every case a state selects or a suite of them, and this is how
 * it does so, from files alone: both states are directories, and nothing here
 * asks Git or GitHub. What it means for KAAL is stated in
 * brain/learning/genesis/26/09/27/05/nodes/run.md, and what KAAL's suites are
 * in brain/learning/genesis/26/09/27/06/nodes/suite.md.
 *
 * A run of cases executes the cases a testing state selects, or those that
 * belong to one of its suites, found and addressed as KAAL reads its cases,
 * where they are kept, so they reach the code they import there; the tested
 * state is handed to them, so a case about a state judges that one. A run
 * keeps no record of itself: it is returned, and whoever started it may keep
 * or report it.
 */

export type Run = {
  /** The state that supplied what was run: here, its cases and their test data. */
  testing: string;
  /** The state those cases were handed as what they test. */
  tested: string;
  /** The suite run, by its place in the testing state, if the run was of a suite rather than of every case the state selects. */
  suite?: string;
  /** What the run was executed under, where it can change what is observed: measured, and given by whoever started it. */
  conditions: Record<string, string>;
  /** One observation for each case the run was to reach, every case the testing state selects or every case of its suite: passed, failed, or not run. */
  observations: Observation[];
  /** What the executor reported that no case of the testing state accounts for, such as a file that did not run as a whole. */
  unaccounted: Report[];
};

/**
 * Carries out a run of `testing`'s cases against `tested`, by default the
 * testing state itself; given a `suite`, by its place in the testing state, a
 * run of that suite, which reaches every case that belongs to it and no
 * other. `conditions` are those whoever starts the run knows and the run
 * cannot measure, such as how the files were checked out; the platform and
 * runtime are measured, and refused if given.
 */
export function testRun({
  testing,
  tested = testing,
  suite,
  conditions = {},
}: {
  testing: string;
  tested?: string;
  suite?: string;
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
  // The manifest that selects the cases is the testing state's own too: reached through a link, what runs would be
  // chosen by a file the run does not record.
  const manifest = path.join(testing, "package.json");
  if (fs.existsSync(manifest) && path.relative(root, fs.realpathSync(manifest)) !== "package.json")
    throw new Error("package.json: a manifest reached through a link");
  const files = caseFiles(testing);
  for (const file of files) {
    const at = path.relative(root, fs.realpathSync(path.join(testing, file)));
    if (!at || at === ".." || at.startsWith(`..${path.sep}`) || path.isAbsolute(at))
      throw new Error(`${file}: a case file outside the testing state ${testing}`);
    // Reached through a link, a case file is reported where the link leads, not at its address in the testing state.
    if (at !== path.normalize(file)) throw new Error(`${file}: a case file reached through a link`);
  }
  const cases = repoCases(testing).map(({ file, title }) => ({ file, title }));
  // A suite is one the testing state states, and reaches the cases that say they belong to it there, none if no case
  // belongs to it yet. Only their files
  // are executed; what the state's other cases report there is theirs, and observes none of the suite's.
  const joined = caseSuites(testing);
  if (suite !== undefined) {
    const wrong = suiteError(testing, suite);
    if (wrong) throw new Error(wrong);
    // A skill's case belongs to none of the state's suites, so the skill stays independent of it: a state where one says
    // it does is refused before anything runs, as its links check refuses it, never run as if the suite held it.
    for (const c of joined.filter((c) => ownedBySkill(c.file) && c.suites.length))
      throw new Error(`${c.file}: "${c.title}" is a skill's case, so it belongs to none of the state's suites`);
  }
  const reaching = suite === undefined ? files : [...new Set(members(suite, joined).map((c) => c.file))];
  const results = execute(testing, reaching, tested, true);
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
    outcome: r.outcome === "fail" ? "failed" : r.outcome === "pass" ? "passed" : "skipped",
  });
  // A failure the runner does not say came from executing the case, such as one cancelled before it started, or a hook
  // around it failing, did not exercise its claim: the case was not run, and the failure is kept apart, so it still
  // fails the run. A hook that fails after the case ran leaves it not run too: no evidence, never a pass.
  const unexercised = (r: Positioned) =>
    r.outcome === "fail" &&
    (r.failureType === undefined || ["cancelledByParent", "hookFailed"].includes(r.failureType));
  // An unexercised report still holds its case's place, so a later case at the same address gets its own report. It
  // stands in for the report only there: the report itself is kept apart once, as it was, below.
  const placeholders = new Set<Report>();
  const { observations, unaccounted } = observe(
    cases,
    results
      .filter((r) => !broken.has(r.file))
      .map((r) => {
        if (!unexercised(r)) return report(r);
        const placeholder: Report = { ...report(r), outcome: "skipped" };
        placeholders.add(placeholder);
        return placeholder;
      }),
  );
  return {
    testing: path.resolve(testing),
    tested: path.resolve(tested),
    ...(suite === undefined ? {} : { suite }),
    conditions: { ...measured, ...conditions },
    observations: suite === undefined ? observations : reached(suite, joined, observations),
    // A file's own report is named by the file's address in the testing state, which the runner writes natively.
    unaccounted: [
      ...unaccounted.filter((r) => !placeholders.has(r)),
      ...results.filter((r) => !broken.has(r.file) && unexercised(r)).map(report),
      ...results.filter(whole).map((r) => ({ ...report(r), title: r.file })),
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let args: { values: { suite?: string }; positionals: string[] } | undefined;
  try {
    args = parseArgs({ allowPositionals: true, options: { suite: { type: "string" } } });
  } catch {
    args = undefined; // An option it does not know, or --suite without a place.
  }
  const [testing, tested, ...rest] = args?.positionals ?? [];
  const values = args?.values ?? {};
  if (!args || !testing || rest.length) {
    console.error("usage: run.ts [--suite <place>] <testing-state> [tested-state]");
    process.exitCode = 2;
  } else {
    try {
      const run = testRun({ testing, tested, suite: values.suite });
      console.log(JSON.stringify(run, null, 2));
      // A run fails when a case failed or something ran that no case accounts for; a case not run is not evidence, which
      // is for whoever reads the run to judge, not a failure of the run. A run that observed no case pass, such as one
      // of a suite no case belongs to yet, is no evidence at all, so it is never reported as a success either.
      if (run.unaccounted.length || run.observations.some((o) => o.observed === "failed")) process.exitCode = 1;
      else if (!run.observations.some((o) => o.observed === "passed")) {
        console.error(`${run.suite ?? testing}: the run observed no case pass, so it is no evidence`);
        process.exitCode = 1;
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
