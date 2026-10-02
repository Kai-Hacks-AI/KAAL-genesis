import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { computeRegression } from "../skills/testing/scripts/regression.js";
import {
  instanceId,
  planEvidence,
  planInstances,
  readPlanSuites,
  readReport,
  type Outcomes,
} from "../skills/testing/scripts/testing.js";
import { kaalInstanceRequirements, kaalTestCases, testPlanProtecting } from "./test-cases.js";

// The sealed FAR checkpoints, oldest first. They were written when Authorise was
// called Acceptance and say so; sealing keeps them exactly as written. They are
// read here only to show that the equation still holds over them.
const HISTORY = [
  "change/far/26/09/25/01",
  "change/far/26/09/26/01",
  "change/far/26/09/26/02",
  "change/far/26/09/26/03",
];

// FAR-4 and later are written under the word Authorise, which is what Acceptance came to be called.
// Each lists what its hit newly protects, and what it authorises away.
const AUTHORISE = [
  {
    at: "change/far/26/09/30/01",
    previous: "change/far/26/09/26/03",
    feature: ["changes-are-immutable-occurrences-beneath-their-lineage", "closed-change-cannot-change-unnoticed"],
    carriers: 14,
  },
  { at: "change/far/26/09/30/02", previous: "change/far/26/09/30/01", feature: [], carriers: 14 },
  { at: "change/far/26/09/30/03", previous: "change/far/26/09/30/02", feature: [], carriers: 14 },
  {
    at: "change/far/26/09/30/04",
    previous: "change/far/26/09/30/03",
    feature: [
      "review-round-justified-by-confidence-in-responsibility",
      "reviewing-ends-every-loop-in-one-of-four-outcomes",
      "reviewing-is-independent-of-what-it-reviews",
      "reviewing-is-instructions-not-a-script",
    ],
    carriers: 18,
  },
  { at: "change/far/26/09/30/05", previous: "change/far/26/09/30/04", feature: [], carriers: 18 },
];

const identities = (file: string): string[] =>
  fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));

test("history that says Acceptance still computes: its Acceptance is an Authorise, and each recorded Regression follows", () => {
  let previous: string[] | undefined;
  for (const at of HISTORY) {
    assert.match(fs.readFileSync(`${at}/acceptance.md`, "utf8"), /^# Acceptance\r?\n/, `${at} keeps its own word`);
    assert.equal(fs.existsSync(`${at}/authorise.md`), false, `${at} is history and is not renamed`);
    const result = computeRegression({
      ...(previous && { previous }),
      feature: identities(`${at}/feature.md`),
      authorise: identities(`${at}/acceptance.md`),
    });
    assert.ok("regression" in result, `${at}: ${"errors" in result ? result.errors.join("; ") : ""}`);
    assert.deepEqual(result.regression, identities(`${at}/regression.md`).sort(), at);
    previous = result.regression;
  }
  assert.equal(previous!.length, 12);
});

test("history written under Authorise computes: each Regression follows from the one before, its Feature and its Authorise", () => {
  for (const { at, previous, feature } of AUTHORISE) {
    assert.match(fs.readFileSync(`${at}/authorise.md`, "utf8"), /^# Authorise\r?\n/, at);
    assert.equal(fs.existsSync(`${at}/acceptance.md`), false, at);
    const result = computeRegression({
      previous: identities(`${previous}/regression.md`),
      feature: identities(`${at}/feature.md`),
      authorise: identities(`${at}/authorise.md`),
    });
    assert.ok("regression" in result, `${at}: ${"errors" in result ? result.errors.join("; ") : ""}`);
    assert.deepEqual(result.regression, identities(`${at}/regression.md`).sort(), at);
    assert.deepEqual(identities(`${at}/feature.md`), feature, at);
    assert.deepEqual(identities(`${at}/authorise.md`), [], at);
  }
});

test("each Plan written under Authorise is exactly what its Regression derives from the Test Cases: made again, it is the same bytes", () => {
  const { cases, errors } = kaalTestCases();
  assert.deepEqual(errors, []);
  // FAR-1's Suite and its twelve Carriers are untouched, yet the Carrier whose Test Cases FAR-4 superseded is not run.
  const stale = "change/far/26/09/26/01/test/genesis/changes-checked-against-seals-of-target-branch.test.ts";
  assert.equal(fs.existsSync(stale), true);
  for (const { at, carriers } of AUTHORISE) {
    const derived = testPlanProtecting(cases, "requirement", identities(`${at}/regression.md`));
    assert.ok("plan" in derived, `${at}: ${"errors" in derived ? derived.errors.join("; ") : ""}`);
    assert.equal(fs.readFileSync(`${at}/runs/01/plan.md`, "utf8"), derived.plan, at);
    assert.equal(derived.carriers.includes(stale), false, at);
    assert.equal(derived.carriers.length, carriers, at);
  }
});

// FAR-9: the Hit that accepts Requirements Management. Its record is the first to admit Runs that state what they
// judged. A FAR record is the identity of the Hit it records, its own occurrence without the root, and each Run it
// admits states that identity; FAR judges that, as Testing never does, and Testing's evidence says the Runs
// together show the Plan. Nothing here reads Git, GitHub or the host that made a Run.
const FAR_9 = "change/far/26/10/02/01";
const FAR_9_PLAN = `${FAR_9}/runs/01/plan.md`;
const FAR_9_RUNS = { linux: `${FAR_9}/runs/01/run-linux.md`, windows: `${FAR_9}/runs/01/run-windows.md` };
// The decisions Plan₉ was derived under, named: a decision a later Change births must not rewrite what a sealed Plan said.
const FAR_9_DECISIONS = [
  "change/execution-environments/26/10/01/02/test/instances/linux-support.md",
  "change/execution-environments/26/10/01/02/test/instances/windows-support.md",
];

const hitOf = (record: string): string => record.replace(/^change\//, "");

/** Why the Runs, each the outcomes read from its report, do not concern the Hit `record` is about, or none where they do. */
function admissionErrors(record: string, planFile: string, runs: Outcomes[]): string[] {
  const read = readPlanSuites(".", planFile);
  if (read.errors.length) return read.errors;
  const required = planInstances(read.plan!, read.suites).map(instanceId).sort();
  const errors: string[] = [];
  runs.forEach((run, i) => {
    if (run.candidateIdentity !== hitOf(record))
      errors.push(`Run ${i + 1} states ${run.candidateIdentity ?? "no candidate identity"}, not ${hitOf(record)}`);
    if (run.plan !== planFile) errors.push(`Run ${i + 1} is a Run of ${run.plan}, not ${planFile}`);
    const performed = [...run.passed, ...run.failed, ...run.unrun].sort();
    if (JSON.stringify(performed) !== JSON.stringify(required))
      errors.push(`Run ${i + 1} does not account for exactly the instances of ${planFile}`);
    if (run.failed.length) errors.push(`Run ${i + 1} has an instance that failed`);
  });
  const shown = planEvidence(runs);
  if (!shown.evidence?.evidenced) errors.push(...shown.errors, `the Runs do not evidence ${planFile}`);
  return errors;
}

const readRun = (file: string): Outcomes => {
  const read = readReport(fs.readFileSync(file, "utf8"));
  assert.deepEqual(read.errors, [], file);
  return read.outcomes!;
};

test("FAR-9 is written under Authorise: its Regression follows from FAR-8's, its Feature and its Authorise", () => {
  assert.match(fs.readFileSync(`${FAR_9}/authorise.md`, "utf8"), /^# Authorise\r?\n/);
  const feature = ["git-independence", "github-independence", "linux-support", "windows-support"];
  assert.deepEqual(identities(`${FAR_9}/feature.md`), feature);
  assert.deepEqual(identities(`${FAR_9}/authorise.md`), []);
  const result = computeRegression({
    previous: identities("change/far/26/09/30/05/regression.md"),
    feature,
    authorise: [],
  });
  assert.ok("regression" in result, "errors" in result ? result.errors.join("; ") : "");
  assert.deepEqual(result.regression, identities(`${FAR_9}/regression.md`).sort());
  assert.equal(result.regression.length, 22);
});

test("Plan₉ is exactly what R₉ derives under the decisions it was made under: made again, it is the same bytes", () => {
  const { cases, errors } = kaalTestCases();
  assert.deepEqual(errors, []);
  const decisions = kaalInstanceRequirements();
  assert.deepEqual(decisions.errors, []);
  const required = decisions.required.filter((d) => FAR_9_DECISIONS.includes(d.file));
  assert.equal(required.length, FAR_9_DECISIONS.length, "the decisions Plan₉ names exist");
  const derived = testPlanProtecting(cases, "requirement", identities(`${FAR_9}/regression.md`), required);
  assert.ok("plan" in derived, "errors" in derived ? derived.errors.join("; ") : "");
  assert.equal(fs.readFileSync(FAR_9_PLAN, "utf8"), derived.plan);
  // Two environments for one Carrier, and the eighteen of FAR-8 and the two independence Carriers once each.
  assert.equal(derived.instances.length, 22);
  assert.deepEqual(
    [...new Set(derived.instances.flatMap((i) => Object.entries(i.parameters).map(([n, v]) => `${n}=${v}`)))].sort(),
    ["environment=linux", "environment=windows"],
  );
});

test("FAR-9 admits a Linux Run and a Windows Run that each state the Hit the record is about, and together evidence Plan₉", () => {
  const linux = readRun(FAR_9_RUNS.linux);
  const windows = readRun(FAR_9_RUNS.windows);
  assert.deepEqual(admissionErrors(FAR_9, FAR_9_PLAN, [linux, windows]), []);
  assert.equal(linux.candidateIdentity, "far/26/10/02/01");
  // Each made the instances of its own environment and left the other's unrun, so neither alone shows the Plan.
  assert.equal(linux.unrun.length, 1);
  assert.equal(windows.unrun.length, 1);
  assert.notDeepEqual(linux.unrun, windows.unrun);
  for (const alone of [linux, windows]) assert.equal(planEvidence([alone]).evidence?.evidenced, false);
  // FAR keeps no location, identifier of a commit, address, runner, artifact or workflow in what it admitted.
  for (const file of Object.values(FAR_9_RUNS)) {
    const text = fs.readFileSync(file, "utf8");
    assert.match(text, /^candidate <historical candidate>$/m, file);
    assert.doesNotMatch(text, /[0-9a-f]{40}|https?:|[A-Za-z]:\\|runner|artifact|workflow/i, file);
  }
});

test("FAR refuses Runs that do not concern the Hit it records, whatever they show among themselves", () => {
  const linux = readRun(FAR_9_RUNS.linux);
  const windows = readRun(FAR_9_RUNS.windows);
  const other = { ...windows, candidateIdentity: "far/26/09/30/05" };
  assert.deepEqual(planEvidence([linux, other]).evidence?.evidenced, true, "Testing alone would accept them");
  assert.match(admissionErrors(FAR_9, FAR_9_PLAN, [linux, other]).join("\n"), /Run 2 states far\/26\/09\/30\/05/);
  const { candidateIdentity: _, ...unstated } = windows;
  assert.match(admissionErrors(FAR_9, FAR_9_PLAN, [linux, unstated]).join("\n"), /Run 2 states no candidate identity/);
  assert.match(admissionErrors(FAR_9, FAR_9_PLAN, [linux]).join("\n"), /do not evidence/);
  assert.match(
    admissionErrors(FAR_9, FAR_9_PLAN, [linux, { ...windows, plan: "change/far/26/09/30/05/runs/01/plan.md" }]).join(
      "\n",
    ),
    /Run 2 is a Run of/,
  );
});

// FAR-10: the Hit that writes the seals of Requirements Management. It protects nothing new, so R₁₀ = R₉ and its Plan is
// Plan₉'s bytes. Its record is the identity of the Hit it records, and its Runs state it.
const FAR_10 = "change/far/26/10/02/02";
const FAR_10_PLAN = `${FAR_10}/runs/01/plan.md`;
const FAR_10_RUNS = { linux: `${FAR_10}/runs/01/run-linux.md`, windows: `${FAR_10}/runs/01/run-windows.md` };

test("FAR-10 is written under Authorise: no protection changes, so its Regression is FAR-9's", () => {
  assert.match(fs.readFileSync(`${FAR_10}/authorise.md`, "utf8"), /^# Authorise\r?\n/);
  assert.deepEqual(identities(`${FAR_10}/feature.md`), []);
  assert.deepEqual(identities(`${FAR_10}/authorise.md`), []);
  const result = computeRegression({ previous: identities(`${FAR_9}/regression.md`), feature: [], authorise: [] });
  assert.ok("regression" in result, "errors" in result ? result.errors.join("; ") : "");
  assert.deepEqual(result.regression, identities(`${FAR_10}/regression.md`).sort());
  assert.equal(result.regression.length, 22);
});

test("Plan₁₀ is exactly what R₁₀ derives under the decisions Plan₉ was made under, and is Plan₉'s bytes", () => {
  const { cases, errors } = kaalTestCases();
  assert.deepEqual(errors, []);
  const decisions = kaalInstanceRequirements();
  assert.deepEqual(decisions.errors, []);
  const required = decisions.required.filter((d) => FAR_9_DECISIONS.includes(d.file));
  const derived = testPlanProtecting(cases, "requirement", identities(`${FAR_10}/regression.md`), required);
  assert.ok("plan" in derived, "errors" in derived ? derived.errors.join("; ") : "");
  assert.equal(fs.readFileSync(FAR_10_PLAN, "utf8"), derived.plan);
  assert.equal(fs.readFileSync(FAR_10_PLAN, "utf8"), fs.readFileSync(FAR_9_PLAN, "utf8"));
  assert.equal(derived.instances.length, 22);
});

test("FAR-10 admits a Linux Run and a Windows Run that each state the Hit the record is about, and together evidence Plan₁₀", () => {
  const linux = readRun(FAR_10_RUNS.linux);
  const windows = readRun(FAR_10_RUNS.windows);
  assert.deepEqual(admissionErrors(FAR_10, FAR_10_PLAN, [linux, windows]), []);
  assert.equal(linux.candidateIdentity, "far/26/10/02/02");
  assert.equal(linux.unrun.length, 1);
  assert.equal(windows.unrun.length, 1);
  assert.notDeepEqual(linux.unrun, windows.unrun);
  for (const alone of [linux, windows]) assert.equal(planEvidence([alone]).evidence?.evidenced, false);
  // Runs that concern the previous Hit are refused, though they evidence the same Plan.
  const previous = [readRun(FAR_9_RUNS.linux), readRun(FAR_9_RUNS.windows)];
  assert.match(admissionErrors(FAR_10, FAR_10_PLAN, previous).join("\n"), /Run 1 states far\/26\/10\/02\/01/);
  for (const file of Object.values(FAR_10_RUNS)) {
    const text = fs.readFileSync(file, "utf8");
    assert.match(text, /^candidate <historical candidate>$/m, file);
    assert.doesNotMatch(text, /[0-9a-f]{40}|https?:|[A-Za-z]:\\|runner|artifact|workflow/i, file);
  }
});

// FAR-11: the Hit that guards the main line. It protects nothing new, so R₁₁ = R₁₀ and its Plan is Plan₁₀'s bytes. Its
// record is the identity of the Hit it records, and its Runs state it.
const FAR_11 = "change/far/26/10/02/03";
const FAR_11_PLAN = `${FAR_11}/runs/01/plan.md`;
const FAR_11_RUNS = { linux: `${FAR_11}/runs/01/run-linux.md`, windows: `${FAR_11}/runs/01/run-windows.md` };

test("FAR-11 is written under Authorise: no protection changes, so its Regression is FAR-10's", () => {
  assert.match(fs.readFileSync(`${FAR_11}/authorise.md`, "utf8"), /^# Authorise\r?\n/);
  assert.deepEqual(identities(`${FAR_11}/feature.md`), []);
  assert.deepEqual(identities(`${FAR_11}/authorise.md`), []);
  const result = computeRegression({ previous: identities(`${FAR_10}/regression.md`), feature: [], authorise: [] });
  assert.ok("regression" in result, "errors" in result ? result.errors.join("; ") : "");
  assert.deepEqual(result.regression, identities(`${FAR_11}/regression.md`).sort());
  assert.equal(result.regression.length, 22);
});

test("Plan₁₁ is exactly what R₁₁ derives under the decisions Plan₉ was made under, and is Plan₁₀'s bytes", () => {
  const { cases, errors } = kaalTestCases();
  assert.deepEqual(errors, []);
  const decisions = kaalInstanceRequirements();
  assert.deepEqual(decisions.errors, []);
  const required = decisions.required.filter((d) => FAR_9_DECISIONS.includes(d.file));
  const derived = testPlanProtecting(cases, "requirement", identities(`${FAR_11}/regression.md`), required);
  assert.ok("plan" in derived, "errors" in derived ? derived.errors.join("; ") : "");
  assert.equal(fs.readFileSync(FAR_11_PLAN, "utf8"), derived.plan);
  assert.equal(fs.readFileSync(FAR_11_PLAN, "utf8"), fs.readFileSync(FAR_10_PLAN, "utf8"));
  assert.equal(derived.instances.length, 22);
});

test("FAR-11 admits a Linux Run and a Windows Run that each state the Hit the record is about, and together evidence Plan₁₁", () => {
  const linux = readRun(FAR_11_RUNS.linux);
  const windows = readRun(FAR_11_RUNS.windows);
  assert.deepEqual(admissionErrors(FAR_11, FAR_11_PLAN, [linux, windows]), []);
  assert.equal(linux.candidateIdentity, "far/26/10/02/03");
  assert.equal(linux.unrun.length, 1);
  assert.equal(windows.unrun.length, 1);
  assert.notDeepEqual(linux.unrun, windows.unrun);
  for (const alone of [linux, windows]) assert.equal(planEvidence([alone]).evidence?.evidenced, false);
  // Runs that concern the previous Hit are refused, though they evidence the same Plan.
  const previous = [readRun(FAR_10_RUNS.linux), readRun(FAR_10_RUNS.windows)];
  assert.match(admissionErrors(FAR_11, FAR_11_PLAN, previous).join("\n"), /Run 1 states far\/26\/10\/02\/02/);
  for (const file of Object.values(FAR_11_RUNS)) {
    const text = fs.readFileSync(file, "utf8");
    assert.match(text, /^candidate <historical candidate>$/m, file);
    assert.doesNotMatch(text, /[0-9a-f]{40}|https?:|[A-Za-z]:\\|runner|artifact|workflow/i, file);
  }
});

// FAR-12: the Hit that makes a symlink test fixture portable. It protects nothing new, though it repairs a retained Defect, which no Test Case yet tests,, so R₁₂ = R₁₁ and its Plan is Plan₁₁'s bytes. Its
// record is the identity of the Hit it records, and its Runs state it.
const FAR_12 = "change/far/26/10/02/04";
const FAR_12_PLAN = `${FAR_12}/runs/01/plan.md`;
const FAR_12_RUNS = { linux: `${FAR_12}/runs/01/run-linux.md`, windows: `${FAR_12}/runs/01/run-windows.md` };

test("FAR-12 is written under Authorise: no protection changes, so its Regression is FAR-11's", () => {
  assert.match(fs.readFileSync(`${FAR_12}/authorise.md`, "utf8"), /^# Authorise\r?\n/);
  assert.deepEqual(identities(`${FAR_12}/feature.md`), []);
  assert.deepEqual(identities(`${FAR_12}/authorise.md`), []);
  const result = computeRegression({ previous: identities(`${FAR_11}/regression.md`), feature: [], authorise: [] });
  assert.ok("regression" in result, "errors" in result ? result.errors.join("; ") : "");
  assert.deepEqual(result.regression, identities(`${FAR_12}/regression.md`).sort());
  assert.equal(result.regression.length, 22);
});

test("Plan₁₂ is exactly what R₁₂ derives under the decisions Plan₉ was made under, and is Plan₁₁'s bytes", () => {
  const { cases, errors } = kaalTestCases();
  assert.deepEqual(errors, []);
  const decisions = kaalInstanceRequirements();
  assert.deepEqual(decisions.errors, []);
  const required = decisions.required.filter((d) => FAR_9_DECISIONS.includes(d.file));
  const derived = testPlanProtecting(cases, "requirement", identities(`${FAR_12}/regression.md`), required);
  assert.ok("plan" in derived, "errors" in derived ? derived.errors.join("; ") : "");
  assert.equal(fs.readFileSync(FAR_12_PLAN, "utf8"), derived.plan);
  assert.equal(fs.readFileSync(FAR_12_PLAN, "utf8"), fs.readFileSync(FAR_11_PLAN, "utf8"));
  assert.equal(derived.instances.length, 22);
});

test("FAR-12 admits a Linux Run and a Windows Run that each state the Hit the record is about, and together evidence Plan₁₂", () => {
  const linux = readRun(FAR_12_RUNS.linux);
  const windows = readRun(FAR_12_RUNS.windows);
  assert.deepEqual(admissionErrors(FAR_12, FAR_12_PLAN, [linux, windows]), []);
  assert.equal(linux.candidateIdentity, "far/26/10/02/04");
  assert.equal(linux.unrun.length, 1);
  assert.equal(windows.unrun.length, 1);
  assert.notDeepEqual(linux.unrun, windows.unrun);
  for (const alone of [linux, windows]) assert.equal(planEvidence([alone]).evidence?.evidenced, false);
  // Runs that concern the previous Hit are refused, though they evidence the same Plan.
  const previous = [readRun(FAR_11_RUNS.linux), readRun(FAR_11_RUNS.windows)];
  assert.match(admissionErrors(FAR_12, FAR_12_PLAN, previous).join("\n"), /Run 1 states far\/26\/10\/02\/03/);
  for (const file of Object.values(FAR_12_RUNS)) {
    const text = fs.readFileSync(file, "utf8");
    assert.match(text, /^candidate <historical candidate>$/m, file);
    assert.doesNotMatch(text, /[0-9a-f]{40}|https?:|[A-Za-z]:\\|runner|artifact|workflow/i, file);
  }
});

// FAR-13: the Hit that tests the guard of the main line, with the refusal of an unnamed agent branch as its failing case. The
// guard's rule lives in a script outside any Change's test/, so no Test Case tests it and it earns no Requirement or Defect: R₁₃ = R₁₂ and its
// Plan is Plan₁₂'s bytes. Its record is the identity of the Hit it records, and its Runs state it.
const FAR_13 = "change/far/26/10/02/05";
const FAR_13_PLAN = `${FAR_13}/runs/01/plan.md`;
const FAR_13_RUNS = { linux: `${FAR_13}/runs/01/run-linux.md`, windows: `${FAR_13}/runs/01/run-windows.md` };

test("FAR-13 is written under Authorise: no protection changes, so its Regression is FAR-12's", () => {
  assert.match(fs.readFileSync(`${FAR_13}/authorise.md`, "utf8"), /^# Authorise\r?\n/);
  assert.deepEqual(identities(`${FAR_13}/feature.md`), []);
  assert.deepEqual(identities(`${FAR_13}/authorise.md`), []);
  const result = computeRegression({ previous: identities(`${FAR_12}/regression.md`), feature: [], authorise: [] });
  assert.ok("regression" in result, "errors" in result ? result.errors.join("; ") : "");
  assert.deepEqual(result.regression, identities(`${FAR_13}/regression.md`).sort());
  assert.equal(result.regression.length, 22);
});

test("Plan₁₃ is exactly what R₁₃ derives under the decisions Plan₉ was made under, and is Plan₁₂'s bytes", () => {
  const { cases, errors } = kaalTestCases();
  assert.deepEqual(errors, []);
  const decisions = kaalInstanceRequirements();
  assert.deepEqual(decisions.errors, []);
  const required = decisions.required.filter((d) => FAR_9_DECISIONS.includes(d.file));
  const derived = testPlanProtecting(cases, "requirement", identities(`${FAR_13}/regression.md`), required);
  assert.ok("plan" in derived, "errors" in derived ? derived.errors.join("; ") : "");
  assert.equal(fs.readFileSync(FAR_13_PLAN, "utf8"), derived.plan);
  assert.equal(fs.readFileSync(FAR_13_PLAN, "utf8"), fs.readFileSync(FAR_12_PLAN, "utf8"));
  assert.equal(derived.instances.length, 22);
});

test("FAR-13 admits a Linux Run and a Windows Run that each state the Hit the record is about, and together evidence Plan₁₃", () => {
  const linux = readRun(FAR_13_RUNS.linux);
  const windows = readRun(FAR_13_RUNS.windows);
  assert.deepEqual(admissionErrors(FAR_13, FAR_13_PLAN, [linux, windows]), []);
  assert.equal(linux.candidateIdentity, "far/26/10/02/05");
  assert.equal(linux.unrun.length, 1);
  assert.equal(windows.unrun.length, 1);
  assert.notDeepEqual(linux.unrun, windows.unrun);
  for (const alone of [linux, windows]) assert.equal(planEvidence([alone]).evidence?.evidenced, false);
  // Runs that concern the previous Hit are refused, though they evidence the same Plan.
  const previous = [readRun(FAR_12_RUNS.linux), readRun(FAR_12_RUNS.windows)];
  assert.match(admissionErrors(FAR_13, FAR_13_PLAN, previous).join("\n"), /Run 1 states far\/26\/10\/02\/04/);
  for (const file of Object.values(FAR_13_RUNS)) {
    const text = fs.readFileSync(file, "utf8");
    assert.match(text, /^candidate <historical candidate>$/m, file);
    assert.doesNotMatch(text, /[0-9a-f]{40}|https?:|[A-Za-z]:\\|runner|artifact|workflow/i, file);
  }
});
