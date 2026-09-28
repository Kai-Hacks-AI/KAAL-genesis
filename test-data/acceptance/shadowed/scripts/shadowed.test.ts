import assert from "node:assert/strict";
import test, { it } from "node:test";
import { add } from "../src/add.js";
import { greet } from "../src/greet.js";

// Why: brain/learning/k/26/01/01/01/nodes/greeting.md
test("drops", () => {
  assert.equal(greet("z"), "hello z");
});

// Why: src/add.ts
test("adds beside a shadow", () => {
  assert.equal(add(5, 5), 10);
});

it("drops", () => {
  assert.equal(greet("y"), "hello y");
});
