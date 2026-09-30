import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { sealGuardErrors } from "./seal-guard.js";
import { sealChange, sealChanges } from "./change-seals.js";
import { sealKaal } from "./kaal-seals.js";
import { birthChange } from "../skills/managing-change/scripts/birth.js";
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

/**
 * Change Sealing's transition, as #111 has it: accepted main holds sealed
 * Changes; an evolution branch births a Change of a new lineage with
 * its material and (in `sealed`) seals it before reaching main.
 */
function evolution() {
  const repo = scratchRepo("history");
  sealChanges(repo);
  git(repo, "init", "-q", "-b", "main");
  commit(repo, "accepted main, sealed");
  git(repo, "checkout", "-q", "-b", "evolution");
  const dir = birthChange({ root: path.join(repo, "change"), lineage: "far", occurrence: "26/09/25/01" });
  fs.writeFileSync(path.join(dir, "feature.md"), "# Feature\n");
  commit(repo, "a Change");
  return repo;
}

const sealed = () => {
  const repo = evolution();
  sealChange(repo, "far/26/09/25/01");
  return repo;
};
const CHANGE_SEAL = "change/far/26/09/25/01/seal.json";
const refused = (repo: string) => sealGuardErrors("main", repo, MAIN);

test("Change Sealing: a sealed Change is allowed through the guard, whole or split over commits", () => {
  const whole = sealed();
  commit(whole, "seal");
  assert.deepEqual(refused(whole), []);
  assert.deepEqual(sealGuardErrors("main", whole), []);
  // As #111 committed it: the unit's seal first, the chain head in a later commit.
  const split = sealed();
  git(split, "add", CHANGE_SEAL);
  git(split, "commit", "-q", "-m", "seal");
  commit(split, "heads");
  assert.deepEqual(refused(split), []);
});

test("Change Sealing: chains onto sealed history and a later Change chains onto it", () => {
  const repo = evolution();
  sealChange(repo, "far/26/09/25/01");
  commit(repo, "seal");
  const dir = birthChange({ root: path.join(repo, "change"), lineage: "far", occurrence: "26/09/25/02" });
  fs.writeFileSync(path.join(dir, "feature.md"), "# Feature\n");
  commit(repo, "another Change");
  sealChange(repo, "far/26/09/25/02");
  commit(repo, "seal it");
  assert.deepEqual(refused(repo), []);
  // and a Change of an existing sealed lineage, appended after its history
  const later = evolution();
  const d = birthChange({ root: path.join(later, "change"), lineage: "change", occurrence: "26/10/01/01" });
  fs.writeFileSync(path.join(d, "owned.txt"), "later\n");
  commit(later, "later Change");
  sealChange(later, "change/26/10/01/01");
  commit(later, "seal");
  assert.deepEqual(refused(later), []);
});

test("the same seal state is refused once anything beside sealing touched it", () => {
  const cases: [string, (repo: string) => void][] = [
    [
      "a seal with a forged hash",
      (r) =>
        edit(
          r,
          CHANGE_SEAL,
          fs.readFileSync(path.join(r, CHANGE_SEAL), "utf8").replace(/[0-9a-f]{64}/, "0".repeat(64)),
        ),
    ],
    ["the Change's material altered after sealing", (r) => edit(r, "change/far/26/09/25/01/feature.md", "# Changed\n")],
  ];
  for (const [name, sabotage] of cases) {
    const repo = sealed();
    commit(repo, "seal");
    sabotage(repo);
    assert.ok(refused(repo).length > 0, name);
  }
});

test("Change Sealing: seal.json without the chain head, or the head without the seal, is refused", () => {
  const seal = sealed();
  git(seal, "add", CHANGE_SEAL);
  git(seal, "commit", "-q", "-m", "seal only");
  git(seal, "checkout", "-q", "main", "--", "seals.json");
  assert.ok(refused(seal).length > 0);
  const heads = sealed();
  git(heads, "add", "seals.json");
  git(heads, "commit", "-q", "-m", "heads only");
  git(heads, "clean", "-fdq");
  assert.ok(refused(heads).length > 0);
});

test("Change Sealing does not authorise rewriting sealed history, the lock, BRAIN or stray seals", () => {
  const rewrite: [string, (repo: string) => void][] = [
    ["a sealed Change's seal modified", (r) => edit(r, "change/change/26/09/30/01/seal.json")],
    [
      "a sealed Change's seal deleted",
      (r) => {
        fs.rmSync(path.join(r, "change/change/26/09/30/01/seal.json"));
        commit(r, "delete");
      },
    ],
    ["the lock", (r) => edit(r, "seals.json.lock", "lock\n")],
    ["a BRAIN seal", (r) => edit(r, "brain/learning/genesis/26/10/01/01/seal.json")],
    ["a misplaced seal", (r) => edit(r, "change/far/26/09/25/01/nested/seal.json", "{}\n")],
    [
      "a chain dropped from the heads",
      (r) => {
        const f = path.join(r, "seals.json");
        const h = JSON.parse(fs.readFileSync(f, "utf8"));
        delete h.testing;
        edit(r, "seals.json", JSON.stringify(h, null, 2) + "\n");
      },
    ],
  ];
  for (const [name, sabotage] of rewrite) {
    const repo = sealed();
    commit(repo, "seal");
    sabotage(repo);
    assert.ok(refused(repo).length > 0, name);
  }
});

test("authored seal state, byte-for-byte unrelated to any sealing, is refused where no Change is sealed", () => {
  const repo = evolution();
  edit(repo, CHANGE_SEAL, "forged\n");
  edit(repo, "seals.json", "{}\n");
  assert.ok(refused(repo).length > 0);
});
