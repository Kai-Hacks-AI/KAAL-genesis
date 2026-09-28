import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PLAN } from "./links.js";
import { judgeFiles } from "./regression.js";
import {
  featureState,
  kaal as kaalState,
  layeredState,
  regressionCandidate,
  regressionTrusted,
  runState,
} from "./test-data.js";

// KAAL works on files. These cases copy KAAL out of Git, into plain
// directories with no `.git`, and run its capabilities as their command lines
// do, in processes that cannot find `git` and see no GitHub: nothing is
// mocked, so each passes only because KAAL has no reason to ask either.

/** The subject of this file's cases about KAAL itself. */
const KAAL = kaalState();
const TSX = fileURLToPath(import.meta.resolve("tsx/cli"));

/** A copy of `from` as plain files, without `.git`; dependencies are linked, as an install would provide them. */
function plainCopy(from: string): string {
  const to = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kaal-plain-")), "kaal");
  fs.cpSync(from, to, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => {
      const top = path.relative(from, src).split(path.sep)[0];
      return top !== ".git" && top !== "node_modules";
    },
  });
  fs.symlinkSync(path.join(KAAL, "node_modules"), path.join(to, "node_modules"), "junction");
  return to;
}

/** An environment in which no program can be found by name, and nothing of Git, GitHub or npm is set. */
function withoutGit(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^(path|ci|node_options|node_test_context)$|^(git|github|gh|runner|npm)_/i.test(key),
    ),
  );
  return { ...env, PATH: fs.mkdtempSync(path.join(os.tmpdir(), "kaal-no-programs-")) };
}

/** Runs one of KAAL's command lines in `cwd`, as `npm run` would, but without npm, Git or GitHub. */
function kaal(cwd: string, script: string, ...args: string[]) {
  const run = spawnSync(process.execPath, [TSX, script, ...args], { cwd, env: withoutGit(), encoding: "utf8" });
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

// Suite: suites/without-git.md
// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("the processes these cases run KAAL in cannot find git", () => {
  const run = spawnSync("git", ["--version"], { env: withoutGit() });
  assert.equal((run.error as NodeJS.ErrnoException | undefined)?.code, "ENOENT");
});

// Suite: suites/without-git.md
// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
// Why: brain/learning/genesis/26/09/26/03/nodes/using-seals.md
// Why: scripts/brain-seals.ts
// Why: brain/learning/genesis/26/09/27/02/nodes/managing-defects.md
// Why: brain/learning/genesis/26/09/27/04/nodes/managing-ideas.md
// Why: brain/learning/genesis/26/09/28/01/nodes/managing-requirements.md
test("copied out of Git, KAAL validates BRAIN, checks its seals, its skills and its testing links", () => {
  const kaalState = plainCopy(KAAL);
  assert.equal(fs.existsSync(path.join(kaalState, ".git")), false);
  for (const [script, ...args] of [
    ["skills/using-brain/scripts/validate.ts"],
    ["scripts/check-seals.ts"],
    ["skills/using-skills/scripts/check.ts", "skills"],
    ["scripts/check-links.ts"],
    ["skills/managing-defects/scripts/check.ts", "defects"],
    ["skills/managing-ideas/scripts/check.ts", "ideas"],
    ["skills/managing-requirements/scripts/check.ts", "requirements"],
  ] as [string, ...string[]][]) {
    const run = kaal(kaalState, script, ...args);
    assert.equal(run.status, 0, `${script}: ${run.out}`);
  }
});

// Suite: suites/without-git.md
// Why: requirements/new-promises/requirement.md
// Why: requirements/new-promises-demonstrated/requirement.md
test("copied out of Git, KAAL names what a candidate newly promises and runs its Feature Plan for it", () => {
  const kaalState = plainCopy(KAAL);
  const [accepted, candidate] = [regressionTrusted(), featureState("planned", "promised")];
  const named = kaal(kaalState, "scripts/feature.ts", accepted, candidate);
  assert.equal(named.status, 0, named.out);
  assert.deepEqual(JSON.parse(named.out), { promises: ["requirements/greets-by-name/requirement.md"] });
  const ran = kaal(kaalState, "scripts/feature.ts", "--run", accepted, candidate);
  assert.equal(ran.status, 0, ran.out);
  assert.equal((JSON.parse(ran.out) as { evidence: { verdict: string } }).evidence.verdict, "held");
});

// Suite: suites/without-git.md
// Why: requirements/inherited-reductions/requirement.md
// Why: requirements/accepted-reductions/requirement.md
test("copied out of Git, KAAL gives up only the inherited cases a candidate excludes, and refuses the rest", () => {
  const kaalState = plainCopy(KAAL);
  const protectedState = ["feature/promised", "acceptance/protected"];
  const accepted = layeredState(...protectedState);
  const silent = layeredState(...protectedState, "regression/candidates/withdrawn");
  const refused = kaal(kaalState, "scripts/acceptance.ts", accepted, silent);
  assert.equal(refused.status, 1, refused.out);
  assert.match(refused.out, /inherited case not excluded: scripts\/cases\.test\.ts: "greets" failed/);
  const explicit = layeredState(...protectedState, "regression/candidates/withdrawn", "acceptance/excludes-greets");
  const given = kaal(kaalState, "scripts/acceptance.ts", accepted, explicit);
  assert.equal(given.status, 0, given.out);
  assert.deepEqual(
    (JSON.parse(given.out) as { excluded: { excludes: string }[] }).excluded.map((e) => e.excludes),
    ['case: scripts/cases.test.ts: "greets"'],
  );
});

// Suite: suites/without-git.md
// Tests: defects/seal-guard-case-rewrites-nothing
// Why: brain/learning/genesis/26/09/26/03/nodes/using-seals.md
// Why: scripts/brain-seals.ts
test("copied out of Git, KAAL seals an accepted state, checks what sealing wrote, and guards seal state against a candidate", () => {
  const before = plainCopy(KAAL);
  const sealed = plainCopy(KAAL);
  const sealing = kaal(sealed, "scripts/seal.ts");
  assert.equal(sealing.status, 0, sealing.out);
  assert.equal(kaal(sealed, "scripts/sealing-check.ts", before).status, 0, "sealing wrote only seal state");
  assert.equal(kaal(sealed, "scripts/check-seals.ts").status, 0, "the new seals hold");

  // A candidate that changes nothing of the accepted state's seal state passes the guard.
  const candidate = plainCopy(sealed);
  assert.equal(kaal(sealed, "scripts/seal-guard.ts", sealed, candidate).status, 0);
  // One that rewrites a seal, or brings seals of its own, is refused.
  const heads = path.join(candidate, "brain", "learning", "seals.json");
  // Always a rewrite: the seal's first digit is changed to another, whatever it was.
  fs.writeFileSync(
    heads,
    fs
      .readFileSync(heads, "utf8")
      .replace(/"seal": "([0-9a-f])/, (_, digit: string) => `"seal": "${digit === "0" ? "1" : "0"}`),
  );
  const rewritten = kaal(sealed, "scripts/seal-guard.ts", sealed, candidate);
  assert.equal(rewritten.status, 1);
  assert.match(rewritten.out, /brain\/learning\/seals\.json: seal state .*\(M\)/);
  const bringing = kaal(before, "scripts/seal-guard.ts", before, sealed);
  assert.equal(bringing.status, 1);
  assert.match(bringing.out, /seal\.json: seal state .*\(A\)/);
  // What sealing wrote is refused as the output of anything but sealing once something else changes too.
  fs.writeFileSync(path.join(sealed, "README.stray"), "not seal state\n");
  assert.equal(kaal(sealed, "scripts/sealing-check.ts", before).status, 1);
});

// Suite: suites/genesis.md
// Suite: suites/without-git.md
// Why: brain/learning/genesis/26/09/28/06/nodes/genesis.md
test("copied out of Git, KAAL births a new KAAL into an ordinary directory, and the new KAAL works without Git", () => {
  const kaalState = plainCopy(KAAL);
  const newborn = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-newborn-"));
  const born = kaal(newborn, path.join(kaalState, "scripts", "genesis.ts"));
  assert.equal(born.status, 0, born.out);
  assert.equal(fs.existsSync(path.join(newborn, ".git")), false);
  // The new KAAL's BRAIN is valid, and its seals hold, checked in the new KAAL itself.
  for (const script of ["skills/using-brain/scripts/validate.ts", "scripts/check-seals.ts"]) {
    const run = kaal(newborn, path.join(kaalState, script));
    assert.equal(run.status, 0, `${script}: ${run.out}`);
  }
});

// Suite: suites/without-git.md
// Why: brain/learning/genesis/26/09/27/05/nodes/run.md
test("copied out of Git, KAAL runs one state's cases against another, both plain directories, and says what it observed", () => {
  const kaalState = plainCopy(KAAL);
  const [greeter, silent] = [runState("greeter"), runState("silent")];
  const observedIn = (out: string) =>
    (JSON.parse(out) as { observations: { title: string; observed: string }[] }).observations.find(
      (o) => o.title === "the state says hello",
    )?.observed;
  const own = kaal(kaalState, "scripts/run.ts", greeter);
  assert.equal(own.status, 0, own.out);
  assert.equal(observedIn(own.out), "passed");
  const other = kaal(kaalState, "scripts/run.ts", greeter, silent);
  assert.equal(other.status, 1, other.out);
  assert.equal(observedIn(other.out), "failed");
});

// Suite: suites/without-git.md
// Why: brain/learning/genesis/26/09/27/06/nodes/suite.md
test("copied out of Git, KAAL runs a suite of a plain directory's cases, reaching exactly the cases that belong to it, and never reports reaching none as a success", () => {
  const kaalState = plainCopy(KAAL);
  const suites = runState("suites");
  const names = kaal(kaalState, "scripts/run.ts", "--suite", "suites/names.md", suites);
  assert.equal(names.status, 0, names.out);
  const run = JSON.parse(names.out) as { suite: string; observations: { title: string; observed: string }[] };
  assert.equal(run.suite, "suites/names.md");
  assert.deepEqual(
    run.observations.map((o) => `${o.title}: ${o.observed}`),
    ["says goodbye to whoever it is given, by name: passed", "says hello to whoever it is given, by name: passed"],
  );
  // The state's case that belongs to no suite fails, so a run of every case it selects fails.
  assert.equal(kaal(kaalState, "scripts/run.ts", suites).status, 1);
  // A suite no case belongs to yet reaches nothing: its run is no evidence, and never reported as a success.
  const welsh = kaal(kaalState, "scripts/run.ts", "--suite", "suites/welsh.md", suites);
  assert.equal(welsh.status, 1, welsh.out);
  assert.match(welsh.out, /suites\/welsh\.md: the run observed no case pass, so it is no evidence/);
});

// Suite: suites/without-git.md
// Why: brain/learning/genesis/26/09/27/07/nodes/plan.md
test("copied out of Git, KAAL runs a plan of a plain directory's cases and says what that run demonstrates of the plan", () => {
  const kaalState = plainCopy(KAAL);
  const greeting = kaal(
    kaalState,
    "scripts/run.ts",
    "--plan",
    "plans/greeting.md",
    "--condition",
    "checkout=plain",
    runState("plans"),
  );
  assert.equal(greeting.status, 0, greeting.out);
  const { run, evidence } = JSON.parse(greeting.out) as {
    run: { plan: string; conditions: Record<string, string>; requirements: { name: string }[] };
    evidence: { verdict: string; requirements: { under: { conditions: { platform: string }; verdict: string }[] }[] };
  };
  assert.equal(run.plan, "plans/greeting.md");
  assert.equal(run.conditions.checkout, "plain");
  assert.deepEqual(
    run.requirements.map((r) => r.name),
    ["suites/greeting.md", "suites/names.md"],
  );
  // One run, on one platform: the plan requires two, so it is not demonstrated, though all this run reached held.
  assert.equal(evidence.verdict, "not demonstrated");
  assert.ok(evidence.requirements.every((r) => r.under.some((u) => u.verdict === "held")));
  // A plan no suite serves yet reaches nothing: no evidence, never reported as a success.
  assert.equal(kaal(kaalState, "scripts/run.ts", "--plan", "plans/farewell.md", runState("plans")).status, 1);
});

// Suite: suites/without-git.md
// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("copied out of Git, an accepted state judges a candidate state with its own checker, both plain directories", () => {
  // The accepted state carries KAAL's checker, as main does, and judges with it.
  const accepted = plainCopy(regressionTrusted());
  for (const file of judgeFiles(KAAL).filter((f) => fs.existsSync(path.join(KAAL, f)) && f.endsWith(".ts"))) {
    fs.mkdirSync(path.dirname(path.join(accepted, file)), { recursive: true });
    fs.copyFileSync(path.join(KAAL, file), path.join(accepted, file));
  }
  const identity = kaal(accepted, "scripts/check-regression.ts", "--identity");
  assert.equal(identity.status, 0, identity.out);
  const id = identity.out.trim();
  assert.match(id, /^[0-9a-f]{64}$/);

  const named = (candidate: string) => {
    const plan = path.join(candidate, PLAN);
    fs.writeFileSync(plan, fs.readFileSync(plan, "utf8").replace(/regression `[0-9a-f]{64}`/, `regression \`${id}\``));
    return candidate;
  };
  const holds = kaal(accepted, "scripts/check-regression.ts", named(regressionCandidate("kept")));
  assert.equal(holds.status, 0, holds.out);
  assert.match(holds.out, new RegExp(`the accepted regression ${id} holds`));
  const weakened = kaal(accepted, "scripts/check-regression.ts", named(regressionCandidate("weakened")));
  assert.equal(weakened.status, 1);
  assert.match(weakened.out, /scripts\/cases\.test\.ts: "adds" failed/);
});
