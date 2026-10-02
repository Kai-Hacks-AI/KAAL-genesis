import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runExperiment } from "./experiment.js";

const USAGE =
  "usage: run.ts --host <dir> --instruction <file> --evidence <dir> [--capability <name>]... [--timeout <seconds>] -- <agent command> [args...]";

/** Performs a Run and prints where it was retained and what the child did. Exits 0 when the Run was retained, whatever the child did. */
export function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      host: { type: "string" },
      instruction: { type: "string" },
      evidence: { type: "string" },
      capability: { type: "string", multiple: true },
      timeout: { type: "string" },
    },
  });
  if (!values.host || !values.instruction || !values.evidence || positionals.length === 0) {
    console.error(USAGE);
    return 2;
  }
  try {
    const run = runExperiment({
      host: values.host,
      instruction: fs.readFileSync(values.instruction, "utf8"),
      evidence: values.evidence,
      agent: positionals,
      capabilities: values.capability,
      timeoutSeconds: values.timeout === undefined ? undefined : Number(values.timeout),
    });
    const { outcome, changes } = run;
    console.log(`Run retained in ${values.evidence}`);
    console.log(`host ${run.host.digest}`);
    console.log(
      `child ${outcome.timedOut ? "timed out" : outcome.spawnError ? `did not start (${outcome.spawnError})` : `exit ${outcome.exitCode ?? outcome.signal}`}`,
    );
    console.log(
      `changed ${changes.added.length} added, ${changes.modified.length} modified, ${changes.removed.length} removed`,
    );
    if (!run.host.unchangedAfterRun) console.log("host changed during the Run");
    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main(process.argv.slice(2));
