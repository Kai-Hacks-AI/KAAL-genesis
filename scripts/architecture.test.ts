import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createArchitecture } from "../skills/architecting/scripts/create.js";
import { resolve } from "../skills/architecting/scripts/architecture.js";
import { birthChange } from "../skills/managing-change/scripts/birth.js";
import { ARCHITECTURE_DIR, architectureRoots, kaalArchitecture } from "./architecture.js";

// KAAL composes Changes and Architecture records: a record is born inside the Change occurrence that settled it.
// Why: brain/learning/architecting/26/10/01/01/nodes/architecting.md
const repo = () => fs.mkdtempSync(path.join(os.tmpdir(), "kaal-architecture-"));

test("KAAL's own Architecture records, whichever there are, are valid, unique and each resolves by its id", () => {
  const { records, errors } = kaalArchitecture();
  assert.deepEqual(errors, []);
  const ids = records.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(resolve(records, ids).errors, []);
});

test("a valid record born in a new Change occurrence is discovered without any central list changing", () => {
  const dir = repo();
  fs.cpSync("change", path.join(dir, "change"), { recursive: true });
  const before = kaalArchitecture(dir);
  assert.deepEqual(before.errors, []);
  const born = birthChange({ root: path.join(dir, "change"), lineage: "hotfix-probe", occurrence: "26/10/01/01" });
  createArchitecture(path.join(born, ARCHITECTURE_DIR), "hotfix-probe-placement", "A owns B.");
  const after = kaalArchitecture(dir);
  assert.deepEqual(after.errors, []);
  assert.deepEqual(
    after.records.map((r) => r.id).sort(),
    [...before.records.map((r) => r.id), "hotfix-probe-placement"].sort(),
  );
});

test("records sit inside the Change occurrence, beside Requirements and Defects, which they do not meet", () => {
  const dir = repo();
  const root = path.join(dir, "change");
  const first = birthChange({ root, lineage: "x", occurrence: "26/10/01/01" });
  birthChange({ root, lineage: "x", occurrence: "26/10/01/02" });
  createArchitecture(path.join(first, ARCHITECTURE_DIR), "a", "A owns B.");
  for (const kind of ["requirement", "defect"]) {
    fs.mkdirSync(path.join(first, kind));
    fs.writeFileSync(path.join(first, kind, "r.md"), "---\nid: r\n---\n\nIt holds.\n");
  }
  assert.deepEqual(architectureRoots(dir), [
    path.join(root, "x/26/10/01/01", ARCHITECTURE_DIR),
    path.join(root, "x/26/10/01/02", ARCHITECTURE_DIR),
  ]);
  const { records, errors } = kaalArchitecture(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    records.map((r) => r.id),
    ["a"],
  );
});

test("a later Change settling the same id is refused, and a record is never overwritten; a stray is not a Change", () => {
  const dir = repo();
  const root = path.join(dir, "change");
  const dirs = ["26/10/01/01", "26/10/01/02"].map((occurrence) =>
    path.join(birthChange({ root, lineage: "x", occurrence }), ARCHITECTURE_DIR),
  );
  createArchitecture(dirs[0], "a", "A owns B.");
  assert.throws(() => createArchitecture(dirs[0], "a", "Rewritten."), /EEXIST/);
  createArchitecture(dirs[1], "a", "A owns C.");
  assert.match(kaalArchitecture(dir).errors.join("\n"), /id "a" is already defined/);
  assert.deepEqual(resolve(kaalArchitecture(dir).records, ["a"]).errors, ["a: no such Architecture"]);
  fs.writeFileSync(path.join(root, "stray.txt"), "");
  assert.match(kaalArchitecture(dir).errors.join("\n"), /change\/.*stray\.txt/);
});
