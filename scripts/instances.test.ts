import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { birthChange } from "../skills/managing-change/scripts/birth.js";
import { createRequirement } from "../skills/managing-requirements/scripts/create.js";
import { instanceId, observeConditions, planInstances, readPlan, unmet } from "../skills/testing/scripts/testing.js";
import { REQUIREMENT_DIR } from "./requirements.js";
import {
  carrierPlaces,
  INSTANCE_DIR,
  kaalInstanceRequirements,
  kaalTestCases,
  requiredInstances,
  TEST_DIR,
  testPlanProtecting,
} from "./test-cases.js";

// KAAL decides which parameters a Requirement's instances are required under.
// A decision, kept in a Change's test/instances/, names a Requirement and parameters; the Test Case stays
// generic, Testing stays ignorant of every name, and the Requirement is untouched.
const CORE = "change/execution-environments/26/10/01/01/test/core-executes.test.ts";
const NO_GIT = "change/git-independence/26/10/01/01/test/no-git.test.ts";
const NO_GITHUB = "change/github-independence/26/10/01/01/test/no-github.test.ts";

const decision = (requirement: string, parameters: string, why = "Because.") =>
  `---\nrequirement: ${requirement}\nparameters:\n${parameters}\n---\n\n${why}\n`;

/** A repository with Requirements `r1`, `r2`, a Carrier of generic Test Cases and the decisions given. */
function repo(decisions: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-instances-"));
  const born = birthChange({ root: path.join(dir, "change"), lineage: "x", occurrence: "26/09/30/01" });
  for (const id of ["r1", "r2"]) createRequirement(path.join(born, REQUIREMENT_DIR), id, `${id} holds.`);
  fs.mkdirSync(path.join(born, TEST_DIR), { recursive: true });
  fs.writeFileSync(
    path.join(born, TEST_DIR, "a.test.ts"),
    'import test from "node:test";\n' +
      'test("generic", { tests: { requirement: ["r1", "r2"] } }, () => {});\n' +
      'test("other", { tests: { requirement: ["r2"] } }, () => {});\n',
  );
  fs.mkdirSync(path.join(born, TEST_DIR, INSTANCE_DIR));
  for (const [name, text] of Object.entries(decisions))
    fs.writeFileSync(path.join(born, TEST_DIR, INSTANCE_DIR, name), text);
  return dir;
}
const A = "change/x/26/09/30/01/test/a.test.ts";
const ids = (dir: string, req: string[], decisions = kaalInstanceRequirements(dir).required) => {
  const plan = testPlanProtecting(kaalTestCases(dir).cases, "requirement", req, decisions);
  assert.ok(!("errors" in plan));
  return plan.instances.map(instanceId);
};

test("KAAL's own decisions are valid and name the Requirements that exist", () => {
  assert.deepEqual(kaalInstanceRequirements().errors, []);
});

test("the four FAR-9 Requirements derive their required instances from accepted material", () => {
  const { cases, errors } = kaalTestCases();
  assert.deepEqual(errors, []);
  const { required } = kaalInstanceRequirements();
  const derived = (id: string) => {
    const plan = testPlanProtecting(cases, "requirement", [id], required);
    assert.ok(!("errors" in plan));
    return plan.instances.map(instanceId);
  };
  assert.deepEqual(derived("linux-support"), [`${CORE}[environment=linux]`]);
  assert.deepEqual(derived("windows-support"), [`${CORE}[environment=windows]`]);
  assert.deepEqual(derived("git-independence"), [NO_GIT]);
  assert.deepEqual(derived("github-independence"), [NO_GITHUB]);
  assert.deepEqual(
    ids(".", ["linux-support", "windows-support", "git-independence", "github-independence"]).sort(),
    [`${CORE}[environment=linux]`, `${CORE}[environment=windows]`, NO_GIT, NO_GITHUB].sort(),
  );
});

test("the derived Plan is a Plan Testing reads, requiring those instances and no other", () => {
  const { cases } = kaalTestCases();
  const plan = testPlanProtecting(
    cases,
    "requirement",
    ["linux-support", "windows-support", "git-independence"],
    kaalInstanceRequirements().required,
  );
  assert.ok(!("errors" in plan));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kaal-derived-")), "plan.md");
  fs.writeFileSync(file, plan.plan);
  const read = readPlan(file);
  assert.deepEqual(read.errors, []);
  assert.deepEqual(
    planInstances(read.plan!, []).map(instanceId).sort(),
    [NO_GIT, `${CORE}[environment=linux]`, `${CORE}[environment=windows]`].sort(),
  );
});

test("the Test Case stays generic and no decision is written into the Requirement or the Test Case", () => {
  const source = fs.readFileSync(CORE, "utf8");
  assert.doesNotMatch(source, /process\.platform|win32|environment\s*[=:]/);
  assert.match(source, /tests: \{ requirement: \["linux-support", "windows-support"\] \}/);
  for (const id of ["linux-support", "windows-support"])
    assert.doesNotMatch(
      fs.readFileSync(`change/requirements/26/09/30/02/requirement/${id}.md`, "utf8"),
      /platform|environment\s*[=:]|parameters/,
    );
});

test("one Test Case selected for Requirements under different parameters is one Test Case under each, and one under none for a Requirement no decision names", () => {
  const dir = repo({
    "r1.md": decision("r1", "  environment: linux"),
    "r1-again.md": decision("r1", "  environment: windows"),
  });
  assert.deepEqual(ids(dir, ["r1"]), [`${A}[environment=linux]`, `${A}[environment=windows]`]);
  // r2 names no decision, so the Carrier it shares is also required as it always was.
  assert.deepEqual(ids(dir, ["r1", "r2"]), [A, `${A}[environment=linux]`, `${A}[environment=windows]`]);
  assert.deepEqual(ids(dir, ["r2"]), [A]);
});

test("the same instance decided twice is one instance, and parameters order means nothing", () => {
  const dir = repo({
    "a.md": decision("r1", "  environment: linux\n  arch: x64"),
    "b.md": decision("r1", "  arch: x64\n  environment: linux"),
  });
  assert.equal(kaalInstanceRequirements(dir).required.length, 1);
  assert.deepEqual(ids(dir, ["r1"]), [`${A}[arch=x64,environment=linux]`]);
});

test("with no decision at all, derivation is exactly what it was", () => {
  const dir = repo({});
  assert.deepEqual(kaalInstanceRequirements(dir), { required: [], errors: [] });
  assert.deepEqual(ids(dir, ["r1", "r2"]), [A]);
  const { cases } = kaalTestCases(dir);
  const plan = testPlanProtecting(cases, "requirement", ["r1", "r2"]);
  assert.ok(!("errors" in plan));
  assert.deepEqual(plan.carriers, [A]);
  assert.doesNotMatch(plan.plan, /^\s+- \{ carrier/m);
});

test("a decision is refused when it names no Requirement, no parameters, a bad parameter or no reason", () => {
  const { errors } = kaalInstanceRequirements(
    repo({
      "unknown.md": decision("nope", "  environment: linux"),
      "none.md": "---\nrequirement: r1\n---\n\nBecause.\n",
      "empty.md": "---\nrequirement: r1\nparameters: {}\n---\n\nBecause.\n",
      "space.md": decision("r1", '  environment: "li nux"'),
      "number.md": decision("r1", "  environment: 1"),
      "list.md": decision("r1", "  - linux"),
      "why.md": decision("r1", "  environment: linux", ""),
      "naked.md": "requirement: r1\n",
      "missing.md": "---\nparameters:\n  environment: linux\n---\n\nBecause.\n",
    }),
  );
  const short = errors.map((e) => e.replace(/^.*\/instances\//, ""));
  assert.deepEqual(
    short.sort(),
    [
      "empty.md: parameters must be a non-empty mapping of names to values",
      "list.md: parameters must be a non-empty mapping of names to values",
      "missing.md: requirement is required",
      "naked.md: missing YAML frontmatter",
      "none.md: parameters must be a non-empty mapping of names to values",
      'number.md: parameter "environment" must be a plain name with a plain string value',
      'space.md: parameter "environment" must be a plain name with a plain string value',
      'unknown.md: requirement "nope" names no requirement',
      "why.md: a decision must state why",
    ].sort(),
  );
});

test("derivation touches no material, and asking again gives the same answer", () => {
  const dir = repo({ "r1.md": decision("r1", "  environment: linux") });
  const before = fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
  const first = ids(dir, ["r1", "r2"]);
  assert.deepEqual(ids(dir, ["r1", "r2"]), first);
  const after = fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
  assert.deepEqual(after, before);
});

test("an instance for a Defect is under no parameters", () => {
  assert.deepEqual(
    requiredInstances(
      [{ carrier: A, name: "generic", targets: [{ kind: "defect", id: "r1" }] }],
      [{ requirement: "r1", parameters: { environment: "linux" }, file: "f.md" }],
    ).map(instanceId),
    [A],
  );
});

test("Testing knows nothing of this composition", () => {
  for (const file of fs.readdirSync("skills/testing/scripts").filter((f) => f.endsWith(".ts")))
    assert.doesNotMatch(
      fs.readFileSync(path.join("skills/testing/scripts", file), "utf8"),
      /INSTANCE_DIR|InstanceRequirement|test\/instances/,
    );
});

test("no Run provides the environment these decisions require yet: that is the environment adapter's, and the instances stay unrun", () => {
  const { required } = kaalInstanceRequirements();
  assert.deepEqual(
    required.map((e) => e.parameters).sort((a, b) => (a.environment < b.environment ? -1 : 1)),
    [{ environment: "linux" }, { environment: "windows" }],
  );
  for (const { parameters } of required) assert.deepEqual(unmet(parameters, observeConditions()), ["environment"]);
});

test("decisions are test material: beneath a Change's test/, they are no Carrier, no Suite and no Plan, and a directory of the old name is not read", () => {
  const dir = repo({ "r1.md": decision("r1", "  environment: linux") });
  assert.deepEqual(carrierPlaces(dir), [A]);
  assert.deepEqual(kaalTestCases(dir).errors, []);
  const stray = path.join(dir, "change/x/26/09/30/01/evidence");
  fs.mkdirSync(stray);
  fs.writeFileSync(path.join(stray, "r2.md"), decision("r2", "  environment: windows"));
  assert.deepEqual(
    kaalInstanceRequirements(dir).required.map((d) => d.requirement),
    ["r1"],
  );
});

test("a Plan that requires nothing under parameters is worded as before parameters existed, so a stored Plan is made again byte for byte", () => {
  const dir = repo({ "r1.md": decision("r1", "  environment: linux") });
  const { required } = kaalInstanceRequirements(dir);
  const cases = kaalTestCases(dir).cases;
  const plain = testPlanProtecting(cases, "requirement", ["r2"], required);
  const parameterised = testPlanProtecting(cases, "requirement", ["r1"], required);
  assert.ok("plan" in plain && "plan" in parameterised);
  assert.match(plain.plan, /each Carrier once, computed from the Test Cases and the `tests`/);
  assert.doesNotMatch(plain.plan, /parameters/);
  assert.match(parameterised.plan, /once under each set of parameters its requirement's instances are required under/);
});
