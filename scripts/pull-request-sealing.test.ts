import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { birthChange } from "../skills/managing-change/scripts/birth.js";
import { sealChange, sealChanges } from "./change-seals.js";
import { kaalSealErrors, kaalSealingOutputErrors } from "./kaal-seals.js";
import {
  sealPullRequest,
  sealingStatus,
  touchedOccurrences,
  unsealedOccurrences,
  writebackRefusal,
} from "./pull-request-sealing.js";
import { sealGuardErrors } from "./seal-guard.js";
import { scratchRepo, tree } from "./test-data.js";

const WORKFLOWS = fileURLToPath(new URL("../.github/workflows/", import.meta.url));
const THIS_REPO = "Kai-Hacks-AI/KAAL";
const ORIGIN = { headRef: "kaal/work", headRepo: THIS_REPO, author: "ChBrain", thisRepo: THIS_REPO };
const MAIN = "refs/heads/main";

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    encoding: "utf8",
  }).trim();
}

function commit(repo: string, message: string) {
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", message);
}

function write(repo: string, file: string, content: string) {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), content);
}

/** Births a Change through managing-change, gives it one file and commits it. */
function authored(repo: string, lineage: string, occurrence: string) {
  const dir = birthChange({ root: path.join(repo, "change"), lineage, occurrence });
  fs.writeFileSync(path.join(dir, "owned.txt"), `${lineage}/${occurrence}\n`);
  commit(repo, `author ${lineage}/${occurrence}`);
}

/**
 * Accepted main, sealed, and a kaal/work branch checked out from it, as a pull
 * request into main is: real git history.
 */
function mainAndBranch(): string {
  const repo = scratchRepo("history");
  sealChanges(repo);
  git(repo, "init", "-q", "-b", "main");
  commit(repo, "accepted main, sealed");
  git(repo, "checkout", "-q", "-b", "kaal/work");
  return repo;
}

const seal = (repo: string, over: { draft?: boolean; origin?: typeof ORIGIN } = {}) =>
  sealPullRequest({ base: "main", repo, draft: false, origin: ORIGIN, ...over });

/** What CI does with the working tree sealing wrote: stage it, check it, commit it. */
function commitSealState(repo: string) {
  git(repo, "add", "-A");
  assert.deepEqual(kaalSealingOutputErrors(git(repo, "diff", "--cached", "--name-status", "--no-renames")), []);
  git(repo, "commit", "-q", "-m", "Seal Changes");
}

test("the Changes of a pull request are the occurrences it touches, never a path that is not one", () => {
  assert.deepEqual(
    touchedOccurrences([
      "change/feature/26/10/01/01/owned.txt",
      "change/feature/26/10/01/01/deep/er/file.txt",
      "change/feature/26/10/01/02/seal.json",
      "change/other/26/09/30/01/x",
      "change/stray.txt",
      "change/feature/26/10/01/notes.txt",
      "change/Feature/26/10/01/03/x",
      "change/feature/6/10/01/04/x",
      "seals.json",
      "scripts/change-seals.ts",
    ]),
    ["feature/26/10/01/01", "feature/26/10/01/02", "other/26/09/30/01"],
  );
});

test("complete Change, no sealing by the agent: CI seals it and the result passes every existing check", () => {
  const repo = mainAndBranch();
  authored(repo, "feature", "26/10/01/01");
  assert.deepEqual(unsealedOccurrences("main", repo), ["feature/26/10/01/01"]);

  assert.deepEqual(seal(repo), {
    status: "sealed",
    units: ["change/feature/26/10/01/01"],
    occurrences: ["feature/26/10/01/01"],
  });
  commitSealState(repo);

  assert.deepEqual(unsealedOccurrences("main", repo), []);
  assert.deepEqual(kaalSealErrors(repo), []);
  assert.deepEqual(sealGuardErrors("main", repo, MAIN), []);
  assert.deepEqual(seal(repo), { status: "sealed", units: [], occurrences: [] });
});

test("the state CI writes is exactly what the existing Change Sealing writes", () => {
  const ci = mainAndBranch();
  authored(ci, "feature", "26/10/01/01");
  seal(ci);

  const agent = mainAndBranch();
  authored(agent, "feature", "26/10/01/01");
  sealChange(agent, "feature/26/10/01/01");

  const worktree = (repo: string) =>
    Object.fromEntries(Object.entries(tree(repo)).filter(([file]) => !file.startsWith(".git/")));
  assert.deepEqual(worktree(ci), worktree(agent));
});

test("an agent that sealed the Change itself leaves CI nothing to seal", () => {
  const repo = mainAndBranch();
  authored(repo, "feature", "26/10/01/01");
  sealChange(repo, "feature/26/10/01/01");
  commit(repo, "agent sealed");
  assert.deepEqual(unsealedOccurrences("main", repo), []);
  assert.equal(seal(repo).status, "sealed");
  assert.deepEqual(sealGuardErrors("main", repo, MAIN), []);
});

test("an invalid Change cannot be sealed by CI, and nothing is written", () => {
  const repo = mainAndBranch();
  authored(repo, "feature", "26/10/01/01");
  write(repo, "change/feature/26/10/01/notes.txt", "a file where an occurrence belongs\n");
  commit(repo, "invalid");
  const before = tree(repo);
  assert.throws(() => seal(repo), /refusing to seal Changes/);
  assert.deepEqual(tree(repo), before);
});

test("tampered seal state is refused: a seal edited after CI wrote it, and one forged by hand", () => {
  const edited = mainAndBranch();
  authored(edited, "feature", "26/10/01/01");
  seal(edited);
  commitSealState(edited);
  write(edited, "change/feature/26/10/01/01/seal.json", '{"forged":true}\n');
  commit(edited, "tampered");
  assert.notDeepEqual(kaalSealErrors(edited), []);
  assert.notDeepEqual(sealGuardErrors("main", edited, MAIN), []);

  const forged = mainAndBranch();
  authored(forged, "feature", "26/10/01/01");
  write(forged, "change/feature/26/10/01/01/seal.json", '{"forged":true}\n');
  commit(forged, "forged seal");
  assert.notDeepEqual(kaalSealErrors(forged), []);
  assert.notDeepEqual(sealGuardErrors("main", forged, MAIN), []);
});

test("an unrelated Change is never sealed with the pull request's", () => {
  const repo = mainAndBranch();
  // Accepted on main but not yet sealed, as between a merge and sealing on main.
  git(repo, "checkout", "-q", "main");
  authored(repo, "earlier", "26/10/01/01");
  authored(repo, "feature", "26/09/30/01");
  git(repo, "checkout", "-q", "kaal/work");
  git(repo, "merge", "-q", "--no-edit", "main");
  authored(repo, "feature", "26/10/01/01");

  // Only the pull request's own Change belongs to it, in whatever lineage.
  assert.deepEqual(unsealedOccurrences("main", repo), ["feature/26/10/01/01"]);
  // Sealing it would seal feature/26/09/30/01 before it: sealing refuses rather than drag it in.
  const before = tree(repo);
  assert.throws(() => seal(repo), /sealing would also seal change\/feature\/26\/09\/30\/01/);
  assert.deepEqual(tree(repo), before);

  // Without the earlier Change in its lineage, the unrelated lineage is still left alone.
  const alone = mainAndBranch();
  git(alone, "checkout", "-q", "main");
  authored(alone, "earlier", "26/10/01/01");
  git(alone, "checkout", "-q", "kaal/work");
  git(alone, "merge", "-q", "--no-edit", "main");
  authored(alone, "feature", "26/10/01/01");
  assert.deepEqual((seal(alone) as { units: string[] }).units, ["change/feature/26/10/01/01"]);
  assert.equal(fs.existsSync(path.join(alone, "change/earlier/26/10/01/01/seal.json")), false);
});

test("an incomplete draft may stay investigatory: nothing is sealed, it is never sealed, and it seals once ready", () => {
  const repo = mainAndBranch();
  authored(repo, "feature", "26/10/01/01");
  const before = tree(repo);

  const held = seal(repo, { draft: true });
  assert.equal(held.status, "hold");
  assert.deepEqual(tree(repo), before);
  // The Change is still unsealed, and the status says so: pending, never success.
  assert.deepEqual(unsealedOccurrences("main", repo), ["feature/26/10/01/01"]);
  assert.equal(sealingStatus({ draft: true, succeeded: true, pushed: false }).state, "pending");

  // A draft is held even where sealing it could never succeed.
  write(repo, "change/feature/26/10/01/notes.txt", "incomplete\n");
  commit(repo, "still investigating");
  assert.equal(seal(repo, { draft: true }).status, "hold");

  // Ready for review, the same head is sealed or refused like any other.
  assert.throws(() => seal(repo), /refusing to seal Changes/);
});

test("the status is success only for a ready head whose Changes were already sealed", () => {
  const state = (run: { draft: boolean; succeeded: boolean; pushed: boolean }) => sealingStatus(run).state;
  assert.equal(state({ draft: false, succeeded: true, pushed: false }), "success");
  assert.equal(state({ draft: false, succeeded: true, pushed: true }), "pending");
  assert.equal(state({ draft: false, succeeded: false, pushed: false }), "failure");
  assert.equal(state({ draft: false, succeeded: false, pushed: true }), "failure");
  assert.equal(state({ draft: true, succeeded: false, pushed: false }), "pending");
});

test("CI writes seal state back only to a kaal/* branch of this repository", () => {
  assert.equal(writebackRefusal(ORIGIN), undefined);
  assert.equal(writebackRefusal({ ...ORIGIN, headRef: "kaal/hotfix/thing" }), undefined);
  for (const over of [
    { headRepo: "someone/KAAL" },
    { headRepo: "someone/KAAL", headRef: "kaal/work" },
    { headRef: "main" },
    { headRef: "claude/agent-branch" },
    { headRef: "dependabot/npm_and_yarn/x-1", author: "dependabot[bot]" },
  ]) {
    assert.match(writebackRefusal({ ...ORIGIN, ...over }) ?? "", /writes seal state only to a kaal\/\* branch/);
  }

  const repo = mainAndBranch();
  authored(repo, "feature", "26/10/01/01");
  const before = tree(repo);
  assert.throws(() => seal(repo, { origin: { ...ORIGIN, headRepo: "someone/KAAL" } }), /must arrive sealed/);
  assert.deepEqual(tree(repo), before);
  // A pull request that carries no Change needs no write, from anywhere.
  const plain = mainAndBranch();
  write(plain, "skills/x.txt", "ordinary\n");
  commit(plain, "ordinary");
  assert.equal(seal(plain, { origin: { ...ORIGIN, headRepo: "someone/KAAL" } }).status, "sealed");
});

test("a candidate that modifies the sealing machinery cannot use it as authority", () => {
  const pristine = mainAndBranch();
  authored(pristine, "feature", "26/10/01/01");
  seal(pristine);

  // The candidate rewrites what would seal and judge it, in the repository CI checks out as data.
  const repo = mainAndBranch();
  authored(repo, "feature", "26/10/01/01");
  for (const file of [
    "scripts/change-seals.ts",
    "scripts/seal-guard.ts",
    "scripts/pull-request-sealing.ts",
    "skills/using-seals/scripts/seals.ts",
  ]) {
    write(repo, file, "export const sealChange = () => []; export const sealGuardErrors = () => [];\n");
  }
  commit(repo, "weaken the machinery");

  // The machinery that runs is this code's: the seal bytes are exactly what unmodified sealing writes.
  seal(repo);
  const sealed = tree(repo);
  for (const file of Object.keys(tree(pristine)).filter((f) => f === "seals.json" || f.endsWith("/seal.json"))) {
    assert.equal(sealed[file], tree(pristine)[file], file);
  }
  commitSealState(repo);
  assert.deepEqual(sealGuardErrors("main", repo, MAIN), []);

  // And what the candidate's own machinery would write instead is not accepted.
  const forged = mainAndBranch();
  authored(forged, "feature", "26/10/01/01");
  write(forged, "change/feature/26/10/01/01/seal.json", '{"unit":"change/feature/26/10/01/01","files":[]}\n');
  write(forged, "seals.json", '{"feature":{"units":["change/feature/26/10/01/01"],"seal":"0"}}\n');
  commit(forged, "sealed by its own machinery");
  assert.notDeepEqual(sealGuardErrors("main", forged, MAIN), []);
  assert.notDeepEqual(kaalSealErrors(forged), []);
});

type Step = {
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  "working-directory"?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};
const workflow = (name: string) => parse(fs.readFileSync(path.join(WORKFLOWS, name), "utf8")) as Record<string, any>;

test("the workflow's trust boundary: main's workflow and code, the change only as data, a credential only for the push", () => {
  const wf = workflow("seal-change.yml");
  const steps: Step[] = wf.jobs["seal-change"].steps;
  const index = (match: (s: Step) => boolean) => steps.findIndex(match);

  // pull_request_target, into main only; never a trigger that runs the change's own workflow.
  assert.deepEqual(Object.keys(wf.on), ["pull_request_target"]);
  assert.deepEqual(wf.on.pull_request_target.branches, ["main"]);
  assert.deepEqual(wf.permissions, { contents: "read" });
  assert.deepEqual(wf.jobs["seal-change"].permissions, { contents: "read", statuses: "write" });

  // Two checkouts, neither keeping a credential: main's code, and the change as data.
  const checkouts = steps.filter((s) => s.uses?.startsWith("actions/checkout@"));
  assert.equal(checkouts.length, 2);
  for (const s of checkouts) assert.equal(s.with?.["persist-credentials"], false);
  assert.equal(checkouts[0].with?.ref, undefined);
  assert.equal(checkouts[0].with?.path, "trusted");
  assert.equal(checkouts[1].with?.path, "change");
  assert.equal(checkouts[1].with?.ref, "${{ github.event.pull_request.head.sha }}");

  // Every npm command runs from main's checkout; the change's checkout is only ever an argument.
  for (const s of steps.filter((s) => /\bnpm\b/.test(s.run ?? ""))) {
    assert.ok(s["working-directory"] === "trusted" || /\bcd (\.\.\/)?trusted\b/.test(s.run!), s.run);
  }

  // The sealing is the existing one, and the token exists only after the sealed commit passed every check.
  const sealing = index((s) => /seals:pull-request -- seal/.test(s.run ?? ""));
  const output = index((s) => /seals:sealing-check/.test(s.run ?? ""));
  const check = index((s) => s.if === "steps.stage.outputs.staged == 'true'" && /seals:check/.test(s.run ?? ""));
  const guard = index((s) => s.if === "steps.stage.outputs.staged == 'true'" && /seals:guard/.test(s.run ?? ""));
  const mint = index((s) => s.uses?.startsWith("actions/create-github-app-token@") === true);
  const push = index((s) => /git push/.test(s.run ?? ""));
  assert.ok(sealing > 0 && output > sealing && check > output && guard > check && mint > guard && push > mint);
  assert.equal(steps.filter((s) => /git push/.test(s.run ?? "")).length, 1);
  assert.equal(
    steps.filter((s) => JSON.stringify(s).includes("APP_TOKEN") || JSON.stringify(s).includes("SEALING_APP")).length,
    2,
  );
  assert.match(steps[push].run!, /--force-with-lease="refs\/heads\/\$\{HEAD_REF\}:\$\{HEAD_SHA\}"/);
  assert.doesNotMatch(steps[push].run!, /--force(?!-with-lease)/);
  assert.equal(steps[mint].with?.["permission-contents"], "write");

  // A draft reads and writes nothing of the change, and the status step always reports.
  const touchesChange = steps.filter(
    (s) => s.with?.path === "change" || s["working-directory"] === "change" || /\.\.\/change/.test(s.run ?? ""),
  );
  assert.ok(touchesChange.length >= 5);
  for (const s of touchesChange) {
    assert.ok(
      s.if === "github.event.pull_request.draft == false" || s.if?.startsWith("steps.stage.outputs.staged"),
      s.run ?? s.uses,
    );
  }
  assert.equal(steps.at(-1)?.if, "always()");
});

test("the workflow runs no change code: no PR-authored text in script position, only environment variables", () => {
  const wf = workflow("seal-change.yml");
  const text = fs.readFileSync(path.join(WORKFLOWS, "seal-change.yml"), "utf8");
  for (const step of wf.jobs["seal-change"].steps as Step[]) {
    assert.doesNotMatch(step.run ?? "", /\$\{\{\s*github\.event\.pull_request\.(head\.ref|title|body|user)/);
  }
  assert.doesNotMatch(text, /pull_request:\s*$/m);
});
