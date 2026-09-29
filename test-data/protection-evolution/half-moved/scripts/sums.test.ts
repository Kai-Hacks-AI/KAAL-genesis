import assert from "node:assert/strict";
import test from "node:test";
import { add } from "../src/add.js";

// Why: src/add.ts
test("adds any two numbers", () => {
  for (const [a, b] of [[1, 2], [0, 5], [-3, 3]]) assert.equal(add(a!, b!), a! + b!);
});
