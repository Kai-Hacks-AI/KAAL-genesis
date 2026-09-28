import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { add } from "../src/add.js";
import { greet } from "../src/greet.js";

// Why: src/add.ts
// Suite: suites/plain.md
test("adds", () => {
  assert.equal(add(1, 2), 3);
});

// Why: requirements/greets-politely/requirement.md
test("greets politely", () => {
  assert.equal(greet("x"), "hello x");
});

// Why: requirements/greets-by-name/requirement.md
test("greets by name", () => {
  assert.match(greet("x"), /x/);
});
