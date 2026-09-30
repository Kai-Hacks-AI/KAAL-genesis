import assert from "node:assert/strict";
import test from "node:test";

test("the runner's loader ran first", () => {
  assert.equal((globalThis as { hooked?: boolean }).hooked, true);
});
