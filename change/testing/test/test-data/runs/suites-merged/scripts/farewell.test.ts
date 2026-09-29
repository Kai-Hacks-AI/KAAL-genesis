import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The state these cases test: the one their run hands them, or else the one they are kept in.
const subject = process.env.KAAL_TESTED_STATE ?? fileURLToPath(new URL("../", import.meta.url));
const said = (file: string, name = "") => fs.readFileSync(path.join(subject, file), "utf8").replace("%s", name);

// Suite: suites/names.md
test("says goodbye to whoever it is given, by name", () => {
  assert.equal(said("goodbye-name.txt", "Emil"), "goodbye, Emil\n");
});

test("waves", () => {
  assert.ok(fs.existsSync(path.join(subject, "wave.txt")), "the state does not wave");
});
