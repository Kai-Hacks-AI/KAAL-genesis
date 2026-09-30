import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { birthChange } from "../skills/managing-change/scripts/birth.js";
import { createDefect } from "../skills/managing-defects/scripts/create.js";
import { resolve } from "../skills/managing-defects/scripts/defects.js";
import { DEFECT_DIR, defectRoots, kaalDefects } from "./defects.js";

// KAAL composes Changes and Defects: a Defect is born inside the Change occurrence that discovered it.
// Why: brain/learning/defects/26/09/30/01/nodes/managing-defects.md
const repo = () => fs.mkdtempSync(path.join(os.tmpdir(), "kaal-defects-"));

test("KAAL's own Defects, whichever there are, are valid, unique and each resolves by its id", () => {
  const { defects, errors } = kaalDefects();
  assert.deepEqual(errors, []);
  const ids = defects.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(resolve(defects, ids).errors, []);
});

test("a valid Defect born in a new Change occurrence is discovered without any central list changing", () => {
  const dir = repo();
  fs.cpSync("change", path.join(dir, "change"), { recursive: true });
  const before = kaalDefects(dir);
  assert.deepEqual(before.errors, []);
  const root = path.join(dir, "change");
  const born = birthChange({ root, lineage: "hotfix-probe", occurrence: "26/09/30/01" });
  createDefect(path.join(born, DEFECT_DIR), "hotfix-probe-defect", "It holds.", "It did not.");
  const after = kaalDefects(dir);
  assert.deepEqual(after.errors, []);
  assert.deepEqual(
    after.defects.map((d) => d.id).sort(),
    [...before.defects.map((d) => d.id), "hotfix-probe-defect"].sort(),
  );
  assert.deepEqual(resolve(after.defects, ["hotfix-probe-defect"]).errors, []);
});

test("Defects sit inside the Change occurrence that discovered them, which gains no identity of their own", () => {
  const dir = repo();
  const root = path.join(dir, "change");
  const first = birthChange({ root, lineage: "x", occurrence: "26/09/30/01" });
  birthChange({ root, lineage: "x", occurrence: "26/09/30/02" });
  createDefect(path.join(first, DEFECT_DIR), "a", "It holds.", "It did not.");
  fs.mkdirSync(path.join(first, "requirement"));
  assert.deepEqual(defectRoots(dir), [
    path.join(root, "x/26/09/30/01", DEFECT_DIR),
    path.join(root, "x/26/09/30/02", DEFECT_DIR),
  ]);
  const { defects, errors } = kaalDefects(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    defects.map((d) => d.id),
    ["a"],
  );
});

test("a later Change discovering the same id is refused, and a Defect is never overwritten; a stray is not a Change", () => {
  const dir = repo();
  const root = path.join(dir, "change");
  const dirs = ["26/09/30/01", "26/09/30/02"].map((occurrence) =>
    path.join(birthChange({ root, lineage: "x", occurrence }), DEFECT_DIR),
  );
  createDefect(dirs[0], "a", "It holds.", "It did not.");
  assert.throws(() => createDefect(dirs[0], "a", "It holds.", "Rewritten."), /EEXIST/);
  createDefect(dirs[1], "a", "It holds.", "Seen again.");
  assert.match(kaalDefects(dir).errors.join("\n"), /id "a" is already defined/);
  assert.deepEqual(resolve(kaalDefects(dir).defects, ["a"]).errors, ["a: no such Defect"]);
  fs.writeFileSync(path.join(root, "stray.txt"), "");
  assert.match(kaalDefects(dir).errors.join("\n"), /change\/.*stray\.txt/);
});

test("Defect and Requirement directories beside each other in one occurrence do not meet", () => {
  const dir = repo();
  const born = birthChange({ root: path.join(dir, "change"), lineage: "x", occurrence: "26/09/30/01" });
  fs.mkdirSync(path.join(born, "requirement"));
  fs.writeFileSync(path.join(born, "requirement", "r.md"), "---\nid: r\n---\n\nIt holds.\n");
  createDefect(path.join(born, DEFECT_DIR), "d", "It holds.", "It did not.");
  const { defects, errors } = kaalDefects(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    defects.map((d) => d.id),
    ["d"],
  );
});
