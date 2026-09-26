import { pathToFileURL } from "node:url";
import { regressionErrors, regressionIdentity } from "./regression.js";

// Judges a candidate, the KAAL state at <candidate>, by KAAL's trusted
// regression: the accepted state at [accepted], by default this one. Both are
// plain directories; the accepted regression is named by its own content,
// never by where its files are kept or how they are versioned. CI runs this
// from the accepted side, so its cases, links and runner do the judging.
// With --identity, prints the identity of the regression at [accepted]: what a
// candidate's plan names as the regression it derives from.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === "--identity" && args.length <= 2) console.log(regressionIdentity(args[1] ?? "."));
  else {
    const [candidate, accepted = ".", ...rest] = args;
    if (!candidate || rest.length) {
      console.error("usage: check-regression.ts <candidate> [accepted] | check-regression.ts --identity [accepted]");
      process.exitCode = 2;
    } else {
      const base = regressionIdentity(accepted);
      const errors = regressionErrors(accepted, candidate, base);
      if (errors.length) {
        console.error(errors.join("\n"));
        process.exitCode = 1;
      } else console.log(`the accepted regression ${base} holds against ${candidate}`);
    }
  }
}
