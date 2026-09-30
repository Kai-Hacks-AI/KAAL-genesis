import assert from "node:assert/strict";
import test from "node:test";

// Marked todo, these cases still run: what they show is observed, unlike a skipped case's.
test("holds, though marked todo", { todo: true }, () => {});

test("breaks, though marked todo", { todo: true }, () => {
  assert.fail("its claim does not hold");
});

test("is skipped", { skip: true }, () => {
  assert.fail("never run");
});

test("is skipped without a reason", { skip: "" }, () => {});
