import assert from "node:assert/strict";
import test from "node:test";

// Cancelled before it starts: the runner reports it as failed, though its body never runs.
const cancel = new AbortController();
cancel.abort();

test("is cancelled before it starts", { signal: cancel.signal }, () => {
  assert.fail("never run");
});

test("breaks", () => {
  assert.fail("its claim does not hold");
});
