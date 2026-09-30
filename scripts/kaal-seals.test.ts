import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { kaalSealErrors, kaalSealingOutputErrors, kaalSealStateChanges, sealKaal } from "./kaal-seals.js";
import { brainData, diffData, scratchRepo, sealingDiff, tree } from "./test-data.js";

const REPO = fileURLToPath(new URL("../", import.meta.url));

/** A repository holding an open BRAIN (test-data/brains/lineages) and open Changes (test-data/changes/history). */
function openKaal(): string {
  const repo = scratchRepo("history");
  fs.cpSync(brainData("lineages"), path.join(repo, "brain/learning"), { recursive: true });
  return repo;
}

test("seals every learning and every Change, each under its own seal root", () => {
  const repo = openKaal();
  assert.deepEqual(sealKaal(repo), [
    "brain/learning/genesis/26/09/25/01",
    "brain/learning/genesis/26/09/26/01",
    "brain/learning/other/26/09/25/01",
    "change/change/26/09/30/01",
    "change/change/26/09/30/02",
    "change/testing/26/09/30/01",
  ]);
  assert.deepEqual(kaalSealErrors(repo), []);
  assert.ok(fs.existsSync(path.join(repo, "brain/learning/seals.json")));
  assert.ok(fs.existsSync(path.join(repo, "seals.json")));
});

test("checks BRAIN and Changes before sealing either, so a broken Change stops every learning from being sealed", () => {
  const repo = openKaal();
  fs.writeFileSync(path.join(repo, "change/stray.txt"), "stray\n");
  const before = tree(repo);
  assert.throws(() => sealKaal(repo), /change\/stray\.txt: not a lineage/);
  assert.deepEqual(tree(repo), before);
});

test("the guard refuses seal state of BRAIN and of Changes alike, and allows new learnings and Changes", () => {
  assert.deepEqual(kaalSealStateChanges(`${diffData("new-learning")}\n${diffData("change-new")}`), []);
  assert.deepEqual(kaalSealStateChanges(`${diffData("seal-modified")}\n${diffData("change-seal-state")}`).length, 8);
});

test("sealing may commit exactly what sealing BRAIN and Changes produces", () => {
  const brain = sealingDiff("lineages", "sealed");
  assert.deepEqual(kaalSealingOutputErrors(`${brain}\nA\tchange/change/26/09/30/01/seal.json\nA\tseals.json`), []);
  assert.deepEqual(kaalSealingOutputErrors(`${diffData("new-learning")}\n${diffData("change-new")}`), [
    "brain/learning/genesis/26/09/26/01/nodes/b.md: sealing never commits this (not seal state)",
    "change/change/26/10/01/01/owned.txt: sealing never commits this (not seal state)",
    "skills/managing-change/scripts/birth.ts: sealing never commits this (not seal state)",
  ]);
});

test("the committed repository is one sealing would accept", () => {
  assert.deepEqual(kaalSealErrors(REPO), []);
});
