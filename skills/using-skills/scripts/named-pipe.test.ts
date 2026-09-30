import assert from "node:assert/strict";
import test from "node:test";
import { birthErrors } from "./skills.js";
import { skill } from "./test-data.js";

// A named pipe is a filesystem entry only on POSIX, so this claim exists only
// there; that a SKILL.md which is not a regular file is reported and never read
// is shown on every platform in skills.test.ts.
test(
  "an init that writes SKILL.md as a named pipe is reported, never read",
  { skip: process.platform === "win32" },
  () => {
    assert.deepEqual(birthErrors(skill("writes-pipe")), [
      "writes-pipe: running scripts/init.ts does not write SKILL.md as a regular file",
    ]);
  },
);
