import assert from "node:assert/strict";
import fs from "node:fs";
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

for (const n of [1, 2]) {
  test(`adds ${n} to nothing`, () => {
    assert.equal(add(0, n), n);
  });
}
