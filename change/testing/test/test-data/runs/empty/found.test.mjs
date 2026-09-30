// Not one of this state's cases: its npm test names none, so a run must execute nothing, not discover this.
import test from "node:test";

test("is found by looking, not named", () => {});
