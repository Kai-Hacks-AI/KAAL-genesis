import assert from "node:assert/strict";
import test from "node:test";
import { add } from "../src/add.js";

// Why: src/add.ts
test("sums", () => {
  assert.equal(add(1, 1), 2);
});

// Why: src/add.ts
test("sums\n", () => {
  assert.equal(add(2, 2), 4);
});
