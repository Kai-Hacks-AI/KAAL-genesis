import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { kaalInstanceRequirements, kaalTestCases, testPlanProtecting } from "../../scripts/test-cases.js";
import { instanceId, observeConditions, unmet, verdict } from "../../skills/testing/scripts/testing.js";
import {
  ENVIRONMENT,
  environmentConditions,
  environmentOf,
  observeEnvironment,
  runPlanInEnvironment,
} from "./environment.js";

// The Environment Extension, shown on the host that executes this file and on no other. Nothing here fakes an
// operating system: the oracle for the host is the operating system's own name, which is not what the Extension reads.
const CORE = "change/execution-environments/26/10/01/01/test/core-executes.test.ts";
const HOST = ({ Linux: "linux", Windows_NT: "windows" } as Record<string, string | undefined>)[os.type()];

test("the host observation is translated to KAAL's environment on the host that executes", () => {
  assert.equal(observeEnvironment(), HOST);
  assert.deepEqual(environmentConditions(), HOST ? { [ENVIRONMENT]: HOST } : {});
});

test("a platform KAAL names no environment for provides none, and no spelling of a provider's is an environment", () => {
  assert.equal(environmentOf("darwin"), undefined);
  assert.equal(environmentOf("constructor"), undefined);
  assert.equal(environmentOf("windows"), undefined);
});

test("Testing alone provides no environment, so the Extension is what supplies it", () => {
  assert.ok(!Object.hasOwn(observeConditions(), ENVIRONMENT));
  const supplied = { ...observeConditions(), ...environmentConditions() };
  assert.equal(supplied[ENVIRONMENT], HOST);
});

test("a Run receiving the condition performs the #158 instance required under the executing environment, and only it", () => {
  const { cases, errors } = kaalTestCases();
  assert.deepEqual(errors, []);
  const plan = testPlanProtecting(
    cases,
    "requirement",
    ["linux-support", "windows-support"],
    kaalInstanceRequirements().required,
  );
  assert.ok(!("errors" in plan));
  const required = plan.instances.map(instanceId);
  assert.deepEqual(required, [`${CORE}[environment=linux]`, `${CORE}[environment=windows]`]);
  // Each instance is unmet by what Testing observes alone, the condition this Extension supplies is what meets it.
  for (const instance of plan.instances)
    assert.deepEqual(unmet(instance.parameters, observeConditions()), [ENVIRONMENT]);

  // The Plan file sits inside the working directory: its path is read relative to the testing root, which must be that directory.
  const dir = fs.mkdtempSync(path.join(".", ".environment-plan-"));
  try {
    const file = path.join(dir, "plan.md");
    fs.writeFileSync(file, plan.plan);
    const run = runPlanInEnvironment(file.split(path.sep).join("/"), ".");
    assert.equal(run.facts[ENVIRONMENT], HOST);
    if (!HOST) {
      assert.deepEqual(run.observations, []);
      assert.deepEqual(run.unrun.map((u) => u.case).sort(), required);
      return;
    }
    const mine = `${CORE}[environment=${HOST}]`;
    const other = required.filter((id) => id !== mine);
    assert.equal(other.length, 1);
    assert.deepEqual(
      run.observations.map((o) => [o.case, o.passed, o.passed ? "" : o.output]),
      [[mine, true, ""]],
    );
    // The other environment is not faked: it stays unrun, so this Run is incomplete and never shows the Plan alone.
    assert.deepEqual(
      run.unrun.map((u) => u.case),
      other,
    );
    assert.equal(verdict(run), "incomplete");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("the provider's spelling and the environment stop at the Extension: Testing's own code names no environment", () => {
  const extension = fs.readFileSync("extensions/environment/environment.ts", "utf8");
  assert.match(extension, /win32/);
  for (const file of fs
    .readdirSync("skills/testing/scripts")
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
    const source = fs.readFileSync(path.join("skills/testing/scripts", file), "utf8");
    assert.doesNotMatch(source, /win32|\bwindows\b|\blinux\b|environment\s*[=:]/i, file);
  }
  // The generic Test Case names none either, and the Extension imports only the Skill it composes.
  assert.doesNotMatch(fs.readFileSync(CORE, "utf8"), /process\.platform|win32/);
  const imports = [...extension.matchAll(/from\s*"(\.[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(imports, ["../../skills/testing/scripts/testing.js"]);
});
