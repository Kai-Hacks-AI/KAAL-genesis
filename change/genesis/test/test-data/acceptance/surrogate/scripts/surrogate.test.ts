import assert from "node:assert/strict";
import test from "node:test";
import { add } from "../src/add.js";
import { touch } from "../src/touch.js";

// Why: src/add.ts
test("\ud800", () => {
  assert.equal(touch(), true);
});

// Why: src/add.ts
test("sums beside a surrogate", () => {
  assert.equal(add(3, 3), 6);
});
