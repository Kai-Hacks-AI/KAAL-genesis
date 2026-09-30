import { pathToFileURL } from "node:url";
import { readChanges, ROOT } from "./changes.js";

/** Everything beneath `root` at the levels Changes own that is not a Change; empty when valid. */
export function validate(root = ROOT): string[] {
  return readChanges(root).errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root = ROOT, ...rest] = process.argv.slice(2);
  if (rest.length) {
    console.error("usage: validate.ts [root]");
    process.exitCode = 2;
  } else {
    const errors = validate(root);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  }
}
