import { pathToFileURL } from "node:url";
import { report, runPlan, verdict } from "./testing.js";

// Runs the Plan at <plan>, read with its Suites from the current directory,
// against [candidate], by default the current directory too. Prints the Run,
// the output of every Case that did not pass and the conditions of every Case
// that did not apply. Exits 0 only when the Plan holds, 1 when it does not, and
// 3 when the Run is incomplete: nothing it executed failed, but a Case did not
// apply under its conditions.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [plan, candidate, ...rest] = process.argv.slice(2);
  if (!plan || rest.length) {
    console.error("usage: run.ts <plan> [candidate]");
    process.exitCode = 2;
  } else {
    try {
      const run = runPlan(plan, ".", candidate);
      for (const o of run.observations.filter((o) => !o.passed)) console.error(`--- ${o.case}\n${o.output}`);
      for (const i of run.inapplicable) {
        const needs = i.under.map((u) => `${u.dimension} ${u.values.join(" | ")}`).join(", ");
        console.error(
          `--- ${i.case}\nnot executed: it applies only under ${needs}; this Run observed ${run.conditions}`,
        );
      }
      console.log(report(run));
      const shown = verdict(run);
      if (shown !== "holds") process.exitCode = shown === "does not hold" ? 1 : 3;
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
