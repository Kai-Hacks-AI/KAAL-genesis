import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The state these cases test: the one their run hands them, or else the one they are kept in.
const subject = process.env.KAAL_TESTED_STATE ?? fileURLToPath(new URL("../", import.meta.url));
const said = (file: string, name = "") => fs.readFileSync(path.join(subject, file), "utf8").replace("%s", name);
// The greeting word: the one the plan whose run reached these cases provides, or else their own.
const plan = process.env.KAAL_PLAN_DATA;
const word = plan ? fs.readFileSync(path.join(plan, "word.txt"), "utf8").trim() : "hello";

// Suite: suites/plain-hello.md
test("says hello", () => {
  assert.equal(said("hello.txt"), `${word}\n`);
});

// Suite: suites/names.md
test("says hello to whoever it is given, by name", () => {
  assert.equal(said("hello-name.txt", "Lotta"), `${word}, Lotta\n`);
});
