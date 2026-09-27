// Kept beside a testing state, not in it: a run of that state must not execute it as one of its cases.
import test from "node:test";

test("runs outside its state", () => {});
