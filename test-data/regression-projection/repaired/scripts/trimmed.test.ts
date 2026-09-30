import assert from "node:assert/strict";
import test from "node:test";
import { greet } from "../src/greet.js";

// Why: brain/learning/k/26/01/01/01/nodes/greeting.md
// Tests: defects/greets-untrimmed
test("greets a name given with space around it by the name alone", () => {
  assert.equal(greet(" x "), "hello x");
});
