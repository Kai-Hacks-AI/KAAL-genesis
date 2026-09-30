import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { birthChange } from "../skills/managing-change/scripts/birth.js";
import { resolve } from "../skills/managing-requirements/scripts/requirements.js";
import { createRequirement } from "../skills/managing-requirements/scripts/create.js";
import { kaalRequirements, REQUIREMENT_DIR, requirementRoots } from "./requirements.js";

// KAAL composes Changes and Requirements: a Change keeps the Requirements it
// introduces inside its one occurrence. Why: brain/learning/requirements/26/09/30/01/nodes/managing-requirements.md
const repo = () => fs.mkdtempSync(path.join(os.tmpdir(), "kaal-requirements-"));

test("KAAL's own Requirements are valid and each resolves by its id", () => {
  const { requirements, errors } = kaalRequirements();
  assert.deepEqual(errors, []);
  const ids = [
    "git-independence",
    "github-independence",
    "linux-support",
    "windows-support",
    "agent-guidance-scoped-and-concise",
    "brain-nodes-born-through-one-mechanism",
    "brain-structure-validation",
    "changes-checked-against-seals-of-target-branch",
    "closed-learning-integrity",
    "kaal-context-in-brain-not-agent-guidance",
    "kaal-meaning-in-brain-not-skills",
    "past-understanding-retained",
    "seal-state-written-only-by-sealing-on-main",
    "skills-born-from-own-init",
    "skills-follow-agent-skills-standard",
    "skills-independent-capabilities",
  ];
  assert.deepEqual(resolve(requirements, ids).errors, []);
  assert.deepEqual(requirements.map((r) => r.id).sort(), [...ids].sort());
});

test("Requirements sit inside the Change occurrence, which gains no identity of their own", () => {
  const dir = repo();
  const root = path.join(dir, "change");
  const first = birthChange({ root, lineage: "x", occurrence: "26/09/30/01" });
  birthChange({ root, lineage: "x", occurrence: "26/09/30/02" });
  createRequirement(path.join(first, REQUIREMENT_DIR), "a", "It holds.");
  fs.mkdirSync(path.join(first, "test"));
  assert.deepEqual(requirementRoots(dir), [
    path.join(root, "x/26/09/30/01", REQUIREMENT_DIR),
    path.join(root, "x/26/09/30/02", REQUIREMENT_DIR),
  ]);
  assert.deepEqual(
    kaalRequirements(dir).requirements.map((r) => r.id),
    ["a"],
  );
  assert.deepEqual(kaalRequirements(dir).errors, []);
});

test("an id defined in two Changes is refused, and so is a Change that is not one", () => {
  const dir = repo();
  const root = path.join(dir, "change");
  for (const occurrence of ["26/09/30/01", "26/09/30/02"]) {
    createRequirement(path.join(birthChange({ root, lineage: "x", occurrence }), REQUIREMENT_DIR), "a", "It holds.");
  }
  assert.match(kaalRequirements(dir).errors.join("\n"), /id "a" is already defined/);
  fs.writeFileSync(path.join(root, "stray.txt"), "");
  assert.match(kaalRequirements(dir).errors.join("\n"), /change\/.*stray\.txt/);
});
