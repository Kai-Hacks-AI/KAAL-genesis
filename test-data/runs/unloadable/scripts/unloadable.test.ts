import test from "node:test";

// A case titled with its own file's path, in a file that then fails to load: the file did not run as a whole.
test("scripts/unloadable.test.ts", () => {});

throw new Error("this file does not load");
