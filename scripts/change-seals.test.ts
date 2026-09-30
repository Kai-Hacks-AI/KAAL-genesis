import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { birthChange } from "../skills/managing-change/scripts/birth.js";
import {
  changeChains,
  changeErrors,
  changeRewrites,
  changeSealingOutputErrors,
  changeSealState,
  changeSealStateChanges,
  checkChanges,
  sealChanges,
} from "./change-seals.js";
import { changeRepoData, diffData, scratchRepo, tree } from "./test-data.js";

const REPO = fileURLToPath(new URL("../", import.meta.url));

/** A copy of test-data/changes/history with every Change sealed. */
function sealedHistory(): string {
  const repo = scratchRepo("history");
  sealChanges(repo);
  return repo;
}

/** Births a Change through managing-change and gives it one file. */
function born(repo: string, lineage: string, occurrence: string, file: string, bytes: string): string {
  const dir = birthChange({ root: path.join(repo, "change"), lineage, occurrence });
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), bytes);
  return dir;
}

test("one chain per Change lineage, named after it, with its Changes as units in traversal order", () => {
  assert.deepEqual(
    changeChains(scratchRepo("history")),
    new Map([
      ["change", ["change/change/26/09/30/01", "change/change/26/09/30/02"]],
      ["testing", ["change/testing/26/09/30/01"]],
    ]),
  );
});

test("seals every Change with using-seals as it is, and the seals verify unchanged", () => {
  const repo = scratchRepo("history");
  const before = tree(repo);
  assert.deepEqual(sealChanges(repo), [
    "change/change/26/09/30/01",
    "change/change/26/09/30/02",
    "change/testing/26/09/30/01",
  ]);
  const after = tree(repo);
  // Sealing adds only seal state: a seal in each Change and the heads at the top.
  assert.deepEqual(
    Object.keys(after).filter((file) => !(file in before)),
    [
      "change/change/26/09/30/01/seal.json",
      "change/change/26/09/30/02/seal.json",
      "change/testing/26/09/30/01/seal.json",
      "seals.json",
    ],
  );
  for (const file of Object.keys(before)) assert.equal(after[file], before[file], file);
  assert.deepEqual(changeErrors(repo), []);
  assert.deepEqual(sealChanges(repo), []);
});

test("editing, adding or removing a sealed Change's file, or replacing it with a directory, breaks its seal", () => {
  const owned = (repo: string) => path.join(repo, "change/change/26/09/30/01/owned.txt");
  const cases: [string, (repo: string) => void, string[]][] = [
    [
      "edited",
      (r) => fs.writeFileSync(owned(r), "rewritten\n"),
      ["change/change/26/09/30/01/owned.txt: changed after sealing"],
    ],
    [
      "added",
      (r) => fs.writeFileSync(path.join(r, "change/change/26/09/30/01/later.txt"), "later\n"),
      ["change/change/26/09/30/01/later.txt: added after sealing"],
    ],
    ["removed", (r) => fs.rmSync(owned(r)), ["change/change/26/09/30/01/owned.txt: removed after sealing"]],
    [
      "replaced",
      (r) => {
        fs.rmSync(owned(r));
        fs.mkdirSync(owned(r));
        fs.writeFileSync(path.join(owned(r), "inside.txt"), "first\n");
      },
      [
        "change/change/26/09/30/01/owned.txt/inside.txt: added after sealing",
        "change/change/26/09/30/01/owned.txt: removed after sealing",
      ],
    ],
  ];
  for (const [name, sabotage, expected] of cases) {
    const repo = sealedHistory();
    sabotage(repo);
    assert.deepEqual(checkChanges(repo), expected, name);
    assert.throws(() => sealChanges(repo), /refusing to seal Changes/, name);
  }
});

test("moving a sealed Change to another identity, or removing it or its whole lineage, breaks the chain", () => {
  const moved = sealedHistory();
  fs.renameSync(path.join(moved, "change/change/26/09/30/02"), path.join(moved, "change/change/26/09/30/03"));
  assert.deepEqual(checkChanges(moved), [
    "change/change/26/09/30/03: seal belongs to unit change/change/26/09/30/02",
    "change: head records units change/change/26/09/30/01, change/change/26/09/30/02, which do not begin the chain",
  ]);
  const removed = sealedHistory();
  fs.rmSync(path.join(removed, "change/change/26/09/30/02"), { recursive: true });
  assert.deepEqual(checkChanges(removed), [
    "change: head records units change/change/26/09/30/01, change/change/26/09/30/02, which do not begin the chain",
  ]);
  const lineage = sealedHistory();
  fs.rmSync(path.join(lineage, "change/testing"), { recursive: true });
  assert.deepEqual(checkChanges(lineage), [
    "testing: head records units change/testing/26/09/30/01, which do not begin the chain",
  ]);
});

test("a later Change leaves earlier sealed Changes protected, and is sealed without changing them", () => {
  const repo = sealedHistory();
  const before = tree(repo);
  born(repo, "change", "26/10/01/01", "test/cases/foo.txt", "later\n");
  // The later Change may own a path an earlier Change owns, with other bytes.
  born(repo, "testing", "26/10/01/01", "test/cases/foo.txt", "B\n");
  assert.deepEqual(changeErrors(repo), []);
  assert.deepEqual(sealChanges(repo), ["change/change/26/10/01/01", "change/testing/26/10/01/01"]);
  const after = tree(repo);
  for (const file of Object.keys(before).filter((f) => f !== "seals.json"))
    assert.equal(after[file], before[file], file);
  assert.deepEqual(changeErrors(repo), []);
  fs.writeFileSync(path.join(repo, "change/testing/26/09/30/01/test/cases/foo.txt"), "B\n");
  assert.deepEqual(checkChanges(repo), ["change/testing/26/09/30/01/test/cases/foo.txt: changed after sealing"]);
});

test("a Change born into sealed history, rather than after it, is refused as unsealable", () => {
  const repo = sealedHistory();
  born(repo, "change", "26/09/29/01", "owned.txt", "earlier\n");
  assert.deepEqual(changeErrors(repo), [
    "change/change/26/09/30/01: sealed after open unit change/change/26/09/29/01",
    "change/change/26/09/30/02: sealed after open unit change/change/26/09/29/01",
    "change: head records units change/change/26/09/30/01, change/change/26/09/30/02, which do not begin the chain",
  ]);
});

test("a Change's structure is checked by managing-change, and a malformed one stops sealing", () => {
  const repo = scratchRepo("history");
  fs.writeFileSync(path.join(repo, "change/stray.txt"), "stray\n");
  assert.deepEqual(changeErrors(repo), ["change/stray.txt: not a lineage"]);
  assert.throws(() => sealChanges(repo), /change\/stray\.txt: not a lineage/);
  assert.equal(fs.existsSync(path.join(repo, "seals.json")), false);
});

test("symlinks and material named like a seal are refused as the seal contract refuses them", () => {
  // Built at run time because a symlink cannot be committed portably.
  const linked = sealedHistory();
  fs.symlinkSync(
    path.join(linked, "change/testing/26/09/30/01/test/cases/foo.txt"),
    path.join(linked, "change/change/26/09/30/01/link.txt"),
  );
  assert.deepEqual(changeErrors(linked), [
    "change/change/26/09/30/01/link.txt: a Change owns only files and directories",
    "change/change/26/09/30/01/link.txt: symlink in sealed unit",
  ]);
  const nested = scratchRepo("history");
  born(nested, "change", "26/10/01/01", "nested/seal.json", "{}\n");
  assert.throws(
    () => sealChanges(nested),
    /refusing to seal a unit containing sealed unit change\/change\/26\/10\/01\/01\/nested/,
  );
  assert.equal(fs.existsSync(path.join(nested, "seals.json")), false);
  const top = scratchRepo("history");
  born(top, "change", "26/10/01/01", "seal.json", "{}\n");
  assert.match(checkChanges(top).join("\n"), /change\/change\/26\/10\/01\/01: unreadable seal \(not a seal\)/);
});

test("two Changes born apart with one identity are refused once one is sealed, and sealed as one if neither is", () => {
  // The later candidate brings its own file into the identity the earlier one sealed.
  const repo = sealedHistory();
  fs.writeFileSync(path.join(repo, "change/change/26/09/30/02/theirs.txt"), "theirs\n");
  assert.deepEqual(checkChanges(repo), ["change/change/26/09/30/02/theirs.txt: added after sealing"]);
  // Brought together before either is sealed, nothing tells them apart: that stays with whatever brings them together.
  const unsealed = scratchRepo("history");
  fs.writeFileSync(path.join(unsealed, "change/change/26/09/30/02/theirs.txt"), "theirs\n");
  assert.deepEqual(changeErrors(unsealed), []);
});

test("the guard refuses a candidate that rewrites a Change already born on its target, sealed or not, and allows new ones", () => {
  // The target holds test-data/changes/history, none of it sealed yet: accepted, but not yet sealed on main.
  const target = Object.keys(tree(changeRepoData("history")));
  assert.deepEqual(changeRewrites(diffData("change-rewrites"), target), [
    "change/change/26/09/30/01/owned.txt: rewrites Change change/change/26/09/30/01, already born on the target (M)",
    "change/change/26/09/30/02/theirs.txt: rewrites Change change/change/26/09/30/02, already born on the target (A)",
    "change/testing/26/09/30/01/test/cases/foo.txt: rewrites Change change/testing/26/09/30/01, already born on the target (D)",
  ]);
  assert.deepEqual(changeRewrites(diffData("change-new"), target), []);
});

test("classifies seal state over Changes: each Change's seal, and the heads and lock at the top", () => {
  assert.equal(changeSealState("change/change/26/09/30/01/seal.json"), "unit-seal");
  assert.equal(changeSealState("seals.json"), "heads");
  assert.equal(changeSealState("seals.json.lock"), "lock");
  assert.equal(changeSealState("change/change/26/09/30/01/nested/seal.json"), "misplaced-seal");
  assert.equal(changeSealState("change/seal.json"), "misplaced-seal");
  assert.equal(changeSealState("change/change/26/09/30/01/owned.txt"), undefined);
  assert.equal(changeSealState("brain/learning/seals.json"), undefined);
  assert.equal(changeSealState("skills/using-seals/test-data/chains/sealed/one/seal.json"), undefined);
});

test("the guard allows new Changes and refuses a change that writes any seal state over Changes", () => {
  assert.deepEqual(changeSealStateChanges(diffData("change-new")), []);
  assert.deepEqual(changeSealStateChanges(diffData("change-seal-state")), [
    "change/change/26/10/01/01/seal.json: seal state may only be written by sealing on main (A)",
    "change/change/26/09/30/01/seal.json: seal state may only be written by sealing on main (M)",
    "change/testing/26/09/30/01/seal.json: seal state may only be written by sealing on main (D)",
    "seals.json: seal state may only be written by sealing on main (M)",
    "seals.json.lock: seal state may only be written by sealing on main (A)",
    "change/change/26/10/01/01/nested/seal.json: seal state may only be written by sealing on main (A)",
    "change/seal.json: seal state may only be written by sealing on main (A)",
  ]);
});

test("sealing may commit exactly what sealing Changes produces, and nothing else", () => {
  const repo = scratchRepo("history");
  const before = tree(repo);
  sealChanges(repo);
  born(repo, "change", "26/10/01/01", "owned.txt", "later\n");
  const middle = tree(repo);
  sealChanges(repo);
  const staged = (from: Record<string, string>, to: Record<string, string>) =>
    Object.keys(to)
      .filter(
        (file) =>
          from[file] !== to[file] && !(file.startsWith("change/change/26/10/01/01/") && !file.endsWith("seal.json")),
      )
      .map((file) => `${file in from ? "M" : "A"}\t${file}`)
      .join("\n");
  assert.deepEqual(changeSealingOutputErrors(staged(before, middle)), []);
  assert.deepEqual(changeSealingOutputErrors(staged(middle, tree(repo))), []);
  assert.deepEqual(changeSealingOutputErrors(diffData("change-new")), [
    "change/change/26/10/01/01/owned.txt: sealing never commits this (not seal state)",
    "skills/managing-change/scripts/birth.ts: sealing never commits this (not seal state)",
  ]);
});

test("KAAL's Changes are valid and their seals intact", () => {
  assert.deepEqual(changeErrors(REPO), []);
});
