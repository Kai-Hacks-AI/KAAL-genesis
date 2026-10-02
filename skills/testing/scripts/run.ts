import { pathToFileURL } from "node:url";
import { report, runArguments, runPlan, verdict } from "./testing.js";

// Runs the Plan at <plan>, read with its Suites from the current directory,
// against [candidate], by default the current directory too, and states
// `--candidate-identity <identity>` with it when the caller says what the
// candidate is: Testing keeps that with the Run and never interprets it. Prints the Run,
// the output of every Case that did not pass and the parameters of every
// instance it left unrun. Exits 0 only when the Plan holds, 1 when it does not,
// and 3 when the Run is incomplete: nothing it performed failed, but a required
// instance is under parameters its conditions do not provide.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = runArguments(process.argv.slice(2));
  if (!args) {
    console.error("usage: run.ts <plan> [candidate] [--candidate-identity <identity>]");
    process.exitCode = 2;
  } else {
    try {
      const run = runPlan(args.plan, ".", args.candidate, args.candidateIdentity);
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
