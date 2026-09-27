test("scripts/unresolved.test.ts", () => {});

// A case declared on the first line, titled with its own path, in a file one of whose imports cannot be resolved:
// the file fails before the case is ever declared.
import test from "node:test";
import "./missing.js";
