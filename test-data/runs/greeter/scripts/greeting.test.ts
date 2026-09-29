import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The state these cases test: the one their run hands them, or else the one they are kept in.
const subject = process.env.KAAL_TESTED_STATE ?? fileURLToPath(new URL("../", import.meta.url));

test("the state says hello", () => {
  assert.equal(fs.readFileSync(path.join(subject, "greeting.txt"), "utf8"), "hello\n");
});

test("is run only off Windows", { skip: process.platform === "win32" }, () => {});

test("waves", { skip: "not yet" }, () => {});
