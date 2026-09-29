import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { readRequirements, requirementErrors } from "../skills/managing-requirements/scripts/requirements.js";
import { linkErrors, repoCases } from "./links.js";
import { kaal, regressionCandidate } from "./test-data.js";

/** The subject of this file's cases about KAAL itself. */
const KAAL = kaal();
const REQUIREMENTS = path.join(KAAL, "requirements");

// Why: brain/learning/genesis/26/09/28/01/nodes/managing-requirements.md
test("KAAL keeps its Requirements in requirements/, each a complete record of what KAAL commits to hold", () => {
  // A missing requirements/ is not an empty one: it would lose every Requirement KAAL records.
  assert.ok(fs.lstatSync(REQUIREMENTS, { throwIfNoEntry: false })?.isDirectory(), "requirements/ is missing");
  assert.deepEqual(requirementErrors(REQUIREMENTS), []);
});

// A Requirement is one more place a commitment is stated: testing reads it as it reads any other, and the Requirement
// knows nothing of the case.
// Why: brain/learning/genesis/26/09/28/01/nodes/managing-requirements.md
test("a case points at the Requirement whose commitment it helps prove, and the Requirement names no case", () => {
  const state = regressionCandidate("required");
  const place = "requirements/greets-by-name/requirement.md";
  assert.deepEqual(requirementErrors(path.join(state, "requirements")), []);
  assert.deepEqual(readRequirements(path.join(state, "requirements")), [
    { name: "greets-by-name", holds: "a greeting names who it greets" },
  ]);
  assert.deepEqual(
    repoCases(state)
      .filter((c) => c.places.includes(place))
      .map((c) => c.title),
    ["greets by name"],
  );
  assert.deepEqual(linkErrors(state), []);
  assert.doesNotMatch(fs.readFileSync(path.join(state, place), "utf8"), /greets by name|cases\.test/);
});
