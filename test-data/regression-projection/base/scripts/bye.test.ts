import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { bye } from "../src/bye.js";
import { greet } from "../src/greet.js";

/** Each line of a fixture as the name it is given and what the answer must say. */
const lines = (fixture: string) =>
  fs
    .readFileSync(new URL(fixture, import.meta.url), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("|") as [string, string]);

// Why: requirements/says-goodbye/requirement.md
test("says goodbye to each name its fixture lists", () => {
  for (const [name, says] of lines("./fixtures/goodbyes.txt")) assert.ok(bye(name).includes(says));
});

// Why: brain/learning/k/26/01/01/01/nodes/greeting.md
test("greets nobody as its golden file says", () => {
  assert.equal(`${greet("")}|`, fs.readFileSync(new URL("./fixtures/greeting.golden", import.meta.url), "utf8"));
});
