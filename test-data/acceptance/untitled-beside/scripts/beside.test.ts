import assert from "node:assert/strict";
import test from "node:test";
import { add } from "../src/add.js";
import { greet } from "../src/greet.js";

// Why: brain/learning/k/26/01/01/01/nodes/greeting.md
test("", () => {
  assert.equal(greet("z"), "hello z");
});

// Why: src/add.ts
test("adds once more", () => {
  assert.equal(add(3, 4), 7);
});
