import assert from "node:assert/strict";
import test from "node:test";
import { wave } from "../src/wave.js";

// Why: requirements/waves/requirement.md
test("waves", () => {
  assert.equal(wave("x"), "~ x");
});
