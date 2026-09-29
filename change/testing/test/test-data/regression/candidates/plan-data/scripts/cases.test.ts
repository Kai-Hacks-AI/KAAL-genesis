import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { add } from "../src/add.js";
import { greet } from "../src/greet.js";

// Why: src/add.ts
test("adds", () => {
  assert.equal(add(1, 2), 3);
});

// Why: brain/learning/k/26/01/01/01/nodes/greeting.md
test("greets", () => {
  assert.equal(greet("x"), "hello x");
});

// Why: src/add.ts
test("adds as its fixture says", () => {
  const sum = Number(fs.readFileSync(new URL("./fixtures/sum.txt", import.meta.url), "utf8"));
  assert.equal(add(1, 2), sum);
});

// Why: brain/learning/k/26/01/01/01/nodes/greeting.md
test("greets as its plan's data says", () => {
  const word = fs.readFileSync(path.join(process.env.KAAL_PLAN_DATA ?? "", "greeting.txt"), "utf8").trim();
  assert.equal(greet("x"), `${word} x`);
});
