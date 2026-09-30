import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { identity, readChanges, ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";
import { report, runPlan, type Run } from "../skills/testing/scripts/testing.js";

/**
 * KAAL's composition of Testing with Change. managing-change keeps Changes and
 * never interprets them; testing runs Plans of Suites and knows nothing of
 * Changes. This decides how they meet: a Change's Test Suite is its `test/`,
 * and each evolution `kaal/<lineage>` carries one Regression Test Plan,
 * `test/regression/<lineage>.json`, which collects the Test Suite of every
 * Change in `change/<lineage>/`. Collection only adds: nothing here removes
 * or replaces a Suite. The regression KAAL requires is every Plan there.
 */
export const PLANS = "test/regression";

/** Every Change-owned Test Suite beneath the repository, by lineage, in traversal order: `change/<lineage>/YY/MM/DD/CC/test`. */
export function changeSuites(repo = "."): Map<string, string[]> {
  const suites = new Map<string, string[]>();
  for (const change of readChanges(path.join(repo, CHANGE_ROOT)).changes) {
    const suite = `${CHANGE_ROOT}/${identity(change)}/test`;
    if (!fs.existsSync(path.join(repo, suite))) continue;
    suites.set(change.lineage, [...(suites.get(change.lineage) ?? []), suite]);
  }
  return suites;
}

/** Every Regression Test Plan in the repository by lineage, as its path relative to the repository. */
export function plans(repo = "."): Map<string, string> {
  const dir = path.join(repo, PLANS);
  if (!fs.existsSync(dir)) return new Map();
  return new Map(
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => [file.slice(0, -".json".length), `${PLANS}/${file}`]),
  );
}

/**
 * Every way the Plans fail to collect exactly the Test Suites the Changes of
 * their evolution own: a Suite no Plan collects, and a collected Suite that no
 * Change of that evolution owns. A Plan's own form is Testing's to check.
 */
export function collectionErrors(repo = "."): string[] {
  const errors: string[] = [];
  const owned = changeSuites(repo);
  const planned = plans(repo);
  for (const [lineage, suites] of owned) {
    if (!planned.has(lineage))
      errors.push(`${PLANS}/${lineage}.json: missing, so ${suites.join(", ")} is collected by no plan`);
  }
  for (const [lineage, plan] of planned) {
    let collected: unknown;
    try {
      collected = JSON.parse(fs.readFileSync(path.join(repo, plan), "utf8")).suites;
    } catch {
      continue;
    }
    if (!Array.isArray(collected)) continue;
    const suites = owned.get(lineage) ?? [];
    for (const suite of suites) if (!collected.includes(suite)) errors.push(`${plan}: does not collect ${suite}`);
    for (const suite of collected)
      if (!suites.includes(suite)) errors.push(`${plan}: collects ${suite}, which no Change of ${lineage} owns`);
  }
  return errors;
}

/**
 * Runs KAAL's regression: every Plan, against the repository as its own
 * testing root and candidate. Refuses before running anything if a Plan does
 * not collect exactly what its evolution's Changes own.
 */
export function runRegression(repo = "."): Run[] {
  const errors = collectionErrors(repo);
  if (errors.length) throw new Error(`refusing to run the regression:\n${errors.join("\n")}`);
  return [...plans(repo).values()].map((plan) => runPlan(plan, repo));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [repo = ".", ...rest] = process.argv.slice(2);
  if (rest.length) {
    console.error("usage: regression.ts [repo]");
    process.exitCode = 2;
  } else {
    try {
      for (const run of runRegression(repo)) {
        for (const o of run.observations.filter((o) => !o.passed)) console.error(`--- ${o.case}\n${o.output}`);
        console.log(`${report(run)}\n`);
        if (!run.holds) process.exitCode = 1;
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
