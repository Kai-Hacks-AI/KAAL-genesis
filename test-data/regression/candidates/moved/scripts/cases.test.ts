import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { add } from "../src/add.js";

// Why: src/add.ts
test("adds", () => {
  assert.equal(add(1, 2), 3);
});

// Why: src/add.ts
test("adds as its fixture says", () => {
  const sum = Number(fs.readFileSync(new URL("./fixtures/sum.txt", import.meta.url), "utf8"));
  assert.equal(add(1, 2), sum);
});
