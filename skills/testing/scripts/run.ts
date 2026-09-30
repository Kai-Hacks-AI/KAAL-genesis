import { pathToFileURL } from "node:url";
import { report, runPlan } from "./testing.js";

// Runs the Plan at <plan>, read with its Suites from the current directory,
// against [candidate], by default the current directory too. Prints the Run
// and the output of every Case that did not pass; fails unless the Plan holds.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [plan, candidate, ...rest] = process.argv.slice(2);
  if (!plan || rest.length) {
    console.error("usage: run.ts <plan> [candidate]");
    process.exitCode = 2;
  } else {
    try {
      const run = runPlan(plan, ".", candidate);
      for (const o of run.observations.filter((o) => !o.passed)) console.error(`--- ${o.case}\n${o.output}`);
      console.log(report(run));
      if (!run.holds) process.exitCode = 1;
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
