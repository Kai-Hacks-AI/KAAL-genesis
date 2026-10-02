import { pathToFileURL } from "node:url";
import { report, runArguments, verdict } from "../../skills/testing/scripts/testing.js";
import { runPlanInEnvironment } from "./environment.js";

// Makes the Run of the Plan at <plan>, read with its Suites from the current directory, against [candidate], by
// default the current directory too, under the conditions Testing observes and the environment this host is: the
// instances under the other environments stay unrun. It prints exactly what `testing/scripts/run.ts` prints, so the
// report is one Testing reads back, and exits as it does: 0 only when the Plan holds, 1 when it does not, 3 when the
// Run is incomplete, which a Run of one environment is when the Plan requires another. What several such Runs
// show together is Testing's evidence, `testing/scripts/evidence.ts`, and never this Run's exit status. A candidate
// identity the caller states with `--candidate-identity` is kept with the Run as given: what the candidate is, as
// distinct from where it executed, is the caller's to state and to realize.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = runArguments(process.argv.slice(2));
  if (!args) {
    console.error("usage: run.ts <plan> [candidate] [--candidate-identity <identity>]");
    process.exitCode = 2;
  } else {
    try {
      const run = runPlanInEnvironment(args.plan, ".", args.candidate, args.candidateIdentity);
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
