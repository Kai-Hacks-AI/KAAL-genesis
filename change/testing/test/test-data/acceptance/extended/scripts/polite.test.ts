import assert from "node:assert/strict";
import test from "node:test";
import { greet } from "../src/greet.js";

// Why: requirements/greets-politely/requirement.md
test("greets politely", () => {
  assert.match(greet("x"), /^hello /);
});
