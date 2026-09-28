import assert from "node:assert/strict";
import test from "node:test";
import { greet } from "../src/greet.js";

// Why: requirements/greets-by-name/requirement.md
// Suite: suites/names.md
test("names whoever it greets", () => {
  assert.match(greet("y"), /y/);
});
