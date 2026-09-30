import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validate } from "../skills/using-changes/scripts/validate.js";

// KAAL keeps its Changes under change/, one lineage per evolution.
// Why: brain/learning/change/26/09/30/01/nodes/using-changes.md
const CHANGES = fileURLToPath(new URL("../change/", import.meta.url));

test("KAAL's Changes are valid", () => {
  assert.deepEqual(validate(CHANGES), []);
});
