import assert from "node:assert/strict";
import test from "node:test";
import { add } from "../src/add.js";

// Why: brain/learning/k/26/01/01/01/nodes/greeting.md
test("adds", () => {
  assert.equal(add(1, 2), 3);
});
