import { pathToFileURL } from "node:url";
import { brainErrors, brainRoot } from "./brain-seals.js";

// Checks the BRAIN of <state> (by default this one), a plain directory, that
// sealing would accept: it is valid and every sealed learning is intact. CI
// passes a change's checkout as <state>, so this code, never the change's,
// does the checking.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [state = ".", ...rest] = process.argv.slice(2);
  if (rest.length) {
    console.error("usage: check-seals.ts [state]");
    process.exitCode = 2;
  } else {
    const errors = brainErrors(brainRoot(state));
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  }
}
