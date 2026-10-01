import assert from "node:assert/strict";
import test from "node:test";
import { NODE_TEST } from "./test-cases.js";

// What node:test offers is read here, in a Carrier of its own: a Carrier that reaches node:test by a second
// route is not trusted to have its own test calls read (see test-cases.ts).
test("every export and member of the running node:test is classified, so none this skill cannot read goes unnoticed", async () => {
  const module = await import("node:test");
  const classified = new Set<string>([...NODE_TEST.test, ...NODE_TEST.other, ...NODE_TEST.ignored]);
  const exports = Object.keys(module);
  const members = [...Object.keys(module.test), ...Object.keys(module.it)];
  assert.deepEqual(
    [...new Set([...exports, ...members])].filter((name) => !classified.has(name)),
    [],
  );
  assert.deepEqual(
    Object.keys(module.describe).filter((name) => !(NODE_TEST.modifiers as readonly string[]).includes(name)),
    [],
  );
});
