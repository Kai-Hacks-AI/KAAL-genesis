import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { candidateData, rootData } from "./test-data.js";
import {
  observeConditions,
  outcomes,
  planEvidence,
  readReport,
  report,
  runArguments,
  runPlan,
  runPlanUnder,
  type Outcomes,
} from "./testing.js";

// A candidate is the state being tested. Where a Run executed it is a location, the working directory its Cases
// ran in; what it was, when the caller says, is an identity Testing keeps with the Run and never interprets. These
// tests hold the two apart, and hold a Run that states no identity exactly as it always was.

const RUN = fileURLToPath(new URL("./run.ts", import.meta.url));
const EVIDENCE = fileURLToPath(new URL("./evidence.ts", import.meta.url));
const IMPORT = 'import test from "node:test";\n';
const here = process.platform;
const elsewhere = here === "win32" ? "linux" : "win32";

const scratch = (files: Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "testing-identity-"));
  process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
};

/** A copy of the one candidate the fixtures hold, somewhere else: the same state, a different location. */
const copyOfCandidate = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "testing-identity-candidate-"));
  process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(candidateData("marked"), dir, { recursive: true });
  return dir;
};

/** One HOW required under here and under elsewhere, as two hosts would each provide one of. */
const oneHow = () =>
  scratch({
    "plan.md": `---\ncarriers:\n  - carrier: behaves.test.ts\n    parameters:\n      platform: ${here}\n  - carrier: behaves.test.ts\n    parameters:\n      platform: ${elsewhere}\n---\n\nParameterized.\n`,
    "behaves.test.ts": `${IMPORT}test("behaves", () => {});\n`,
  });

const IDENTITY = "state 7 of the thing, however it is named [as-is]";

test("a location and an identity are two things: one state in two places is two candidates and one identity", () => {
  const a = copyOfCandidate();
  const b = copyOfCandidate();
  const first = runPlan("plan.md", rootData("holds"), a, IDENTITY);
  const second = runPlan("plan.md", rootData("holds"), b, IDENTITY);
  assert.notEqual(first.candidate, second.candidate, "where each executed differs");
  assert.equal(first.candidate, path.resolve(a));
  assert.equal(first.candidateIdentity, IDENTITY);
  assert.equal(second.candidateIdentity, IDENTITY);
  assert.deepEqual(outcomes(first), outcomes(second), "what each showed of the identity does not depend on the place");
  const lines = (r: typeof first) => report(r).split("\n");
  assert.deepEqual(
    lines(first).filter((l) => !l.startsWith("candidate ")),
    lines(second).filter((l) => !l.startsWith("candidate ")),
    "the reports differ in the location line alone",
  );
});

test("a Run that states no identity is exactly what it always was: no property, no line, no key in its outcomes", () => {
  const run = runPlan("plan.md", rootData("holds"), candidateData("marked"));
  assert.equal(Object.hasOwn(run, "candidateIdentity"), false);
  assert.equal(Object.hasOwn(outcomes(run), "candidateIdentity"), false);
  assert.equal(
    report(run),
    [
      "plan plan.md",
      `candidate ${candidateData("marked")}`,
      `conditions ${run.conditions}`,
      "pass suites/marked/nested/marked.test.ts",
      "holds",
    ].join("\n"),
  );
  assert.deepEqual(readReport(report(run)), { outcomes: outcomes(run), errors: [] });
});

test("a Run that states one keeps it as given, reports it on a line of its own, and readReport returns it exactly", () => {
  const run = runPlan("plan.md", rootData("holds"), candidateData("marked"), IDENTITY);
  assert.equal(
    report(run),
    [
      "plan plan.md",
      `candidate ${candidateData("marked")}`,
      `candidate-identity ${IDENTITY}`,
      `conditions ${run.conditions}`,
      "pass suites/marked/nested/marked.test.ts",
      "holds",
    ].join("\n"),
  );
  assert.deepEqual(readReport(report(run)), { outcomes: outcomes(run), errors: [] });
  assert.equal(readReport(report(run)).outcomes?.candidateIdentity, IDENTITY);
  assert.equal(
    readReport(report(run).replace(/\n/g, "\r\n")).outcomes?.candidateIdentity,
    IDENTITY,
    "read as lines, whatever ends them",
  );
  // What an identity looks like means nothing to Testing: a hash, a path or a sentence is a string.
  for (const odd of [
    "00a8be7e7b3c002ffcbbc7fb651abc8a349aa584",
    "D:\\a\\KAAL\\candidate",
    "é=ü, [x]\tstill one line",
    "x",
  ])
    assert.equal(
      readReport(report(runPlan("plan.md", rootData("holds"), candidateData("marked"), odd))).outcomes
        ?.candidateIdentity,
      odd,
    );
});

test("an identity that is not an identity is refused before any Case runs", () => {
  const dir = scratch({
    "plan.md": "---\ncarriers:\n  - touches.test.ts\n---\n\nTouches.\n",
    "touches.test.ts": `${IMPORT}import fs from "node:fs";\ntest("touches", () => { fs.writeFileSync("touched", "x"); });\n`,
  });
  for (const bad of ["", " leading", "trailing ", "two\nlines", "carriage\r", "\t"])
    assert.throws(
      () => runPlan("plan.md", dir, dir, bad),
      /refusing to run plan\.md:\na candidate identity must be/,
      JSON.stringify(bad),
    );
  assert.equal(fs.existsSync(path.join(dir, "touched")), false, "nothing ran");
});

test("a report that states an identity twice, or one that is not an identity, is refused", () => {
  const base = (...middle: string[]) =>
    ["plan p", "candidate /x", ...middle, "conditions node v1 a b", "pass a", "holds"].join("\n");
  assert.deepEqual(readReport(base("candidate-identity A", "candidate-identity A")).errors, [
    "a candidate identity is stated twice",
  ]);
  assert.deepEqual(readReport(base("candidate-identity A", "candidate-identity B")).errors, [
    "a candidate identity is stated twice",
  ]);
  for (const bad of ["candidate-identity ", "candidate-identity  padded", "candidate-identity padded "])
    assert.deepEqual(
      readReport(base(bad)).errors,
      ["a candidate identity must be non-empty, on one line, without leading or trailing whitespace"],
      JSON.stringify(bad),
    );
});

/** The report reader as it was before candidate identities: the plan, the instances, what it showed, every other line nothing. */
function legacyRead(text: string): Outcomes {
  const lines = text.split(/\r?\n/).filter((line) => line !== "");
  const result: Outcomes = { plan: /^plan (.+)$/.exec(lines[0])![1], passed: [], failed: [], unrun: [] };
  for (const line of lines.slice(1)) {
    const match = /^(pass|fail|unrun) (.+)$/.exec(line);
    if (match) result[match[1] === "pass" ? "passed" : match[1] === "fail" ? "failed" : "unrun"].push(match[2]);
  }
  return result;
}

test("every Run FAR has stored still reads, byte for byte as before: none states an identity, and none is changed", () => {
  const stored = fs.globSync("change/far/*/*/*/*/runs/*/run.md").sort();
  assert.ok(stored.length >= 9, "FAR's accepted Runs are there to be read");
  for (const file of stored) {
    const text = fs.readFileSync(file, "utf8");
    const read = readReport(text);
    assert.deepEqual(read.errors, [], file);
    assert.deepEqual(read.outcomes, legacyRead(text), `${file} reads as it did`);
    assert.equal(Object.hasOwn(read.outcomes!, "candidateIdentity"), false, file);
    assert.match(text, /^candidate <historical candidate>$/m, `${file} says only where, and that as a placeholder`);
  }
});

test("Runs of one Plan on two hosts, each stating an identity: Testing keeps what each stated and does not judge them", () => {
  const dir = oneHow();
  const hostA = runPlanUnder(observeConditions(), "plan.md", dir, dir, "state-A");
  const hostB = runPlanUnder({ ...observeConditions(), platform: elsewhere }, "plan.md", dir, dir, "state-A");
  const same = planEvidence([outcomes(hostA), outcomes(hostB)]);
  assert.equal(same.evidence?.evidenced, true);

  // Runs that disagree with each other are evidenced all the same: Testing does not require a candidate, and the
  // agreement of Runs among themselves would not show that they concern the one the using system requires.
  const other = runPlanUnder({ ...observeConditions(), platform: elsewhere }, "plan.md", dir, dir, "state-B");
  const mixed = planEvidence([outcomes(hostA), outcomes(other)]);
  assert.deepEqual(
    mixed.evidence,
    same.evidence,
    "the evidence is the same whatever the Runs state of their candidates",
  );

  // What each stated is exposed, so the using system can judge it against the identity it requires.
  const stated = [hostA, other].map((r) => readReport(report(r)).outcomes?.candidateIdentity);
  assert.deepEqual(stated, ["state-A", "state-B"]);
  const required = "state-A";
  assert.deepEqual(
    stated.map((id) => id === required),
    [true, false],
    "one of them is not a Run of the candidate the using system requires",
  );
});

const evidenceOf = (...reports: string[]) => {
  const dir = scratch(Object.fromEntries(reports.map((text, i) => [`r${i}.txt`, text])));
  return spawnSync(
    process.execPath,
    [...process.execArgv, EVIDENCE, ...reports.map((_, i) => path.join(dir, `r${i}.txt`))],
    {
      encoding: "utf8",
    },
  );
};

test("evidence.ts exposes identities that are not one on its error output, and changes neither what it prints nor how it exits", () => {
  const dir = oneHow();
  const reports = (a?: string, b?: string) => [
    report(runPlanUnder(observeConditions(), "plan.md", dir, dir, a)),
    report(runPlanUnder({ ...observeConditions(), platform: elsewhere }, "plan.md", dir, dir, b)),
  ];
  const agree = evidenceOf(...reports("A", "A"));
  const none = evidenceOf(...reports());
  const differ = evidenceOf(...reports("A", "B"));
  const some = evidenceOf(...reports("A", undefined));
  for (const r of [agree, none, differ, some]) {
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\nevidenced\n$/);
  }
  assert.equal(agree.stdout, none.stdout, "what it prints does not depend on what the Runs state");
  assert.equal(agree.stdout, differ.stdout);
  assert.equal(agree.stderr, "");
  assert.equal(none.stderr, "");
  assert.match(differ.stderr, /^note: the Runs do not state one candidate identity: A, B\n$/);
  assert.match(some.stderr, /^note: the Runs do not state one candidate identity: A, \(none\)\n$/);
});

test("run.ts states the identity it is given, and only in the form it documents", () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [...process.execArgv, RUN, ...args], { cwd: rootData("holds"), encoding: "utf8" });
  const stated = run("plan.md", candidateData("marked"), "--candidate-identity", IDENTITY);
  assert.equal(stated.status, 0, stated.stderr);
  assert.equal(readReport(stated.stdout).outcomes?.candidateIdentity, IDENTITY);
  assert.equal(readReport(run("plan.md", candidateData("marked")).stdout).outcomes?.candidateIdentity, undefined);
  for (const args of [
    ["plan.md", "--candidate-identity"],
    ["plan.md", "--candidate-identity", "A", "--candidate-identity", "B"],
    ["plan.md", "a", "b"],
    ["--candidate-identity", "A"],
    [],
  ])
    assert.equal(run(...args).status, 2, JSON.stringify(args));
  assert.equal(
    run("plan.md", candidateData("marked"), "--candidate-identity", " padded").status,
    1,
    "a Run refuses what is not one",
  );
});

test("run arguments: a plan, an optional candidate, an optional identity in either place", () => {
  assert.deepEqual(runArguments(["p"]), { plan: "p" });
  assert.deepEqual(runArguments(["p", "c"]), { plan: "p", candidate: "c" });
  assert.deepEqual(runArguments(["p", "c", "--candidate-identity", "I"]), {
    plan: "p",
    candidate: "c",
    candidateIdentity: "I",
  });
  assert.deepEqual(runArguments(["--candidate-identity", "I", "p"]), { plan: "p", candidateIdentity: "I" });
  assert.equal(runArguments([]), undefined);
});
