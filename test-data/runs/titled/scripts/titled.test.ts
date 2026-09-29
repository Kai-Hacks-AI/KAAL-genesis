import assert from "node:assert/strict";
import test from "node:test";

// A case whose title is its own file's path, beside one that fails: neither is a report of the file as a whole.
test("scripts/titled.test.ts", () => {});

test("breaks", () => {
  assert.fail("its claim does not hold");
});
