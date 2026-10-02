import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { birthChange } from "../skills/managing-change/scripts/birth.js";
import { createRequirement } from "../skills/managing-requirements/scripts/create.js";
import { featureOf } from "./feature.js";
import { REQUIREMENT_DIR } from "./requirements.js";

// The Feature of a Change is the Requirements born on it: a projection, never handwritten apart from it.
const ids = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));

function change(requirements: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-feature-"));
  const born = birthChange({ root: path.join(dir, "change"), lineage: "x", occurrence: "26/10/02/01" });
  for (const [id, meaning] of Object.entries(requirements))
    createRequirement(path.join(born, REQUIREMENT_DIR), id, meaning);
  return born;
}

test("the Feature of a Change holds every Requirement born on it, sorted, whatever can be defended", () => {
  const answer = featureOf(change({ b: "b holds.", a: "a holds." }));
  assert.ok("text" in answer);
  assert.deepEqual(ids(answer.text), ["a", "b"]);
  assert.equal(answer.text, "# Feature\n\n- a\n- b\n");
});

test("a Change that gave birth to no Requirement has a Feature of none", () => {
  const answer = featureOf(change({}));
  assert.ok("text" in answer);
  assert.deepEqual(ids(answer.text), []);
});

test("a Requirement that is not one stops the Feature being computed", () => {
  const born = change({ a: "a holds." });
  fs.writeFileSync(path.join(born, REQUIREMENT_DIR, "b.md"), "no frontmatter");
  assert.ok("errors" in featureOf(born));
});

test("feature.md written from the Feature reads back as exactly the Requirements born on the Change", () => {
  const born = change({ b: "b holds.", a: "a holds." });
  const answer = featureOf(born);
  assert.ok("text" in answer);
  fs.writeFileSync(path.join(born, "feature.md"), answer.text);
  const again = featureOf(born);
  assert.ok("text" in again);
  assert.equal(fs.readFileSync(path.join(born, "feature.md"), "utf8"), again.text);
  assert.deepEqual(ids(fs.readFileSync(path.join(born, "feature.md"), "utf8")), ["a", "b"]);
});

test("a Requirement born on another Change is not in this Change's Feature", () => {
  const first = change({ a: "a holds." });
  const second = change({ b: "b holds." });
  const answer = featureOf(second);
  assert.ok("text" in answer);
  assert.deepEqual(ids(answer.text), ["b"]);
  assert.ok(fs.existsSync(first));
});
