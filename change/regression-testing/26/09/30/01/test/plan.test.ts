// Testing runs a Plan against a candidate and holds only when every Case passes.
// The candidate is this Case's working directory, and its testing skill is
// used the way a user uses it: through `skills/testing/scripts/run.ts`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const RUN = path.resolve("skills/testing/scripts/run.ts");

/** A testing root holding `plan.json`, which collects one Suite holding `cases`. */
function testingRoot(cases: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "regression-testing-"));
  fs.mkdirSync(path.join(root, "suite"));
  fs.writeFileSync(path.join(root, "plan.json"), JSON.stringify({ concern: "Scratch.", suites: ["suite"] }));
  fs.writeFileSync(path.join(root, "suite", "suite.json"), JSON.stringify({ concern: "Scratch." }));
  for (const [name, body] of Object.entries(cases)) fs.writeFileSync(path.join(root, "suite", name), body);
  return root;
}

const run = (root: string) =>
  spawnSync(process.execPath, [...process.execArgv, RUN, "plan.json"], { cwd: root, encoding: "utf8" });

const PASSES = 'import test from "node:test";\ntest("passes", () => {});\n';
const FAILS = 'import test from "node:test";\ntest("fails", () => { throw new Error("no"); });\n';

test("a Plan whose collected Cases all pass holds", () => {
  const result = run(testingRoot({ "a.test.mjs": PASSES, "b.test.mjs": PASSES }));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\npass suite\/a\.test\.mjs\npass suite\/b\.test\.mjs\nholds\n$/);
});

test("a failing Case, or a Case that runs no test, keeps the Plan from holding", () => {
  for (const failing of [FAILS, "// no test\n"]) {
    const result = run(testingRoot({ "a.test.mjs": PASSES, "b.test.mjs": failing }));
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\npass suite\/a\.test\.mjs\nfail suite\/b\.test\.mjs\ndoes not hold\n$/);
  }
});
