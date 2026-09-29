import { pathToFileURL } from "node:url";
import { brainErrors, stateBrain } from "./brain-seals.js";

// Checks the BRAIN of a state, <state> (by default the current directory), a
// plain directory: that it is valid and every sealed learning is intact, as
// sealing would accept it. Where BRAIN lives in a state is KAAL's, never the
// caller's. CI passes a change's state, so this code, never the change's,
// does the checking.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [state = ".", ...rest] = process.argv.slice(2);
    if (rest.length) throw new Error("usage: check-seals.ts [state]");
    const errors = brainErrors(stateBrain(state));
    if (errors.length) throw new Error(errors.join("\n"));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
