import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createIdea } from "../skills/managing-ideas/scripts/create.js";
import { resolve } from "../skills/managing-ideas/scripts/ideas.js";
import { birthChange } from "../skills/managing-change/scripts/birth.js";
import { IDEA_DIR, ideaRoots, kaalIdeas } from "./ideas.js";

// KAAL composes Changes and Ideas: an Idea is born inside the Change occurrence that settled it.
// Why: brain/learning/ideas/26/10/01/01/nodes/managing-ideas.md
const repo = () => fs.mkdtempSync(path.join(os.tmpdir(), "kaal-idea-"));

test("KAAL's own Ideas, whichever there are, are valid, unique and each resolves by its id", () => {
  const { ideas, errors } = kaalIdeas();
  assert.deepEqual(errors, []);
  const ids = ideas.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(resolve(ideas, ids).errors, []);
});

test("a valid Idea born in a new Change occurrence is discovered without any central list changing", () => {
  const dir = repo();
  fs.cpSync("change", path.join(dir, "change"), { recursive: true });
  const before = kaalIdeas(dir);
  assert.deepEqual(before.errors, []);
  const born = birthChange({ root: path.join(dir, "change"), lineage: "hotfix-probe", occurrence: "26/10/01/01" });
  createIdea(path.join(born, IDEA_DIR), "hotfix-probe-idea", "It could be so.");
  const after = kaalIdeas(dir);
  assert.deepEqual(after.errors, []);
  assert.deepEqual(after.ideas.map((r) => r.id).sort(), [...before.ideas.map((r) => r.id), "hotfix-probe-idea"].sort());
});

test("Ideas sit inside the Change occurrence, beside Requirements, Defects and Architecture, which they do not meet", () => {
  const dir = repo();
  const root = path.join(dir, "change");
  const first = birthChange({ root, lineage: "x", occurrence: "26/10/01/01" });
  birthChange({ root, lineage: "x", occurrence: "26/10/01/02" });
  createIdea(path.join(first, IDEA_DIR), "a", "It could be so.");
  for (const kind of ["requirement", "defect", "architecture"]) {
    fs.mkdirSync(path.join(first, kind));
    fs.writeFileSync(path.join(first, kind, "r.md"), "---\nid: r\n---\n\nIt holds.\n");
  }
  assert.deepEqual(ideaRoots(dir), [
    path.join(root, "x/26/10/01/01", IDEA_DIR),
    path.join(root, "x/26/10/01/02", IDEA_DIR),
  ]);
  const { ideas, errors } = kaalIdeas(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    ideas.map((r) => r.id),
    ["a"],
  );
});

test("a later Change retaining the same id is refused, and an Idea is never overwritten; a stray is not a Change", () => {
  const dir = repo();
  const root = path.join(dir, "change");
  const dirs = ["26/10/01/01", "26/10/01/02"].map((occurrence) =>
    path.join(birthChange({ root, lineage: "x", occurrence }), IDEA_DIR),
  );
  createIdea(dirs[0], "a", "It could be so.");
  assert.throws(() => createIdea(dirs[0], "a", "Rewritten."), /EEXIST/);
  createIdea(dirs[1], "a", "It could be otherwise.");
  assert.match(kaalIdeas(dir).errors.join("\n"), /id "a" is already defined/);
  assert.deepEqual(resolve(kaalIdeas(dir).ideas, ["a"]).errors, ["a: no such Idea"]);
  fs.writeFileSync(path.join(root, "stray.txt"), "");
  assert.match(kaalIdeas(dir).errors.join("\n"), /change\/.*stray\.txt/);
});
