import test from "node:test";

// Marked todo, this case still runs: the replay observes it as it went.
test("holds, though marked todo", { todo: true }, () => {});
