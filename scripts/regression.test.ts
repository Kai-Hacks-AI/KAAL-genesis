import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { type Case, caseFiles, fileCases, PLAN, planCommitments, unnamedCases } from "./links.js";
import { classify, judge, planLedger, regressionErrors, unreplayable, type Result } from "./regression.js";
import { regressionCandidate, regressionTrusted } from "./test-data.js";

const REPO = fileURLToPath(new URL("../", import.meta.url));
/** The trusted regression's identity, as the candidates in test-data/regression name it. */
const BASE = "b".repeat(64);
const GREETING = "brain/learning/k/26/01/01/01/nodes/greeting.md";
const GREETING_LATER = "brain/learning/k/26/01/02/01/nodes/greeting.md";

const classified = (candidate: string) => classify(regressionTrusted(), regressionCandidate(candidate), BASE);

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a commitment the candidate's plan still names is retained", () => {
  assert.deepEqual(classified("kept"), {
    retained: ["src/add.ts", GREETING],
    replaced: new Map(),
    withdrawn: new Map(),
    errors: [],
  });
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a commitment superseded by a later node of the same name that the plan names is replaced by it", () => {
  const { retained, replaced, withdrawn, errors } = classified("replaced");
  assert.deepEqual(
    [retained, [...replaced], [...withdrawn], errors],
    [["src/add.ts"], [[GREETING, GREETING_LATER]], [], []],
  );
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a commitment superseded by a later node of the same name that the plan does not name is withdrawn by it", () => {
  const { retained, replaced, withdrawn, errors } = classified("withdrawn");
  assert.deepEqual(
    [retained, [...replaced], [...withdrawn], errors],
    [["src/add.ts"], [], [[GREETING, GREETING_LATER]], []],
  );
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a commitment that leaves the plan without being superseded in BRAIN is a silent escape", () => {
  assert.deepEqual(classified("escaped").errors, [
    `${GREETING}: silent escape: the plan no longer names it, and nothing in BRAIN supersedes it`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a commitment stated outside BRAIN can only be retained: leaving the plan is a silent escape", () => {
  assert.deepEqual(classified("code-removed").errors, [
    "src/add.ts: silent escape: the plan no longer names it, and nothing in BRAIN supersedes it",
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a replacement no case of the candidate points at is refused", () => {
  assert.deepEqual(classified("replaced-unproven").errors, [
    `${GREETING}: replaced by ${GREETING_LATER}, which no case of the candidate proves`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a retained commitment keeps what showed it: a plan that stops showing it by its cases is refused", () => {
  const candidate = regressionCandidate("kept");
  const plan = path.join(candidate, PLAN);
  fs.writeFileSync(
    plan,
    fs
      .readFileSync(plan, "utf8")
      .replace("`src/add.ts`. Shown by its cases.", "`src/add.ts`. Shown by the seal checks."),
  );
  assert.deepEqual(classify(regressionTrusted(), candidate, BASE).errors, [
    "src/add.ts: the accepted regression shows it by its cases, but the plan no longer does",
  ]);
  fs.writeFileSync(
    plan,
    fs
      .readFileSync(plan, "utf8")
      .replace("`src/add.ts`. Shown by the seal checks.", "`src/add.ts`. Shown by its cases and the seal checks."),
  );
  assert.deepEqual(classify(regressionTrusted(), candidate, BASE).errors, []);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a plan that still names a commitment BRAIN has superseded is refused", () => {
  assert.deepEqual(classified("superseded-kept").errors, [
    `${GREETING}: the plan names it, but ${GREETING_LATER} supersedes it`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a commitment the candidate adds is refused if BRAIN already supersedes it", () => {
  assert.deepEqual(classified("added-superseded").errors, [
    "brain/learning/k/26/01/03/01/nodes/farewell.md: the plan names it, but brain/learning/k/26/01/04/01/nodes/farewell.md supersedes it",
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("the plan's own account of what it replaces and withdraws is checked against BRAIN, never trusted", () => {
  assert.deepEqual(classified("unledgered").errors, [
    `${PLAN}: says it withdraws [], but BRAIN shows [${JSON.stringify([GREETING, GREETING_LATER])}]`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a plan derived from anything but the accepted regression as it is now is refused", () => {
  assert.deepEqual(classified("stale-base").errors, [
    `${PLAN}: derived from ${"a".repeat(64)}, not from the accepted regression ${BASE}`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a trusted regression without a plan classifies nothing, so every one of its cases must hold", () => {
  const trusted = regressionCandidate("kept");
  fs.rmSync(path.join(trusted, PLAN));
  assert.deepEqual(classify(trusted, regressionCandidate("kept"), BASE), {
    retained: [],
    replaced: new Map(),
    withdrawn: new Map(),
    errors: [],
  });
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a trusted case that does not pass is excused only when every commitment it points at was superseded", () => {
  const cases: Case[] = [
    { file: "a.test.ts", title: "retained", places: ["kept.md"] },
    { file: "a.test.ts", title: "superseded", places: ["gone.md"] },
    { file: "a.test.ts", title: "partly superseded", places: ["gone.md", "kept.md"] },
    { file: "a.test.ts", title: "unlinked", places: [] },
    { file: "a.test.ts", title: "skipped", places: ["kept.md"] },
    { file: "a.test.ts", title: "missing", places: ["kept.md"] },
  ];
  const results: Result[] = [
    { file: "a.test.ts", name: "retained", outcome: "fail" },
    { file: "a.test.ts", name: "superseded", outcome: "fail" },
    { file: "a.test.ts", name: "partly superseded", outcome: "fail" },
    { file: "a.test.ts", name: "unlinked", outcome: "fail" },
    { file: "a.test.ts", name: "skipped", outcome: "skip" },
  ];
  assert.deepEqual(judge(cases, results, new Set(["gone.md"])), [
    'a.test.ts: "retained" failed',
    'a.test.ts: "partly superseded" failed',
    'a.test.ts: "unlinked" failed',
    'a.test.ts: "skipped" was skipped',
    'a.test.ts: "missing" not run',
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a trusted result no expected case accounts for is held: it points at nothing", () => {
  const cases: Case[] = [{ file: "scripts/a.test.ts", title: "named", places: ["kept.md"] }];
  const results: Result[] = [
    { file: "scripts/a.test.ts", name: "named", outcome: "pass" },
    { file: "scripts/a.test.ts", name: "unreadable title", outcome: "fail" },
    { file: "scripts/a.test.ts", name: "unreadable but passing", outcome: "pass" },
    { file: "scripts/b.test.ts", name: "scripts/b.test.ts", outcome: "pass" },
  ];
  assert.deepEqual(judge(cases, results, new Set(["kept.md"])), [
    'scripts/a.test.ts: "unreadable title" failed, and points at nothing',
    "scripts/b.test.ts: did not run as a whole",
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("trusted results are matched to cases one to one: two cases with one title need two passes", () => {
  const cases: Case[] = [
    { file: "scripts/a.test.ts", title: "twice", places: ["kept.md"] },
    { file: "scripts/a.test.ts", title: "twice", places: ["kept.md"] },
  ];
  const results: Result[] = [
    { file: "scripts/a.test.ts", name: "twice", outcome: "pass" },
    { file: "scripts/a.test.ts", name: "twice", outcome: "fail" },
  ];
  assert.deepEqual(judge(cases, results, new Set()), ['scripts/a.test.ts: "twice" failed']);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a trusted file that does not run as a whole proves none of its cases, even if it reports a pass", () => {
  const cases: Case[] = [{ file: "scripts/a.test.ts", title: "holds", places: ["kept.md"] }];
  const results: Result[] = [
    { file: "scripts/a.test.ts", name: "holds", outcome: "pass" },
    { file: "scripts/a.test.ts", name: "scripts\\a.test.ts", outcome: "pass" },
  ];
  assert.deepEqual(judge(cases, results, new Set()), ['scripts/a.test.ts: "holds" did not run as a whole']);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a candidate cannot weaken a retained commitment by weakening its own cases: the accepted regression's cases judge it", () => {
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("weakened"), BASE), [
    'scripts/cases.test.ts: "adds" failed',
    'scripts/cases.test.ts: "adds as its fixture says" failed',
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a candidate cannot change the data the accepted regression's cases read, even beside them: its data judges it", () => {
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("refixtured"), BASE), [
    'as the next accepted regression, scripts/cases.test.ts: "adds" fails when the accepted regression replays it',
    'scripts/cases.test.ts: "adds" failed',
    'scripts/cases.test.ts: "adds as its fixture says" failed',
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a candidate cannot relabel a retained commitment's case away: the accepted regression's links choose what judges it", () => {
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("relabeled"), BASE), [
    // Its own links no longer hold either: the case points at a commitment its plan no longer states.
    'as the next accepted regression, scripts/cases.test.ts: "adds" points at brain/learning/k/26/01/01/01/nodes/greeting.md, which the plan does not state',
    "as the next accepted regression, src/add.ts: the plan says its cases show it, but no case points at it",
    'as the next accepted regression, scripts/cases.test.ts: "adds" fails when the accepted regression replays it',
    'scripts/cases.test.ts: "adds" failed',
    'scripts/cases.test.ts: "adds as its fixture says" failed',
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a replacement is proven only when every candidate case pointing at it passes; a skipped one proves nothing", () => {
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("replaced-skipped"), BASE), [
    'as the next accepted regression, scripts/cases.test.ts: "greets with hi" is skipped when the accepted regression replays it',
    'replacement not proven: scripts/cases.test.ts: "greets with hi" was skipped',
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("cases are replayed without the npm variables of whatever started the check", () => {
  const before = process.env.npm_package_name;
  process.env.npm_package_name = "kaal";
  try {
    assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("npm-aware"), BASE), [
      'as the next accepted regression, scripts/cases.test.ts: "knows no package" fails when the accepted regression replays it',
    ]);
  } finally {
    if (before === undefined) delete process.env.npm_package_name;
    else process.env.npm_package_name = before;
  }
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a candidate whose code ends the run early proves none of the cases in that file", () => {
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("exits"), BASE), [
    'as the next accepted regression, scripts/cases.test.ts: "adds" is named but does not run',
    'as the next accepted regression, scripts/cases.test.ts: "greets" is named but does not run',
    'as the next accepted regression, scripts/cases.test.ts: "adds as its fixture says" is named but does not run',
    "as the next accepted regression, scripts/cases.test.ts: does not run as a whole",
    'scripts/cases.test.ts: "adds" did not run as a whole',
    'scripts/cases.test.ts: "greets" did not run as a whole',
    'scripts/cases.test.ts: "adds as its fixture says" did not run as a whole',
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a candidate that withdraws or replaces a commitment through BRAIN is not held to its old cases", () => {
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("withdrawn"), BASE), []);
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("replaced"), BASE), []);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("the accepted regression's cases are the case files its npm test names, quoted or not, and nothing it only preloads", () => {
  assert.deepEqual(caseFiles(regressionTrusted()), ["scripts/cases.test.ts"]);
  assert.deepEqual(caseFiles(regressionCandidate("quoted-globs")), ["scripts/cases.test.ts"]);
  assert.deepEqual(caseFiles(regressionCandidate("preloaded")), ["scripts/cases.test.ts"]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("an accepted regression whose npm test is more than tsx --test with case files cannot be replayed, so every candidate is refused", () => {
  assert.deepEqual(regressionErrors(regressionCandidate("preloaded"), regressionCandidate("kept"), BASE), [
    `the accepted regression's npm test is not "tsx --test" with case files only ("tsx --import ./scripts/setup.ts --test scripts/*.test.ts"), so its cases cannot be run as it runs them`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("an accepted regression whose npm test runs no case it can name judges nothing, so every candidate is refused", () => {
  assert.deepEqual(regressionErrors(regressionCandidate("no-cases"), regressionCandidate("kept"), BASE), [
    "the accepted regression's npm test runs no case it can name, so nothing could judge the candidate",
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a candidate that could not judge the next change once accepted is refused before it is accepted: every case it runs must be one it names", () => {
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("preloaded"), BASE).slice(0, 1), [
    'as the next accepted regression, npm test is not "tsx --test" with case files only ("tsx --import ./scripts/setup.ts --test scripts/*.test.ts"), so its cases cannot be run as it runs them',
  ]);
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("no-cases"), BASE).slice(0, 2), [
    "as the next accepted regression, its npm test would run no case it can name",
    "as the next accepted regression, scripts/unnamed.test.ts:3: a case whose title cannot be read, so no link can follow it",
  ]);
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("unnamed"), BASE), [
    "as the next accepted regression, scripts/cases.test.ts:24: a case whose title cannot be read, so no link can follow it",
    'as the next accepted regression, scripts/cases.test.ts: "adds 1 to nothing" runs but is not named',
    'as the next accepted regression, scripts/cases.test.ts: "adds 2 to nothing" runs but is not named',
  ]);
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("ghost"), BASE), [
    'as the next accepted regression, scripts/cases.test.ts: "ghost" is named but does not run',
  ]);
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("option-shaped"), BASE).slice(0, 1), [
    'as the next accepted regression, npm test is not "tsx --test" with case files only ("tsx --test --test-name-pattern=never.test.ts scripts/*.test.ts"), so its cases cannot be run as it runs them',
  ]);
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("shell-expanded"), BASE).slice(0, 1), [
    'as the next accepted regression, npm test is not "tsx --test" with case files only ("tsx --test $npm_package_name.test.ts scripts/*.test.ts"), so its cases cannot be run as it runs them',
  ]);
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("escaping"), BASE).slice(0, 1), [
    "as the next accepted regression, npm test names case files outside its checkout (../repo/extra/*.test.ts)",
  ]);
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("nameless"), BASE).slice(0, 1), [
    "as the next accepted regression, npm test names case files that do not exist (extra/*.test.ts)",
  ]);
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("hooked"), BASE).slice(0, 1), [
    "as the next accepted regression, npm ci or npm test runs pretest, which its cases' replay would not",
  ]);
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("prepared"), BASE).slice(0, 1), [
    "as the next accepted regression, npm ci or npm test runs prepare, which its cases' replay would not",
  ]);
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("dependent"), BASE).slice(0, 1), [
    "as the next accepted regression, npm ci or npm test runs dependencies, which its cases' replay would not",
  ]);
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("fails-own"), BASE), [
    'as the next accepted regression, scripts/cases.test.ts: "fails" fails when the accepted regression replays it',
  ]);
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("aliased"), BASE), [
    'as the next accepted regression, scripts/cases.test.ts: "adds zero" runs but is not named',
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a candidate named by a relative path runs with its own dependencies", () => {
  const candidate = regressionCandidate("kept");
  const word = path.join(candidate, "node_modules", "kaal-word");
  fs.mkdirSync(word, { recursive: true });
  fs.writeFileSync(path.join(word, "package.json"), '{ "name": "kaal-word", "type": "module", "main": "index.js" }');
  fs.writeFileSync(path.join(word, "index.js"), 'export const word = "hello";\n');
  fs.writeFileSync(
    path.join(candidate, "scripts", "word.test.ts"),
    'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { word } from "kaal-word";\n\n// Why: src/add.ts\ntest("says a word", () => {\n  assert.equal(word, "hello");\n});\n',
  );
  // Named from a directory of another depth than the scratch copies', as the accepted state's checkout is in CI.
  const from = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kaal-cwd-")), "a", "b");
  fs.mkdirSync(from, { recursive: true });
  const cwd = process.cwd();
  process.chdir(from);
  try {
    assert.deepEqual(regressionErrors(regressionTrusted(), path.relative(from, candidate), BASE), []);
  } finally {
    process.chdir(cwd);
  }
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("KAAL's own plan states a place for every commitment and the accepted regression it was derived from, and its npm test can be replayed and names every case", () => {
  const plan = fs.readFileSync(path.join(REPO, PLAN), "utf8");
  assert.equal(planCommitments(plan).length, [...plan.matchAll(/^\d+\. /gm)].length);
  assert.match(planLedger(plan).base ?? "", /^[0-9a-f]{64}$/);
  assert.equal(unreplayable(REPO), undefined);
  assert.deepEqual(unnamedCases(REPO), []);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a case's commitments are the Why: lines directly above it, and only those", () => {
  assert.deepEqual(
    fileCases(
      "x.test.ts",
      '// Why: a.md\n// Why: b.md\ntest("both", () => {});\n\n// Why: c.md\n\ntest("none", () => {});\n',
    ),
    [
      { file: "x.test.ts", title: "both", places: ["a.md", "b.md"] },
      { file: "x.test.ts", title: "none", places: [] },
    ],
  );
  assert.deepEqual(fileCases("x.test.ts", 'test("escaped \\x41", () => {});\n'), []);
});
