import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The state these cases test: the one their run hands them, or else the one they are kept in.
const subject = process.env.KAAL_TESTED_STATE ?? fileURLToPath(new URL("../", import.meta.url));
const greetings = () => fs.readFileSync(path.join(subject, "greetings.txt"), "utf8").split("\n");

test("greets everyone it names", () => {
  for (const name of ["x", "y"]) assert.ok(greetings().includes(`hello ${name}`), name);
});
