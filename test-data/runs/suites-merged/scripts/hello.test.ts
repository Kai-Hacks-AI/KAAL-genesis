import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The state these cases test: the one their run hands them, or else the one they are kept in.
const subject = process.env.KAAL_TESTED_STATE ?? fileURLToPath(new URL("../", import.meta.url));
const said = (file: string, name = "") => fs.readFileSync(path.join(subject, file), "utf8").replace("%s", name);

// Suite: suites/greeting.md
// Suite: suites/names.md
test("says hello, by name to whoever it is given one", () => {
  for (const { file, name, greeting } of JSON.parse(fs.readFileSync(new URL("./hellos.json", import.meta.url), "utf8")) as {
    file: string;
    name?: string;
    greeting: string;
  }[])
    assert.equal(said(file, name), greeting);
});

// Suite: suites/greeting.md
test("says hello in Welsh", { skip: "not yet" }, () => {});
