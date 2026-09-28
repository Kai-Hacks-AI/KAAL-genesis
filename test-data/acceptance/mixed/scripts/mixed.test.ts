import assert from "node:assert/strict";
import test from "node:test";
import { add } from "../src/add.js";
import { mark } from "../src/mark.js";

// Why: brain/learning/k/26/01/01/01/nodes/greeting.md
test("marks", () => {
  assert.equal(mark(), true);
});

// Why: src/add.ts
test("adds again", () => {
  assert.equal(add(2, 3), 5);
});
