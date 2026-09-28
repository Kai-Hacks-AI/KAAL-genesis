import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { type Case, caseFiles, fileCases, PLAN, planCommitments, unnamedCases } from "./links.js";
import {
  classify,
  judge,
  judgeFiles,
  planLedger,
  regressionErrors,
  regressionIdentity,
  runTrusted,
  unreplayable,
  type Result,
} from "./regression.js";
import { kaal, regressionCandidate, regressionTrusted } from "./test-data.js";

/** The subject of this file's cases about KAAL itself. */
const KAAL = kaal();
/** The trusted regression's identity, as the candidates in test-data/regression name it. */
const BASE = "b".repeat(64);
const GREETING = "brain/learning/k/26/01/01/01/nodes/greeting.md";
const GREETING_LATER = "brain/learning/k/26/01/02/01/nodes/greeting.md";

// Why: brain/learning/genesis/26/09/27/07/nodes/plan.md
test("the regression hands its cases the data its plan provides, both when it replays the accepted cases and when it runs the candidate's own", () => {
  assert.deepEqual(regressionErrors(regressionCandidate("plan-data"), regressionCandidate("plan-data"), BASE), []);
  // A candidate whose plan provides data no run could hand is refused with what is wrong with it, as the links check
  // says it, not by failing to run: its cases run without the data.
  const unhanded = regressionCandidate("plan-data");
  const plan = path.join(unhanded, PLAN);
  fs.writeFileSync(plan, fs.readFileSync(plan, "utf8").replace("data: test-data/plan", "data: missing"));
  const errors = regressionErrors(regressionCandidate("plan-data"), unhanded, BASE);
  assert.ok(
    errors.includes(`as the next accepted regression, ${PLAN}: data: missing is no directory inside the state`),
    errors.join("\n"),
  );
});

// Why: brain/learning/genesis/26/09/27/07/nodes/plan.md
test("a plan's commitments are read from its section headed exactly so, wherever it begins, and never from a heading that only begins so or one in a fenced example", () => {
  const entries =
    "1. Adding. Stated in `src/add.ts`. Shown by its cases.\n2. Greeting. Stated in `brain/learning/k/26/01/01/01/nodes/greeting.md`. Shown by its cases.\n";
  const decoy = "1. Decoy. Stated in `src/decoy.ts`. Shown by its cases.\n";
  const real = ["src/add.ts", "brain/learning/k/26/01/01/01/nodes/greeting.md"];
  for (const plan of [
    `## Commitments\n\n${entries}`,
    `# Plan\n\n## Commitments considered\n\n${decoy}\n## Commitments\n\n${entries}`,
    `# Plan\n\n## Examples\n\n\`\`\`markdown\n## Commitments\n\n${decoy}\`\`\`\n\n## Commitments\n\n${entries}`,
  ])
    assert.deepEqual(planCommitments(plan), real, plan);
  // So the regression reads an accepted plan that begins with its commitments as having them, as the links check does.
  const trusted = regressionCandidate("kept");
  const plan = path.join(trusted, PLAN);
  const text = fs.readFileSync(plan, "utf8");
  fs.writeFileSync(plan, text.slice(text.indexOf("## Commitments")));
  assert.deepEqual(classify(trusted, regressionCandidate("kept"), BASE).retained, real);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("a trusted case that does not pass is held, whatever it points at", () => {
  const cases: Case[] = [
    { file: "a.test.ts", title: "failed", places: ["kept.md"] },
    { file: "a.test.ts", title: "unlinked", places: [] },
    { file: "a.test.ts", title: "skipped", places: ["kept.md"] },
    { file: "a.test.ts", title: "missing", places: ["kept.md"] },
    { file: "a.test.ts", title: "passed", places: ["kept.md"] },
  ];
  const results: Result[] = [
    { file: "a.test.ts", name: "failed", outcome: "fail" },
    { file: "a.test.ts", name: "unlinked", outcome: "fail" },
    { file: "a.test.ts", name: "skipped", outcome: "skip" },
    { file: "a.test.ts", name: "passed", outcome: "pass" },
  ];
  assert.deepEqual(judge(cases, results), [
    'a.test.ts: "failed" failed',
    'a.test.ts: "unlinked" failed',
    'a.test.ts: "skipped" was skipped',
    'a.test.ts: "missing" not run',
  ]);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("a trusted result no expected case accounts for is held: it points at nothing", () => {
  const cases: Case[] = [{ file: "scripts/a.test.ts", title: "named", places: ["kept.md"] }];
  const results: Result[] = [
    { file: "scripts/a.test.ts", name: "named", outcome: "pass" },
    { file: "scripts/a.test.ts", name: "unreadable title", outcome: "fail" },
    { file: "scripts/a.test.ts", name: "unreadable but passing", outcome: "pass" },
    { file: "scripts/b.test.ts", name: "scripts/b.test.ts", outcome: "pass" },
  ];
  assert.deepEqual(judge(cases, results), [
    'scripts/a.test.ts: "unreadable title" failed, and points at nothing',
    "scripts/b.test.ts: did not run as a whole",
  ]);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("trusted results are matched to cases one to one: two cases with one title need two passes", () => {
  const cases: Case[] = [
    { file: "scripts/a.test.ts", title: "twice", places: ["kept.md"] },
    { file: "scripts/a.test.ts", title: "twice", places: ["kept.md"] },
  ];
  const results: Result[] = [
    { file: "scripts/a.test.ts", name: "twice", outcome: "pass" },
    { file: "scripts/a.test.ts", name: "twice", outcome: "fail" },
  ];
  assert.deepEqual(judge(cases, results), ['scripts/a.test.ts: "twice" failed']);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("a trusted file that does not run as a whole proves none of its cases, even if it reports a pass", () => {
  const cases: Case[] = [{ file: "scripts/a.test.ts", title: "holds", places: ["kept.md"] }];
  const results: Result[] = [
    { file: "scripts/a.test.ts", name: "holds", outcome: "pass" },
    { file: "scripts/a.test.ts", name: "scripts\\a.test.ts", outcome: "pass" },
  ];
  assert.deepEqual(judge(cases, results), ['scripts/a.test.ts: "holds" did not run as a whole']);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("a candidate cannot weaken a retained commitment by weakening its own cases: the accepted regression's cases judge it", () => {
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("weakened"), BASE), [
    'inherited case not excluded: scripts/cases.test.ts: "adds" failed',
    'inherited case not excluded: scripts/cases.test.ts: "adds as its fixture says" failed',
    // Nor by leaving one out: once accepted, its regression would no longer have it, and no record gives it up.
    'scripts/cases.test.ts: "adds as its fixture says": in the regression, and no acceptance record excludes it, but the candidate no longer has it',
  ]);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("a candidate cannot change the data the accepted regression's cases read, even beside them: its data judges it", () => {
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("refixtured"), BASE), [
    'as the next accepted regression, scripts/cases.test.ts: "adds" fails when the accepted regression replays it',
    'inherited case not excluded: scripts/cases.test.ts: "adds" failed',
    'inherited case not excluded: scripts/cases.test.ts: "adds as its fixture says" failed',
  ]);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("a candidate cannot relabel a retained commitment's case away: the accepted regression's links choose what judges it", () => {
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("relabeled"), BASE), [
    // Its own links no longer hold either: the case points at a commitment its plan no longer states.
    'as the next accepted regression, scripts/cases.test.ts: "adds" points at brain/learning/k/26/01/01/01/nodes/greeting.md, which the plan does not state',
    "as the next accepted regression, src/add.ts: the plan says its cases show it, but no case points at it",
    'as the next accepted regression, scripts/cases.test.ts: "adds" fails when the accepted regression replays it',
    'inherited case not excluded: scripts/cases.test.ts: "adds" failed',
    'inherited case not excluded: scripts/cases.test.ts: "adds as its fixture says" failed',
    // Nor does its plan's account of a withdrawal give up the commitment, or the cases it leaves out.
    "brain/learning/k/26/01/01/01/nodes/greeting.md: inherited, and no acceptance record gives it up, but the candidate's regression no longer requires it",
    `scripts/cases.test.ts: "adds": helps prove src/add.ts in the regression, but no longer does in the candidate's`,
    'scripts/cases.test.ts: "adds as its fixture says": in the regression, and no acceptance record excludes it, but the candidate no longer has it',
    'scripts/cases.test.ts: "greets": in the regression, and no acceptance record excludes it, but the candidate no longer has it',
  ]);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
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

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("a candidate whose code ends the run early proves none of the cases in that file", () => {
  assert.deepEqual(regressionErrors(regressionTrusted(), regressionCandidate("exits"), BASE), [
    'as the next accepted regression, scripts/cases.test.ts: "adds" is named but does not run',
    'as the next accepted regression, scripts/cases.test.ts: "greets" is named but does not run',
    'as the next accepted regression, scripts/cases.test.ts: "adds as its fixture says" is named but does not run',
    "as the next accepted regression, scripts/cases.test.ts: does not run as a whole",
    'inherited case not excluded: scripts/cases.test.ts: "adds" did not run as a whole',
    'inherited case not excluded: scripts/cases.test.ts: "greets" did not run as a whole',
    'inherited case not excluded: scripts/cases.test.ts: "adds as its fixture says" did not run as a whole',
  ]);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("the accepted regression's cases are the case files its npm test names, quoted or not, and nothing it only preloads", () => {
  assert.deepEqual(caseFiles(regressionTrusted()), ["scripts/cases.test.ts"]);
  assert.deepEqual(caseFiles(regressionCandidate("quoted-globs")), ["scripts/cases.test.ts"]);
  assert.deepEqual(caseFiles(regressionCandidate("preloaded")), ["scripts/cases.test.ts"]);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("an accepted regression whose npm test is more than tsx --test with case files cannot be replayed, so every candidate is refused", () => {
  assert.deepEqual(regressionErrors(regressionCandidate("preloaded"), regressionCandidate("kept"), BASE), [
    `the accepted regression's npm test is not "tsx --test" with case files only ("tsx --import ./scripts/setup.ts --test scripts/*.test.ts"), so its cases cannot be run as it runs them`,
  ]);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("an accepted regression whose npm test runs no case it can name judges nothing, so every candidate is refused", () => {
  assert.deepEqual(regressionErrors(regressionCandidate("no-cases"), regressionCandidate("kept"), BASE), [
    "the accepted regression's npm test runs no case it can name, so nothing could judge the candidate",
  ]);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
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

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
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

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("a regression's identity changes with what it consists of, a link as a link, and with nothing else", () => {
  const copy = () => regressionCandidate("kept");
  const [plain, linked, other] = [copy(), copy(), copy()];
  assert.equal(regressionIdentity(plain), regressionIdentity(linked));
  // The same bytes as test data, once as files and once through a link, are different test data.
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-target-"));
  fs.writeFileSync(path.join(target, "value.txt"), "3\n");
  fs.mkdirSync(path.join(plain, "test-data", "shared"), { recursive: true });
  fs.writeFileSync(path.join(plain, "test-data", "shared", "value.txt"), "3\n");
  fs.mkdirSync(path.join(linked, "test-data"), { recursive: true });
  fs.symlinkSync(target, path.join(linked, "test-data", "shared"), "junction");
  assert.notEqual(regressionIdentity(plain), regressionIdentity(linked));
  // An empty directory of test data, a link's exact target, and test data's exact bytes are all part of it.
  const empty = copy();
  const beforeEmpty = regressionIdentity(empty);
  fs.mkdirSync(path.join(empty, "test-data", "empty"), { recursive: true });
  assert.notEqual(regressionIdentity(empty), beforeEmpty);
  const [wide, wider] = [copy(), copy()];
  fs.mkdirSync(path.join(wide, "test-data"), { recursive: true });
  fs.mkdirSync(path.join(wider, "test-data"), { recursive: true });
  fs.symlinkSync(path.join(target, "\u0100"), path.join(wide, "test-data", "to"), "junction");
  fs.symlinkSync(path.join(target, "\u0200"), path.join(wider, "test-data", "to"), "junction");
  assert.notEqual(regressionIdentity(wide), regressionIdentity(wider));
  const [lf, crlf] = [copy(), copy()];
  fs.mkdirSync(path.join(lf, "test-data"), { recursive: true });
  fs.mkdirSync(path.join(crlf, "test-data"), { recursive: true });
  fs.writeFileSync(path.join(lf, "test-data", "lines.txt"), "a\nb\n");
  fs.writeFileSync(path.join(crlf, "test-data", "lines.txt"), "a\r\nb\r\n");
  assert.notEqual(regressionIdentity(lf), regressionIdentity(crlf));
  // So is a fixture kept beside the cases.
  const [beside, besideCrlf] = [copy(), copy()];
  fs.writeFileSync(path.join(beside, "scripts", "fixtures", "sum.txt"), "3\n");
  fs.writeFileSync(path.join(besideCrlf, "scripts", "fixtures", "sum.txt"), "3\r\n");
  assert.notEqual(regressionIdentity(beside), regressionIdentity(besideCrlf));
  // So is test data named like code.
  const [tsLf, tsCrlf] = [copy(), copy()];
  fs.mkdirSync(path.join(tsLf, "test-data"), { recursive: true });
  fs.mkdirSync(path.join(tsCrlf, "test-data"), { recursive: true });
  fs.writeFileSync(path.join(tsLf, "test-data", "input.ts"), "a\nb\n");
  fs.writeFileSync(path.join(tsCrlf, "test-data", "input.ts"), "a\r\nb\r\n");
  assert.notEqual(regressionIdentity(tsLf), regressionIdentity(tsCrlf));
  // And what selects the runner that judges: another lockfile is another regression.
  const relocked = copy();
  const beforeLock = regressionIdentity(relocked);
  fs.writeFileSync(path.join(relocked, "package-lock.json"), '{ "lockfileVersion": 3, "packages": { "": {} } }\n');
  assert.notEqual(regressionIdentity(relocked), beforeLock);
  // Including a lockfile that takes precedence over it, and npm's own settings.
  for (const file of ["npm-shrinkwrap.json", ".npmrc"]) {
    const installed = copy();
    const before = regressionIdentity(installed);
    fs.writeFileSync(path.join(installed, file), "{}\n");
    assert.notEqual(regressionIdentity(installed), before, file);
  }
  // What a link inside the state points at is read through it, so its bytes are part of it too.
  // A file link needs privileges on Windows, so this is shown where one can be made.
  if (process.platform !== "win32") {
    const through = copy();
    fs.mkdirSync(path.join(through, "config"), { recursive: true });
    fs.renameSync(path.join(through, "package.json"), path.join(through, "config", "package.json"));
    fs.symlinkSync(path.join("config", "package.json"), path.join(through, "package.json"));
    const beforeTarget = regressionIdentity(through);
    fs.appendFileSync(path.join(through, "config", "package.json"), "\n");
    assert.notEqual(regressionIdentity(through), beforeTarget);
    // Including a target whose name only begins with two dots, which is still inside the state.
    const dotted = copy();
    fs.renameSync(path.join(dotted, "package.json"), path.join(dotted, "..package.json"));
    fs.symlinkSync("..package.json", path.join(dotted, "package.json"));
    const beforeDotted = regressionIdentity(dotted);
    fs.appendFileSync(path.join(dotted, "..package.json"), "\n");
    assert.notEqual(regressionIdentity(dotted), beforeDotted);
    // A link's target is taken as its bytes, even ones that are not UTF-8, as the replay copies it.
    const [raw, rawer] = [copy(), copy()];
    fs.mkdirSync(path.join(raw, "test-data"), { recursive: true });
    fs.mkdirSync(path.join(rawer, "test-data"), { recursive: true });
    fs.symlinkSync(Buffer.from([0x61, 0x80]), path.join(raw, "test-data", "to"));
    fs.symlinkSync(Buffer.from([0x61, 0x81]), path.join(rawer, "test-data", "to"));
    assert.notEqual(regressionIdentity(raw), regressionIdentity(rawer));
    // But such a target cannot be followed by name, so what it points at could change unseen: it is refused.
    assert.equal(
      unreplayable(raw),
      "the accepted regression's inputs have names or link targets that are not UTF-8 (test-data/to)",
    );
    // So is test data whose name is not UTF-8: it is known by its own name, and what it holds is part of it.
    const odd = copy();
    fs.mkdirSync(path.join(odd, "test-data"), { recursive: true });
    const oddFile = Buffer.concat([Buffer.from(path.join(odd, "test-data", "x")), Buffer.from([0x80])]);
    fs.writeFileSync(oddFile, "1\n");
    const beforeOdd = regressionIdentity(odd);
    fs.writeFileSync(oddFile, "2\n");
    assert.notEqual(regressionIdentity(odd), beforeOdd);
    // The replay copies it by name, which it has none of, so such a regression is refused.
    assert.equal(
      unreplayable(odd),
      "the accepted regression's inputs have names or link targets that are not UTF-8 (test-data/x\ufffd)",
    );
  }
  // And the checker's own code, down to what it imports.
  const rejudged = copy();
  fs.mkdirSync(path.join(rejudged, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(rejudged, "scripts", "check-regression.ts"), 'import "./helper.js";\n');
  fs.writeFileSync(path.join(rejudged, "scripts", "helper.ts"), "export const rule = 1;\n");
  const beforeHelper = regressionIdentity(rejudged);
  fs.writeFileSync(path.join(rejudged, "scripts", "helper.ts"), "export const rule = 2;\n");
  assert.notEqual(regressionIdentity(rejudged), beforeHelper);
  // And whether test data may be executed, which the replay keeps.
  if (process.platform !== "win32") {
    const runnable = copy();
    const plainMode = regressionIdentity(runnable);
    fs.chmodSync(path.join(runnable, "scripts", "fixtures", "sum.txt"), 0o755);
    assert.notEqual(regressionIdentity(runnable), plainMode);
  }
  // Every entry is taken byte for byte, so a case whose line endings differ is another regression.
  const [unix, windows] = [copy(), copy()];
  const cases = (repo: string) => path.join(repo, "scripts", "cases.test.ts");
  fs.writeFileSync(cases(windows), fs.readFileSync(cases(windows), "utf8").replace(/\n/g, "\r\n"));
  assert.notEqual(regressionIdentity(unix), regressionIdentity(windows));
  // Code that is not part of the regression does not change it.
  const before = regressionIdentity(other);
  fs.writeFileSync(path.join(other, "src", "unrelated.ts"), "export {};\n");
  assert.equal(regressionIdentity(other), before);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("the replay gives the accepted regression's cases its own plan, not the plan of a candidate that replaces a commitment", () => {
  const trusted = regressionCandidate("kept");
  const plan = path.join(trusted, PLAN);
  fs.appendFileSync(plan, "\nThe accepted regression's own plan.\n");
  // A case that reads the plan, as a check of the regression's own links does, reads what its links were written against.
  fs.writeFileSync(
    path.join(trusted, "scripts", "plan.test.ts"),
    [
      'import assert from "node:assert/strict";',
      'import fs from "node:fs";',
      'import test from "node:test";',
      'test("reads the plan it was written against", () => {',
      '  assert.match(fs.readFileSync("test/regression-plan.md", "utf8"), /The accepted regression\'s own plan\./);',
      "});",
      "",
    ].join("\n"),
  );
  const results = runTrusted(trusted, regressionCandidate("replaced"));
  assert.deepEqual(
    results.filter((r) => r.file === "scripts/plan.test.ts").map((r) => r.outcome),
    ["pass"],
  );
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("the replay holds only the accepted regression's cases, none the candidate adds of its own", () => {
  const trusted = regressionCandidate("kept");
  // A case that reads which cases there are, as a check of the regression's links does.
  fs.writeFileSync(
    path.join(trusted, "scripts", "listing.test.ts"),
    [
      'import assert from "node:assert/strict";',
      'import fs from "node:fs";',
      'import test from "node:test";',
      'test("finds only the cases it was written with", () => {',
      '  assert.equal(fs.existsSync("scripts/added.test.ts"), false);',
      "});",
      "",
    ].join("\n"),
  );
  const candidate = regressionCandidate("kept");
  fs.writeFileSync(
    path.join(candidate, "scripts", "added.test.ts"),
    'import test from "node:test";\ntest("added", () => {});\n',
  );
  const results = runTrusted(trusted, candidate);
  assert.deepEqual(
    results.filter((r) => r.file === "scripts/listing.test.ts").map((r) => r.outcome),
    ["pass"],
  );
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("the replay shows the accepted cases what the accepted regression knew: its case selection, and none of the candidate's additions its places reach", () => {
  const trusted = regressionCandidate("kept");
  const plan = path.join(trusted, PLAN);
  fs.writeFileSync(
    plan,
    fs
      .readFileSync(plan, "utf8")
      .replace(/^(2\. Greeting\..*)$/m, "$1\n3. Parts. Stated in each `parts/*/PART.md`. Shown by its cases."),
  );
  fs.mkdirSync(path.join(trusted, "parts", "one"), { recursive: true });
  fs.writeFileSync(path.join(trusted, "parts", "one", "PART.md"), "one\n");
  fs.mkdirSync(path.join(trusted, "parts", "three"), { recursive: true });
  fs.writeFileSync(path.join(trusted, "parts", "three", "README"), "not yet a part\n");
  const selection = (
    JSON.parse(fs.readFileSync(path.join(trusted, "package.json"), "utf8")) as { scripts: { test: string } }
  ).scripts.test;
  // A case that looks at the state as a whole, as a check of the regression's links does.
  fs.writeFileSync(
    path.join(trusted, "scripts", "view.test.ts"),
    [
      'import assert from "node:assert/strict";',
      'import fs from "node:fs";',
      'import test from "node:test";',
      'test("sees the state as it was written against", () => {',
      '  assert.deepEqual(["one", "two", "three"].map((part) => fs.existsSync(`parts/${part}/PART.md`)), [true, false, false]);',
      `  assert.equal(JSON.parse(fs.readFileSync("package.json", "utf8")).scripts.test, ${JSON.stringify(selection)});`,
      "});",
      "",
    ].join("\n"),
  );
  // The candidate adds a part, which its own cases prove, and selects its cases differently.
  const candidate = regressionCandidate("kept");
  fs.cpSync(path.join(trusted, "parts"), path.join(candidate, "parts"), { recursive: true });
  fs.mkdirSync(path.join(candidate, "parts", "two"), { recursive: true });
  fs.writeFileSync(path.join(candidate, "parts", "two", "PART.md"), "two\n");
  // Including where the accepted state already had the directory, but not the part.
  fs.writeFileSync(path.join(candidate, "parts", "three", "PART.md"), "three\n");
  const manifest = path.join(candidate, "package.json");
  const pkg = JSON.parse(fs.readFileSync(manifest, "utf8")) as { scripts: Record<string, string> };
  fs.writeFileSync(manifest, JSON.stringify({ ...pkg, scripts: { ...pkg.scripts, test: "tsx --test src/*.test.ts" } }));
  const results = runTrusted(trusted, candidate);
  assert.deepEqual(
    results.filter((r) => r.file === "scripts/view.test.ts").map((r) => r.outcome),
    ["pass"],
  );
  // A candidate with a file where the accepted plan's directory belongs is judged, not crashed on.
  const blocked = regressionCandidate("kept");
  fs.rmSync(path.join(blocked, "test"), { recursive: true });
  fs.writeFileSync(path.join(blocked, "test"), "not a directory\n");
  assert.ok(runTrusted(regressionTrusted(), blocked).length > 0);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test(
  "the replay writes only inside its own copy, even where the candidate links a directory out of it",
  { skip: process.platform === "win32" },
  () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-outside-"));
    fs.writeFileSync(path.join(outside, "regression-plan.md"), "not the replay's\n");
    const candidate = regressionCandidate("kept");
    fs.rmSync(path.join(candidate, "test"), { recursive: true });
    fs.symlinkSync(outside, path.join(candidate, "test"));
    runTrusted(regressionTrusted(), candidate);
    assert.deepEqual(fs.readdirSync(outside), ["regression-plan.md"]);
    assert.equal(fs.readFileSync(path.join(outside, "regression-plan.md"), "utf8"), "not the replay's\n");
    // Nor where the candidate's npm test names a case by a path that climbs out of it, such as into the accepted state.
    const beside = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-beside-"));
    fs.mkdirSync(path.join(beside, "scripts"));
    fs.writeFileSync(path.join(beside, "scripts", "kept.test.ts"), "// the accepted state's\n");
    // The candidate kept as deep as the replay's copy, so one path reaches the same file from both.
    const climbing = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kaal-climbing-")), "repo");
    fs.cpSync(regressionCandidate("kept"), climbing, { recursive: true });
    const manifest = path.join(climbing, "package.json");
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8")) as { scripts: Record<string, string> };
    pkg.scripts.test = `${pkg.scripts.test} ../../${path.basename(beside)}/scripts/kept.test.ts`;
    fs.writeFileSync(manifest, JSON.stringify(pkg));
    assert.ok(
      caseFiles(climbing).some((file) => file.endsWith("kept.test.ts")),
      "the candidate names the case",
    );
    runTrusted(regressionTrusted(), climbing);
    assert.equal(fs.readFileSync(path.join(beside, "scripts", "kept.test.ts"), "utf8"), "// the accepted state's\n");
  },
);

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test(
  "the replay gives the accepted regression's cases only the permissions its identity records",
  { skip: process.platform === "win32" },
  () => {
    const trusted = regressionCandidate("kept");
    const fixture = path.join(trusted, "scripts", "fixtures", "sum.txt");
    const before = regressionIdentity(trusted);
    // A permission the identity does not record: a read-only fixture has the same identity as a writable one.
    fs.chmodSync(fixture, 0o400);
    assert.equal(regressionIdentity(trusted), before);
    // So the replay must not let a case see it.
    fs.writeFileSync(
      path.join(trusted, "scripts", "mode.test.ts"),
      [
        'import assert from "node:assert/strict";',
        'import fs from "node:fs";',
        'import test from "node:test";',
        'test("sees its fixture as the identity records it", () => {',
        '  assert.equal(fs.statSync("scripts/fixtures/sum.txt").mode & 0o777, 0o644);',
        "});",
        "",
      ].join("\n"),
    );
    const results = runTrusted(trusted, regressionCandidate("kept"));
    assert.deepEqual(
      results.filter((r) => r.file === "scripts/mode.test.ts").map((r) => r.outcome),
      ["pass"],
    );
  },
);

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("a candidate that would leave no checker to judge the next candidate with is refused before it is accepted", () => {
  const checkless = regressionCandidate("kept");
  fs.rmSync(path.join(checkless, "scripts", "check-regression.ts"));
  const manifest = path.join(checkless, "package.json");
  const pkg = JSON.parse(fs.readFileSync(manifest, "utf8")) as { scripts: Record<string, string> };
  delete pkg.scripts["regression:check"];
  fs.writeFileSync(manifest, JSON.stringify(pkg));
  assert.ok(
    regressionErrors(regressionTrusted(), checkless, BASE).includes(
      'as the next accepted regression, it has no checker to judge the next candidate with: scripts/check-regression.ts, run by "regression:check": "tsx scripts/check-regression.ts"',
    ),
  );
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("a state whose judging depends on files outside it cannot be replayed: local packages, links out of it, and checker code imported from outside it", () => {
  const local = regressionCandidate("kept");
  const pkg = path.join(local, "package.json");
  fs.writeFileSync(
    pkg,
    JSON.stringify({ ...JSON.parse(fs.readFileSync(pkg, "utf8")), devDependencies: { tsx: "file:../tsx" } }),
  );
  assert.equal(
    unreplayable(local),
    "the accepted regression's install takes packages other than from the registry as its lockfile pins them (tsx), which its identity does not cover",
  );
  // Without a lockfile nothing in the state pins the packages at all, so whatever is installed would judge.
  const unlocked = regressionCandidate("kept");
  fs.rmSync(path.join(unlocked, "package-lock.json"));
  assert.equal(
    unreplayable(unlocked),
    "the accepted regression's install takes packages other than from the registry as its lockfile pins them (no lockfile), which its identity does not cover",
  );
  // A lockfile can resolve a registry range to a local link on its own, so the lockfile is checked too.
  const relinked = regressionCandidate("kept");
  fs.writeFileSync(
    path.join(relinked, "package-lock.json"),
    JSON.stringify({
      lockfileVersion: 3,
      packages: { "": {}, "node_modules/tsx": { resolved: "../tsx", link: true } },
    }),
  );
  assert.equal(
    unreplayable(relinked),
    "the accepted regression's install takes packages other than from the registry as its lockfile pins them (node_modules/tsx), which its identity does not cover",
  );
  const linked = regressionCandidate("kept");
  fs.mkdirSync(path.join(linked, "test-data"), { recursive: true });
  fs.symlinkSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "kaal-outside-")),
    path.join(linked, "test-data", "shared"),
    "junction",
  );
  assert.equal(unreplayable(linked), "the accepted regression's inputs link outside its state (test-data/shared)");
  // As a candidate, either would leave the next accepted regression unable to judge from its own files.
  assert.deepEqual(regressionErrors(regressionTrusted(), linked, BASE).slice(0, 1), [
    "as the next accepted regression, inputs link outside its state (test-data/shared)",
  ]);
  // A link that climbs out of the state and back in by the name its directory has today points elsewhere
  // once the state is kept under another name, such as the accepted state beside the next candidate.
  if (process.platform !== "win32") {
    const reentering = regressionCandidate("kept");
    fs.mkdirSync(path.join(reentering, "config"));
    fs.rmSync(path.join(reentering, "package-lock.json"));
    fs.writeFileSync(
      path.join(reentering, "config", "package-lock.json"),
      '{ "lockfileVersion": 3, "packages": { "": {} } }\n',
    );
    fs.symlinkSync(
      `../${path.basename(reentering)}/config/package-lock.json`,
      path.join(reentering, "package-lock.json"),
    );
    assert.equal(
      unreplayable(reentering),
      "the accepted regression's inputs link outside its state (package-lock.json)",
    );
  }
  // Nor may an input be reached through a directory that is such a link: the link is followed as much as a link to the file.
  if (process.platform !== "win32") {
    const through = regressionCandidate("kept");
    fs.mkdirSync(path.join(through, "real"));
    fs.renameSync(path.join(through, "package-lock.json"), path.join(through, "real", "package-lock.json"));
    fs.symlinkSync(`../${path.basename(through)}/real`, path.join(through, "config"));
    fs.symlinkSync("config/package-lock.json", path.join(through, "package-lock.json"));
    assert.equal(unreplayable(through), "the accepted regression's inputs link outside its state (config)");
  }
  // The replay copies only cases and test data, so a case that is a link to other code would run the candidate's.
  if (process.platform !== "win32") {
    const redirected = regressionCandidate("kept");
    fs.renameSync(path.join(redirected, "scripts", "cases.test.ts"), path.join(redirected, "scripts", "real.ts"));
    fs.symlinkSync("real.ts", path.join(redirected, "scripts", "cases.test.ts"));
    assert.equal(
      unreplayable(redirected),
      "the accepted regression's cases or test data link to what its replay does not copy (scripts/cases.test.ts)",
    );
    // So would a plan that is a link: the replay would copy the link, and the case would read the candidate's plan.
    const linkedPlan = regressionCandidate("kept");
    fs.renameSync(path.join(linkedPlan, PLAN), path.join(linkedPlan, "test", "plan.md"));
    fs.symlinkSync("plan.md", path.join(linkedPlan, PLAN));
    assert.equal(
      unreplayable(linkedPlan),
      "the accepted regression's plan is a link, so its replay would read the candidate's (test/regression-plan.md)",
    );
    // Or a plan reached through a directory that is a link, which the replay would not reproduce.
    const linkedDir = regressionCandidate("kept");
    fs.renameSync(path.join(linkedDir, "test"), path.join(linkedDir, "config"));
    fs.symlinkSync("config", path.join(linkedDir, "test"));
    assert.equal(
      unreplayable(linkedDir),
      "the accepted regression's plan is a link, so its replay would read the candidate's (test/regression-plan.md)",
    );
    // And checker code reached through a link runs, and imports, from where the link leads.
    const throughLink = regressionCandidate("kept");
    fs.mkdirSync(path.join(throughLink, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(throughLink, "check.ts"), 'import "../change/evil.js";\n');
    fs.rmSync(path.join(throughLink, "scripts", "check-regression.ts"));
    fs.symlinkSync("../check.ts", path.join(throughLink, "scripts", "check-regression.ts"));
    assert.equal(
      unreplayable(throughLink),
      "the accepted regression's checker code is reached through a link (scripts/check-regression.ts)",
    );
  }
  // A checker's relative import is followed to the TypeScript file tsx would load for it, whatever its extension.
  const policy = regressionCandidate("kept");
  fs.mkdirSync(path.join(policy, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(policy, "scripts", "check-regression.ts"), 'import "./policy.mjs";\n');
  fs.writeFileSync(path.join(policy, "scripts", "policy.mts"), "export const rule = 1;\n");
  assert.ok(judgeFiles(policy).includes("scripts/policy.mts"));
  assert.equal(unreplayable(policy), undefined);
  // However the import is written: a comment inside it hides nothing, as the checker's own module loader sees it.
  const commented = regressionCandidate("kept");
  fs.mkdirSync(path.join(commented, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(commented, "scripts", "check-regression.ts"),
    'import policy from /* why */ "./policy.js";\nconsole.log(policy);\n',
  );
  fs.writeFileSync(path.join(commented, "scripts", "policy.ts"), "export default 1;\n");
  assert.ok(judgeFiles(commented).includes("scripts/policy.ts"));
  const beforePolicy = regressionIdentity(commented);
  fs.writeFileSync(path.join(commented, "scripts", "policy.ts"), "export default 2;\n");
  assert.notEqual(regressionIdentity(commented), beforePolicy);
  // And the checker is found only where it starts, so a state that runs it from anywhere else is refused.
  const moved = regressionCandidate("kept");
  const manifest = path.join(moved, "package.json");
  const movedPkg = JSON.parse(fs.readFileSync(manifest, "utf8")) as { scripts: Record<string, string> };
  fs.writeFileSync(
    manifest,
    JSON.stringify({ ...movedPkg, scripts: { ...movedPkg.scripts, "regression:check": "tsx judge/check.ts" } }),
  );
  assert.equal(
    unreplayable(moved),
    'the accepted regression\'s checker is run as "tsx judge/check.ts", not "tsx scripts/check-regression.ts", so its code could not be found',
  );
  // How TypeScript compiles the checker and the cases is part of how it judges, down to a local configuration it extends.
  const configured = regressionCandidate("kept");
  fs.writeFileSync(path.join(configured, "tsconfig.json"), '{ "extends": "./base.json" }\n');
  fs.writeFileSync(path.join(configured, "base.json"), '{ "compilerOptions": { "jsx": "react" } }\n');
  const beforeConfig = regressionIdentity(configured);
  fs.writeFileSync(path.join(configured, "base.json"), '{ "compilerOptions": { "jsx": "preserve" } }\n');
  assert.notEqual(regressionIdentity(configured), beforeConfig);
  // One that extends a configuration outside the state is refused: the identity could not see it.
  fs.writeFileSync(path.join(configured, "tsconfig.json"), '{ "extends": "../elsewhere/tsconfig.json" }\n');
  assert.equal(
    unreplayable(configured),
    "the accepted regression's TypeScript configuration extends one outside its state (tsconfig.json: ../elsewhere/tsconfig.json)",
  );
  // And one that names no file the state holds is refused: whatever satisfied it, the identity would not see.
  fs.rmSync(path.join(policy, "scripts", "policy.mts"));
  assert.equal(
    unreplayable(policy),
    "the accepted regression's checker imports code it does not hold (scripts/check-regression.ts: ./policy.mjs)",
  );
  // So would a checker that imports code from outside its state, such as from the next candidate beside it.
  const reaching = regressionCandidate("kept");
  fs.mkdirSync(path.join(reaching, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(reaching, "scripts", "check-regression.ts"), 'import "../../change/evil.js";\n');
  assert.equal(
    unreplayable(reaching),
    "the accepted regression's checker imports code outside its state (scripts/check-regression.ts: ../../change/evil.js)",
  );
  assert.deepEqual(regressionErrors(regressionTrusted(), reaching, BASE).slice(0, 1), [
    "as the next accepted regression, checker imports code outside its state (scripts/check-regression.ts: ../../change/evil.js)",
  ]);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("KAAL's own plan states a place for every commitment and the accepted regression it was derived from, and its npm test can be replayed and names every case", () => {
  const plan = fs.readFileSync(path.join(KAAL, PLAN), "utf8");
  assert.equal(planCommitments(plan).length, [...plan.matchAll(/^\d+\. /gm)].length);
  assert.match(planLedger(plan).base ?? "", /^[0-9a-f]{64}$/);
  assert.equal(unreplayable(KAAL), undefined);
  // What judges includes everything the checker imports, such as how BRAIN is read.
  assert.ok(judgeFiles(KAAL).includes("skills/using-brain/scripts/brain.ts"));
  assert.deepEqual(unnamedCases(KAAL), []);
});

// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
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
