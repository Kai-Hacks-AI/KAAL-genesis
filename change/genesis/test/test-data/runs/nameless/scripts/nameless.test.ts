import test from "node:test";

// A case whose title is built while it runs, so no case of the state names it, cancelled before it starts.
const cancel = new AbortController();
cancel.abort();
const name = ["cancelled", "without", "a", "name"].join(" ");

test(name, { signal: cancel.signal }, () => {});
