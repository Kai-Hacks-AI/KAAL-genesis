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

test("every FAR record that holds Requirements has the Feature those Requirements project", () => {
  const records = fs
    .readdirSync("change/far", { recursive: true, withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name === REQUIREMENT_DIR)
    .map((e) => e.parentPath);
  assert.ok(records.length > 0);
  for (const record of records) {
    const answer = featureOf(record);
    assert.ok("text" in answer, record);
    assert.equal(fs.readFileSync(path.join(record, "feature.md"), "utf8"), answer.text, record);
  }
});
