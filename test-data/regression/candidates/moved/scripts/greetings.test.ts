import assert from "node:assert/strict";
import test from "node:test";
import { greet } from "../src/greet.js";

// Tests: defects/greets-no-one
// Why: brain/learning/k/26/01/01/01/nodes/greeting.md
test("greets whoever it is given", () => {
  assert.equal(greet("x"), "hello x");
});
