import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The state these cases test: the one their run hands them, or else the one they are kept in.
const subject = process.env.KAAL_TESTED_STATE ?? fileURLToPath(new URL("../", import.meta.url));

// Only the candidate itself holds its own cases: the copy the accepted cases are replayed in has them removed.
test("judges the candidate itself", () => {
  assert.ok(fs.existsSync(path.join(subject, "scripts/greetings.test.ts")));
});
