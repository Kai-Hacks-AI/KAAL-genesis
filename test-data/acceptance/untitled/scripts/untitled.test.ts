import assert from "node:assert/strict";
import test from "node:test";
import { greet } from "../src/greet.js";

// Why: brain/learning/k/26/01/01/01/nodes/greeting.md
test("", () => {
  assert.equal(greet("z"), "hello z");
});
