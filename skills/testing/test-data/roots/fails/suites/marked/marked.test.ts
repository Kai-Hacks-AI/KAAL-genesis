import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("the candidate is marked", () => {
  assert.ok(fs.existsSync("marker.txt"));
});
