import { fileURLToPath, pathToFileURL } from "node:url";
import { regressionErrors, regressionIdentity } from "./regression.js";

// Judges a candidate, the KAAL state at <candidate>, by KAAL's trusted
// regression: the accepted state this checker belongs to. It is never handed
// another accepted state, so the checker, runner and cases that judge are
// always the accepted state's own, and its identity, which covers them, names
// what really judged. Both states are plain directories; the accepted
// regression is named by its own content, never by where its files are kept or
// how they are versioned. With --identity, prints that identity: what a
// candidate's plan names as the regression it derives from.
const ACCEPTED = fileURLToPath(new URL("..", import.meta.url));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--identity") console.log(regressionIdentity(ACCEPTED));
  else if (args.length !== 1 || args[0]!.startsWith("--")) {
    console.error("usage: check-regression.ts <candidate> | check-regression.ts --identity");
    process.exitCode = 2;
  } else {
    const [candidate] = args as [string];
    const base = regressionIdentity(ACCEPTED);
    const errors = regressionErrors(ACCEPTED, candidate, base);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else console.log(`the accepted regression ${base} holds against ${candidate}`);
  }
}
