import assert from "node:assert/strict";
import test from "node:test";
import { greet } from "../src/greet.js";

const who = "x";

test(`greets ${who}`, () => {
  assert.equal(greet(who), `hello ${who}`);
});
