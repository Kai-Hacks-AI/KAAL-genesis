import { pathToFileURL } from "node:url";
import { report, verdict } from "../../skills/testing/scripts/testing.js";
import { runPlanInEnvironment } from "./environment.js";

// Makes the Run of the Plan at <plan>, read with its Suites from the current directory, against [candidate], by
// default the current directory too, under the conditions Testing observes and the environment this host is: the
// instances under the other environments stay unrun. It prints exactly what `testing/scripts/run.ts` prints, so the
// report is one Testing reads back, and exits as it does: 0 only when the Plan holds, 1 when it does not, 3 when the
// Run is incomplete, which a Run of one environment is when the Plan requires another. What several such Runs
// show together is Testing's evidence, `testing/scripts/evidence.ts`, and never this Run's exit status.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [plan, candidate, ...rest] = process.argv.slice(2);
  if (!plan || rest.length) {
    console.error("usage: run.ts <plan> [candidate]");
    process.exitCode = 2;
  } else {
    try {
      const run = runPlanInEnvironment(plan, ".", candidate);
      for (const o of run.observations.filter((o) => !o.passed)) console.error(`--- ${o.case}\n${o.output}`);
      for (const u of run.unrun) {
        const needs = Object.entries(u.parameters)
          .map(([name, value]) => `${name} ${value}`)
          .join(", ");
        console.error(`--- ${u.case}\nnot performed: it is under ${needs}; this Run observed ${run.conditions}`);
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
