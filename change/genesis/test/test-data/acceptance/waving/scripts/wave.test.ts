import assert from "node:assert/strict";
import test from "node:test";
import { wave } from "../src/wave.js";

// Why: brain/learning/k/26/01/01/01/nodes/greeting.md
test("waves", () => {
  assert.equal(wave("x"), "bye x");
});
