import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { kaalInstanceRequirements } from "../../../../../../../../scripts/test-cases.js";
import { candidate } from "../../../../../../26/09/26/01/test/candidate.js";

// What KAAL asserts per environment is KAAL's own accepted meaning: the decisions that require a Requirement to be
// shown under an environment, read from the record's repository, never from the state judged. What is judged is the
// candidate's check definitions, which are provider specific: a check is a named job, and the words below (workflow,
// job, matrix, step) are the realization's, never the Requirement's. A check asserts under an environment when what it
// runs is KAAL's tests, which those decisions require to hold under it, so that is the link read here.
// The record's own repository: this Case lives eight directories beneath it.
const RECORD = fileURLToPath(new URL("../../../../../../../../", import.meta.url));
const ENVIRONMENT_WORD = /^(linux|windows|macos)$/i;
const RUNS_KAAL_TESTS = /^npm (run )?test(\s|$)/;

type Job = { name?: unknown; strategy?: { matrix?: { include?: Record<string, unknown>[] } }; steps?: { run?: unknown }[] };

/** The names a job's check takes: its `name` once for each combination of its matrix, with `matrix.<key>` filled in. */
function namesOf(job: Job): string[] {
  if (typeof job.name !== "string") return [];
  const combinations = job.strategy?.matrix?.include ?? [{}];
  return combinations.map((values) =>
    job.name === undefined
      ? ""
      : (job.name as string).replace(/\$\{\{\s*matrix\.(\w+)\s*\}\}/g, (_, key: string) => String(values[key] ?? "")),
  );
}

const runsKaalTests = (job: Job): boolean =>
  (job.steps ?? []).some((step) => typeof step.run === "string" && RUNS_KAAL_TESTS.test(step.run.trim()));

test(
  "an environment appears in a check's name only where the check runs KAAL's tests under an environment KAAL requires",
  { tests: { requirement: ["environment-in-check-name-only-where-asserted"] } },
  () => {
    const decisions = kaalInstanceRequirements(RECORD);
    assert.deepEqual(decisions.errors, []);
    const required = new Set(decisions.required.map((d) => d.parameters.environment).filter(Boolean));
    assert.ok(required.size > 0, "KAAL requires something under an environment");
    const dir = candidate(".github/workflows");
    const named: { name: string; environments: string[]; asserts: boolean }[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".yml"))) {
      const jobs = (YAML.parse(readFileSync(`${dir}/${file}`, "utf8")) as { jobs?: Record<string, Job> }).jobs ?? {};
      for (const job of Object.values(jobs))
        for (const name of namesOf(job))
          named.push({
            name,
            environments: name.split("-").filter((word) => ENVIRONMENT_WORD.test(word)).map((w) => w.toLowerCase()),
            asserts: runsKaalTests(job),
          });
    }
    assert.ok(named.length > 0, "the candidate defines checks to judge");
    const misnamed = named
      .filter((c) => c.environments.length > 0)
      .filter((c) => !c.asserts || c.environments.some((e) => !required.has(e)))
      .map((c) => c.name);
    assert.deepEqual(misnamed, []);
  },
);
