import assert from "node:assert/strict";
import test from "node:test";
import { add } from "../src/add.js";
import { greet } from "../src/greet.js";

// Why: brain/learning/k/26/01/01/01/nodes/greeting.md
test("\u0000", () => {
  assert.equal(greet("z"), "hello z");
});

// Why: src/add.ts
test("adds with nothing beside", () => {
  assert.equal(add(4, 4), 8);
});
