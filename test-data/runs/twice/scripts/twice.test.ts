import test from "node:test";

// Two cases at one address: the first is cancelled before it starts, the second runs.
const cancel = new AbortController();
cancel.abort();

test("greets", { signal: cancel.signal }, () => {});

test("greets", () => {});
