import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { planEvidence, readReport, type Outcomes } from "./testing.js";

// Reads the reports of several Runs of one Plan, as `run.ts` printed them, and
// prints what they show of it together: one line per Case, `pass`, `fail` or
// `unevidenced`, then `evidenced` or `not evidenced`. Exits 0 only when the Plan
// is evidenced. It checks that the reports collect the same Cases, and nothing
// about which candidate they judged or what they observed: that is for the
// caller to ensure. Where reports state candidate identities that are not all
// one, or only some state one, it says so on its error output and changes
// neither what it prints nor how it exits: what the Runs state is exposed here,
// and whether it is the candidate the caller requires is not Testing's to judge.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("usage: evidence.ts <run-report>...");
    process.exitCode = 2;
  } else {
    const runs: Outcomes[] = [];
    const errors: string[] = [];
    for (const file of files) {
      const read = readReport(fs.readFileSync(file, "utf8"));
      if (read.outcomes) runs.push(read.outcomes);
      errors.push(...read.errors.map((e) => `${file}: ${e}`));
    }
    const { evidence, errors: refused } = errors.length ? { evidence: undefined, errors } : planEvidence(runs);
    if (!evidence) {
      console.error(refused.join("\n"));
      process.exitCode = 1;
    } else {
      const stated = runs.map((r) => r.candidateIdentity);
      if (stated.some((id) => id !== undefined) && new Set(stated).size > 1)
        console.error(
          `note: the Runs do not state one candidate identity: ${[...new Set(stated.map((id) => id ?? "(none)"))].join(", ")}`,
        );
      console.log(
        [
          ...evidence.passed.map((c) => `pass ${c}`),
          ...evidence.failed.map((c) => `fail ${c}`),
          ...evidence.unevidenced.map((c) => `unevidenced ${c}`),
          evidence.evidenced ? "evidenced" : "not evidenced",
        ].join("\n"),
      );
      if (!evidence.evidenced) process.exitCode = 1;
    }
  }
}
