// KAAL's regression collects every Test Suite a Change owns into the
// Regression Test Plan of the evolution the Change belongs to. The candidate
// is this Case's working directory; its regression is run the way KAAL runs
// it, through `scripts/regression.ts`, in a scratch repository.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const REGRESSION = path.resolve("scripts/regression.ts");

const SUITE = "change/some-evolution/26/09/30/01/test";

/** A scratch repository whose one Change owns a passing Test Suite, and its evolution's plan collecting `collected`. */
function repository(collected: string[] | undefined): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "regression-testing-"));
  fs.mkdirSync(path.join(repo, SUITE), { recursive: true });
  fs.writeFileSync(path.join(repo, SUITE, "suite.json"), JSON.stringify({ concern: "Scratch." }));
  fs.writeFileSync(path.join(repo, SUITE, "a.test.mjs"), 'import test from "node:test";\ntest("passes", () => {});\n');
  if (collected) {
    fs.mkdirSync(path.join(repo, "test", "regression"), { recursive: true });
    const plan = JSON.stringify({ concern: "Scratch.", suites: collected });
    fs.writeFileSync(path.join(repo, "test", "regression", "some-evolution.json"), plan);
  }
  return repo;
}

const run = (repo: string) =>
  spawnSync(process.execPath, [...process.execArgv, REGRESSION], { cwd: repo, encoding: "utf8" });

test("the regression runs the evolution's plan when it collects the Suite its Change owns", () => {
  const result = run(repository([SUITE]));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^plan test\/regression\/some-evolution\.json\n/);
  assert.match(result.stdout, /\npass change\/some-evolution\/26\/09\/30\/01\/test\/a\.test\.mjs\nholds\n/);
});

test("the regression refuses to run when a Change-owned Suite is collected by no plan", () => {
  for (const collected of [undefined, []]) {
    const result = run(repository(collected));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^refusing to run the regression:\n/);
    assert.doesNotMatch(result.stdout, /holds/);
  }
});
