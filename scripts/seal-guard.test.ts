import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { sealGuardErrors } from "./seal-guard.js";
import { sealKaal } from "./kaal-seals.js";
import { brainData, scratchRepo } from "./test-data.js";

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

/**
 * The transition the guard must allow, built with real sealing:
 *
 *   accepted main A (sealed) ── lineage branches here, does its own work
 *   accepted main B ── a new learning and Change accepted, then sealed by sealKaal
 *   the candidate: lineage, having merged main B, targeting lineage as it was
 *
 * `main` is the trusted accepted reference; `lineage` is the older target.
 * `candidate` is checked out, as CI checks out the pull request's merge.
 */
function propagation() {
  const repo = scratchRepo("history");
  fs.cpSync(brainData("lineages"), path.join(repo, "brain/learning"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  sealKaal(repo);
  commit(repo, "accepted main A, sealed");
  git(repo, "branch", "lineage");

  write(repo, "brain/learning/genesis/26/10/01/01/nodes/d.md", "---\nname: d\n---\n\nAccepted later.\n");
  write(repo, "change/change/26/10/01/01/owned.txt", "accepted later\n");
  commit(repo, "accepted change");
  sealKaal(repo);
  commit(repo, "sealing on main B");

  git(repo, "checkout", "-q", "-b", "candidate", "lineage");
  write(repo, "lineage-work.txt", "the lineage's own work\n");
  commit(repo, "lineage work");
  git(repo, "merge", "-q", "--no-edit", "main");
  return repo;
}

const MAIN = "refs/heads/main";
const forgeries = (repo: string) => sealGuardErrors("lineage", repo, MAIN);
const edit = (repo: string, file: string, content = "forged\n") => {
  write(repo, file, content);
  commit(repo, "candidate edit");
};

test("reproduction: without a trusted main, the guard refuses seal state accepted on main", () => {
  assert.ok(sealGuardErrors("lineage", propagation()).length > 0);
});

test("an older lineage may incorporate seal state exactly as accepted on main", () => {
  assert.deepEqual(forgeries(propagation()), []);
});

test("ordinary changes beside propagated seal state are unaffected", () => {
  const repo = propagation();
  edit(repo, "skills/x.txt", "ordinary\n");
  assert.deepEqual(forgeries(repo), []);
});

test("a seal of accepted main modified by the candidate is refused", () => {
  const repo = propagation();
  edit(repo, "brain/learning/genesis/26/10/01/01/seal.json");
  assert.deepEqual(forgeries(repo), [
    "brain/learning/genesis/26/10/01/01/seal.json: seal state may only be written by sealing on main (A)",
  ]);
});

test("a change seal of accepted main modified by the candidate is refused", () => {
  const repo = propagation();
  edit(repo, "change/change/26/10/01/01/seal.json");
  assert.equal(forgeries(repo).length, 1);
});

test("the chain heads of accepted main modified by the candidate are refused, for BRAIN and Changes", () => {
  for (const heads of ["brain/learning/seals.json", "seals.json"]) {
    const repo = propagation();
    edit(repo, heads);
    assert.deepEqual(forgeries(repo), [`${heads}: seal state may only be written by sealing on main (M)`]);
  }
});

test("seal state the candidate adds that main does not have is refused", () => {
  const repo = propagation();
  edit(repo, "brain/learning/genesis/26/10/02/01/seal.json");
  edit(repo, "brain/learning/seals.json.lock", "lock\n");
  assert.equal(forgeries(repo).length, 2);
});

test("deleting seal state accepted on main is refused", () => {
  const repo = propagation();
  // A seal the older lineage already holds, and main holds unchanged.
  fs.rmSync(path.join(repo, "brain/learning/genesis/26/09/25/01/seal.json"));
  fs.rmSync(path.join(repo, "seals.json"));
  commit(repo, "candidate deletes");
  assert.equal(forgeries(repo).length, 2);
});

test("candidate-authored seal state on a lineage that never incorporated main is refused", () => {
  const repo = propagation();
  git(repo, "checkout", "-q", "-b", "forger", "lineage");
  edit(repo, "brain/learning/genesis/26/09/25/01/seal.json");
  write(repo, "brain/learning/genesis/26/09/29/01/seal.json", "forged\n");
  commit(repo, "forged");
  assert.equal(forgeries(repo).length, 2);
  assert.equal(sealGuardErrors("lineage", repo).length, 2);
});

test("the accepted reference must exist: an unresolvable one refuses rather than allows", () => {
  assert.throws(() => sealGuardErrors("lineage", propagation(), "refs/heads/nope"));
});
