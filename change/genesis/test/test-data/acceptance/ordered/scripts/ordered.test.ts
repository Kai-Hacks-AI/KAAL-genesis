import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { add } from "../src/add.js";

// Why: src/add.ts
test("adds before anything is marked", () => {
  assert.equal(add(1, 4), 5);
  if (process.env.KAAL_WAVE_MARK) assert.equal(fs.existsSync(process.env.KAAL_WAVE_MARK), false);
});

// Why: brain/learning/k/26/01/01/01/nodes/greeting.md
test("marks afterwards", () => {
  if (process.env.KAAL_WAVE_MARK) fs.writeFileSync(process.env.KAAL_WAVE_MARK, "marked\n");
});
