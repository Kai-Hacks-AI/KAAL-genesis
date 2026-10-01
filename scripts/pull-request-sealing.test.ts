import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { birthChange } from "../skills/managing-change/scripts/birth.js";
import { changeErrors, sealChange, sealChanges } from "./change-seals.js";
import { kaalSealErrors, kaalSealingOutputErrors } from "./kaal-seals.js";
import {
  admission,
  sealPullRequest,
  gateOutcome,
  touchedOccurrences,
  unsealedOccurrences,
  writebackRefusal,
} from "./pull-request-sealing.js";
import { sealGuardErrors } from "./seal-guard.js";
import { scratchRepo } from "./test-data.js";

const WORKFLOWS = fileURLToPath(new URL("../.github/workflows/", import.meta.url));
const THIS_REPO = "Kai-Hacks-AI/KAAL";
const ORIGIN = { headRef: "kaal/work", headRepo: THIS_REPO, author: "ChBrain", thisRepo: THIS_REPO };
const MAIN = "refs/heads/main";

function git(repo: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.autocrlf=false", ...args],
    {
      encoding: "utf8",
    },
  ).trim();
}

/**
 * Every file of the work tree, never `.git`: git's background maintenance
 * creates and removes files there while a test reads, so reading it is a race.
 */
function tree(repo: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!(dir === repo && entry.name === ".git")) walk(file);
      } else if (entry.isFile()) {
        files[path.relative(repo, file).split(path.sep).join("/")] = fs.readFileSync(file, "utf8");
      }
    }
  };
  walk(repo);
  return files;
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

/** A head as a directory: a copy of test-data/changes/history with every Change sealed, as sealing writes it. */
function sealedHistory(): string {
  const repo = scratchRepo("history");
  sealChanges(repo);
  return repo;
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

  assert.deepEqual(tree(ci), tree(agent));
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
  // The Change is still unsealed, and the draft is not held to it.
  assert.deepEqual(unsealedOccurrences("main", repo), ["feature/26/10/01/01"]);
  assert.equal(gateOutcome({ repo, draft: true, admitted: true }).outcome, "hold");
  assert.equal(gateOutcome({ repo, draft: false, admitted: true }).outcome, "refuse");

  // A draft is held even where sealing it could never succeed.
  write(repo, "change/feature/26/10/01/notes.txt", "incomplete\n");
  commit(repo, "still investigating");
  assert.equal(seal(repo, { draft: true }).status, "hold");

  // Ready for review, the same head is sealed or refused like any other.
  assert.throws(() => seal(repo), /refusing to seal Changes/);
});

test("check-seals requires every Change present in the head sealed, whatever the base: same head, same sealing verdict", () => {
  // The head holds a Change it inherited from main, accepted there unsealed, and one of its own.
  const repo = mainAndBranch();
  git(repo, "checkout", "-q", "main");
  authored(repo, "earlier", "26/10/01/01");
  git(repo, "checkout", "-q", "kaal/work");
  git(repo, "merge", "-q", "--no-ff", "--no-edit", "main");
  authored(repo, "feature", "26/10/01/01");
  const gate = (over: { draft?: boolean; admitted?: boolean } = {}) =>
    gateOutcome({ repo, draft: false, admitted: true, ...over });

  // Touched or not, an unsealed Change in the head is refused for a ready pull request into an
  // admission, and held, never passed, for a draft or a base that is no admission.
  const refused = gate();
  assert.equal(refused.outcome, "refuse");
  assert.match(refused.errors.join("\n"), /change\/earlier\/26\/10\/01\/01: Change is not sealed/);
  assert.match(refused.errors.join("\n"), /change\/feature\/26\/10\/01\/01: Change is not sealed/);
  assert.equal(gate({ draft: true }).outcome, "hold");
  assert.equal(gate({ admitted: false }).outcome, "hold");
  assert.equal(gate({ draft: true, admitted: false }).outcome, "hold");

  // CI seals the pull request's own Change; the inherited one is not its to seal, so the head is
  // still refused until it is sealed, in the head, by whoever owns it.
  seal(repo);
  commit(repo, "CI sealed the pull request's Change");
  assert.deepEqual(unsealedOccurrences("main", repo), []);
  assert.equal(gate().outcome, "refuse");
  assert.deepEqual(gate().errors.length, 1);
  sealChange(repo, "earlier/26/10/01/01");
  commit(repo, "sealed");

  // Sealed, the verdict is a pass in every state: success never depends on draft state or base.
  for (const over of [{}, { draft: true }, { admitted: false }, { draft: true, admitted: false }]) {
    assert.equal(gate(over).outcome, "pass", JSON.stringify(over));
  }
  // A pull request that holds no Change passes too.
  const plain = mainAndBranch();
  write(plain, "skills/x.txt", "ordinary\n");
  commit(plain, "ordinary");
  assert.equal(gateOutcome({ repo: plain, draft: false, admitted: true }).outcome, "pass");
});

test("the gate judges the head as a directory through the existing checks: a seal that is present but not valid never passes", () => {
  const states = [{}, { draft: true }, { admitted: false }, { draft: true, admitted: false }];
  const gate = (repo: string, over: { draft?: boolean; admitted?: boolean } = {}) =>
    gateOutcome({ repo, draft: false, admitted: true, ...over });

  // A head whose Changes are all sealed, with the chain heads those seals need, passes in every state.
  const sealed = sealedHistory();
  for (const over of states) assert.equal(gate(sealed, over).outcome, "pass", JSON.stringify(over));

  // The same head with the chain heads missing: every unit's seal.json is present, but the seals are not valid.
  // That a base could supply the heads in a merge changes nothing: the head's own directory is judged.
  const withoutHeads = sealedHistory();
  fs.rmSync(path.join(withoutHeads, "seals.json"));
  const merged = sealedHistory();
  assert.equal(gate(merged).outcome, "pass");
  for (const over of states) {
    const judged = gate(withoutHeads, over);
    assert.equal(judged.outcome, "refuse", JSON.stringify(over));
    assert.notDeepEqual(judged.errors, []);
  }

  // Edited sealed material, an edited seal and a stray seal are not valid seals either, so the gate refuses
  // exactly what the existing verification does and reproduces none of its semantics.
  for (const sabotage of [
    (r: string) => fs.writeFileSync(path.join(r, "change/change/26/09/30/01/owned.txt"), "rewritten\n"),
    (r: string) => fs.writeFileSync(path.join(r, "change/change/26/09/30/01/seal.json"), '{"forged":true}\n'),
    (r: string) => fs.writeFileSync(path.join(r, "change/change/26/09/30/01/nested/seal.json"), "{}\n"),
  ]) {
    const head = sealedHistory();
    fs.mkdirSync(path.join(head, "change/change/26/09/30/01/nested"), { recursive: true });
    sabotage(head);
    assert.equal(gate(head).outcome, "refuse");
    assert.equal(gate(head, { draft: true, admitted: false }).outcome, "refuse");
    assert.deepEqual(gateOutcome({ repo: head, draft: false, admitted: true }).errors, changeErrors(head));
  }
});

test("CI writes seal state back only to a claude/* or kaal/* branch of this repository", () => {
  assert.equal(writebackRefusal(ORIGIN), undefined);
  assert.equal(writebackRefusal({ ...ORIGIN, headRef: "kaal/hotfix/thing" }), undefined);
  assert.equal(writebackRefusal({ ...ORIGIN, headRef: "claude/agent-branch" }), undefined);
  for (const over of [
    { headRepo: "someone/KAAL" },
    { headRepo: "someone/KAAL", headRef: "claude/work" },
    { headRef: "main" },
    { headRef: "jules-15604167912077228041-853dd3d1" },
    { headRef: "claudette" },
    { headRef: "dependabot/npm_and_yarn/x-1", author: "dependabot[bot]" },
  ]) {
    assert.match(
      writebackRefusal({ ...ORIGIN, ...over }) ?? "",
      /writes seal state only to a claude\/\* or kaal\/\* branch/,
    );
  }

  // Where CI may not write, nothing is sealed and the Changes must arrive sealed.
  const repo = mainAndBranch();
  authored(repo, "feature", "26/10/01/01");
  const before = tree(repo);
  for (const origin of [
    { ...ORIGIN, headRepo: "someone/KAAL" },
    { ...ORIGIN, headRef: "main" },
  ]) {
    assert.throws(() => seal(repo, { origin }), /must arrive sealed/);
    assert.deepEqual(tree(repo), before);
  }
  // ...and one that arrives sealed is verified without a write, from anywhere.
  sealChange(repo, "feature/26/10/01/01");
  commit(repo, "arrived sealed");
  assert.equal(seal(repo, { origin: { ...ORIGIN, headRepo: "someone/KAAL" } }).status, "sealed");
  // A pull request that carries no Change needs no write, from anywhere.
  const plain = mainAndBranch();
  write(plain, "skills/x.txt", "ordinary\n");
  commit(plain, "ordinary");
  assert.equal(seal(plain, { origin: { ...ORIGIN, headRepo: "someone/KAAL" } }).status, "sealed");
});

test("a pull request is admitted into a kaal/* flight and into main, and nowhere else", () => {
  assert.equal(admission("main", "main"), "main");
  assert.equal(admission("kaal/seal-changes", "main"), "flight");
  assert.equal(admission("kaal/hotfix/x", "main"), "flight");
  for (const base of ["claude/work", "jules-1", "kaal", "xkaal/x", "far", ""]) {
    assert.equal(admission(base, "main"), undefined, base);
  }
});

test("claude/* into a kaal/* flight is sealed by CI; the flight into main is verified, never rewritten", () => {
  const repo = mainAndBranch();
  git(repo, "branch", "-m", "kaal/flight");
  git(repo, "checkout", "-q", "-b", "claude/work");
  authored(repo, "feature", "26/10/01/01");

  // Admission into the flight: the Change enters the lineage and CI seals it, with the guard's base the flight.
  const agent = { ...ORIGIN, headRef: "claude/work" };
  assert.equal(admission("kaal/flight", "main"), "flight");
  assert.deepEqual(unsealedOccurrences("kaal/flight", repo), ["feature/26/10/01/01"]);
  assert.deepEqual(sealPullRequest({ base: "kaal/flight", repo, draft: false, origin: agent }).status, "sealed");
  commitSealState(repo);
  assert.deepEqual(unsealedOccurrences("kaal/flight", repo), []);
  assert.deepEqual(kaalSealErrors(repo), []);
  assert.deepEqual(sealGuardErrors("kaal/flight", repo, MAIN), []);

  // The flight takes it, as the merge of the pull request does.
  git(repo, "checkout", "-q", "kaal/flight");
  git(repo, "merge", "-q", "--no-ff", "--no-edit", "claude/work");

  // Admission into main: a flight head, already sealed, is verified and nothing is written or pushed.
  assert.equal(admission("main", "main"), "main");
  const flight = { ...ORIGIN, headRef: "kaal/flight" };
  assert.deepEqual(unsealedOccurrences("main", repo), []);
  const before = tree(repo);
  assert.deepEqual(sealPullRequest({ base: "main", repo, draft: false, origin: flight }), {
    status: "sealed",
    units: [],
    occurrences: [],
  });
  assert.deepEqual(tree(repo), before);
  git(repo, "add", "-A");
  assert.equal(git(repo, "status", "--porcelain"), "");
  assert.deepEqual(kaalSealErrors(repo), []);
  assert.deepEqual(sealGuardErrors("main", repo, MAIN), []);
});

test("a Change that reaches a flight unsealed from a head CI may not write is refused, not sealed", () => {
  const repo = mainAndBranch();
  git(repo, "branch", "-m", "kaal/flight");
  git(repo, "checkout", "-q", "-b", "someone/work");
  authored(repo, "feature", "26/10/01/01");
  const before = tree(repo);
  assert.throws(
    () =>
      sealPullRequest({
        base: "kaal/flight",
        repo,
        draft: false,
        origin: { ...ORIGIN, headRef: "work", headRepo: "someone/KAAL" },
      }),
    /must arrive sealed/,
  );
  assert.deepEqual(tree(repo), before);
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
  const wf = workflow("seal-pull-request.yml");
  const steps: Step[] = wf.jobs["seal-pull-request"].steps;
  const index = (match: (s: Step) => boolean) => steps.findIndex(match);

  // workflow_run, which GitHub always takes from the default branch: never a trigger that runs
  // a workflow the change or a flight branch carries, and never scoped to main alone.
  assert.deepEqual(Object.keys(wf.on), ["workflow_run"]);
  assert.deepEqual(wf.on.workflow_run.workflows, ["request-sealing"]);
  assert.deepEqual(wf.permissions, { contents: "read" });
  assert.deepEqual(wf.jobs["seal-pull-request"].permissions, {
    contents: "read",
    "pull-requests": "read",
  });

  // Two checkouts, neither keeping a credential: the default branch's code, and the change as data.
  const checkouts = steps.filter((s) => s.uses?.startsWith("actions/checkout@"));
  assert.equal(checkouts.length, 2);
  for (const s of checkouts) assert.equal(s.with?.["persist-credentials"], false);
  assert.equal(checkouts[0].with?.ref, "${{ github.event.repository.default_branch }}");
  assert.equal(checkouts[0].with?.path, "trusted");
  assert.equal(checkouts[1].with?.path, "change");
  assert.equal(checkouts[1].with?.ref, "refs/pull/${{ env.PR_NUMBER }}/head");

  // Only the pull request's number comes from the trigger, and it must be digits.
  const resolve = steps.find((s) => s.id === "pr")!;
  assert.match(resolve.run!, /\^pr=\(\[0-9\]\+\)\$/);
  assert.match(resolve.run!, /head\.sha.*REQUEST_SHA/);

  // Every npm command runs from the default branch's checkout; the change's checkout is only ever an argument.
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

  // Nothing of the change is read unless the pull request is admitted and is not a draft.
  const touchesChange = steps.filter(
    (s) => s.with?.path === "change" || s["working-directory"] === "change" || /\.\.\/change/.test(s.run ?? ""),
  );
  assert.ok(touchesChange.length >= 5);
  for (const s of touchesChange) {
    assert.ok(
      s.if === "steps.sealable.outputs.sealable == 'true'" || s.if?.startsWith("steps.stage.outputs.staged"),
      s.run ?? s.uses,
    );
  }
  assert.equal(
    steps.find((s) => s.id === "sealable")?.if,
    "steps.admission.outputs.admitted == 'true' && env.DRAFT == 'false'",
  );
});

test("the workflow runs no change code: no PR-authored text in script position, only environment variables", () => {
  const text = fs.readFileSync(path.join(WORKFLOWS, "seal-pull-request.yml"), "utf8");
  for (const step of workflow("seal-pull-request.yml").jobs["seal-pull-request"].steps as Step[]) {
    assert.doesNotMatch(step.run ?? "", /\$\{\{\s*(github\.event\.|steps\.pr\.outputs|env\.)/);
  }
  assert.doesNotMatch(text, /pull_request_target|pull_request:\s*$/m);
});

test("the trigger is unprivileged: no secret, no write, no checkout, and it passes on only a number", () => {
  const wf = workflow("request-sealing.yml");
  assert.deepEqual(Object.keys(wf.on), ["pull_request"]);
  assert.deepEqual(wf.on.pull_request.types, [
    "opened",
    "reopened",
    "synchronize",
    "edited",
    "ready_for_review",
    "converted_to_draft",
  ]);
  assert.deepEqual(wf.permissions, {});
  assert.equal(wf["run-name"], "pr=${{ github.event.pull_request.number }}");
  const text = fs.readFileSync(path.join(WORKFLOWS, "request-sealing.yml"), "utf8");
  assert.doesNotMatch(text, /secrets\.|vars\.|actions\/checkout|GITHUB_TOKEN|github\.token/);
  for (const step of wf.jobs["request-sealing"].steps as Step[]) {
    assert.doesNotMatch(step.run ?? "", /\$\{\{(?!\s*github\.event\.pull_request\.number\s*\}\})/);
  }
});

test("check-seals requires sealed Changes of a ready pull request, from main's code, with no write beyond statuses", () => {
  const wf = workflow("seal.yml");
  assert.deepEqual(Object.keys(wf.on), ["push", "pull_request_target"]);
  // The gate depends on draft state and base, so every activity that changes either re-runs it.
  assert.deepEqual(wf.on.pull_request_target.types, [
    "opened",
    "reopened",
    "synchronize",
    "edited",
    "ready_for_review",
    "converted_to_draft",
  ]);
  const steps = wf.jobs["check-seals"].steps as Step[];
  const gate = steps.find((s) => /seals:pull-request -- gate/.test(s.run ?? ""))!;
  assert.equal(gate["working-directory"], "trusted");
  assert.equal(gate.if, "github.event_name == 'pull_request_target'");
  assert.match(gate.run!, /gate \.\.\/head\)"/);
  // The head is carried into a directory of its own, bound to the status SHA, before the gate runs.
  const head = steps.findIndex((s) => s.with?.path === "head");
  assert.equal(steps[head].with?.ref, "refs/pull/${{ github.event.pull_request.number }}/head");
  assert.equal(steps[head].with?.["persist-credentials"], false);
  assert.equal(steps[head + 1].run, 'test "$(git rev-parse HEAD)" = "$EVENT_SHA"');
  assert.ok(head > 0 && head + 1 < steps.indexOf(gate));
  // A held Change keeps the status pending, so success never stands where a later change of draft
  // state or base could turn it into an unsealed admission.
  assert.match(gate.run!, /if \[ "\$out" = hold \]; then echo "HELD=true" >> "\$GITHUB_ENV"; fi/);
  const verdict = (wf.jobs["check-seals"].steps as Step[]).at(-1)!.run!;
  assert.match(verdict, /if \[ "\$state" = success \] && \[ "\$\{HELD:-\}" = true \]; then\n\s+state=pending/);
  assert.ok(verdict.indexOf("HELD:-") < verdict.indexOf('gh api "$STATUS_URL"'));

  // A stale run must not publish over a newer one: runs of a pull request are serialised,
  // never cancelled, and the draft state and base are read from GitHub when the run reaches
  // them, before anything judges, never taken from the event.
  assert.equal(wf.concurrency.group, "check-seals-${{ github.event.pull_request.number || github.run_id }}");
  assert.equal(wf.concurrency["cancel-in-progress"], false);
  assert.deepEqual(wf.jobs["check-seals"].permissions, {
    contents: "read",
    "pull-requests": "read",
    statuses: "write",
  });
  const live = steps.findIndex((s) => s.id === "live");
  const judging = steps.findIndex((s) => /seals:(check|guard)\b|seals:pull-request/.test(s.run ?? ""));
  assert.ok(live >= 0 && live < judging);
  assert.match(steps[live].run!, /pulls\/\$PR_NUMBER.*DRAFT=.*BASE_REF=.*HEAD_SHA=/);
  // And success is withheld if it changed meanwhile: the state is read again immediately before
  // the status is published, and a different draft state or base publishes pending, never success.
  // The verdict is for one head: a stale event judges nothing, and what was checked out is the
  // merge of exactly that head, so a force-pushed head cannot be judged through another's merge.
  assert.ok(steps.some((s) => s.run === 'test "$HEAD_SHA" = "$EVENT_SHA"'));
  const bound = steps.findIndex((s) => /HEAD\^2.*EVENT_SHA/.test(s.run ?? ""));
  assert.match(steps[bound].run!, /test "\$\(git rev-parse HEAD\^1\)" = "\$\(git rev-parse "origin\/\$BASE_REF"\)"/);
  assert.equal(steps[bound]["working-directory"], "change");
  const checkoutChange = steps.findIndex((s) => s.with?.path === "change");
  assert.ok(checkoutChange >= 0 && bound === checkoutChange + 1);
  assert.equal(wf.jobs["check-seals"].env.EVENT_SHA, "${{ github.event.pull_request.head.sha }}");
  const publish = steps.at(-1)!;
  assert.equal(publish.if, "always() && github.event_name == 'pull_request_target'");
  assert.match(
    publish.run!,
    /if \[ "\$state" = success \]; then\n\s+now="\$\(gh api .*pulls\/\$PR_NUMBER.*\n\s+if \[ "\$now" != "\$DRAFT \$BASE_REF \$EVENT_SHA" \]; then\n\s+state=pending/,
  );
  assert.ok(publish.run!.indexOf("now=") < publish.run!.indexOf('gh api "$STATUS_URL"'));
  for (const s of steps) {
    assert.doesNotMatch(JSON.stringify(s.env ?? {}), /pull_request\.(draft|base)/, s.run);
    assert.doesNotMatch(s.run ?? "", /github\.(base_ref|event\.pull_request\.(draft|base))/, s.run);
  }
});
