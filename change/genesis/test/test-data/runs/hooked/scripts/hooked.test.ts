import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

// Every case here has a hook before it that fails, so none of their bodies runs.
beforeEach(() => {
  throw new Error("the hook before each case fails");
});

test("never starts", () => {
  assert.fail("never run");
});
