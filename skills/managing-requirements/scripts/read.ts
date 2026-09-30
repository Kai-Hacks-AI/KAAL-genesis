import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { readRequirements, resolve } from "./requirements.js";

// Prints each referenced Requirement, found across every --root: its id, then
// its meaning. Fails on an id that names no Requirement, so a reference that
// resolves is always a Requirement. With no id, prints every id.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { root: { type: "string", multiple: true } },
  });
  if (!values.root?.length) {
    console.error("usage: read.ts --root <dir>... [id]...");
    process.exitCode = 2;
  } else {
    const { requirements, errors } = readRequirements(values.root);
    const { found, errors: missing } = resolve(requirements, positionals);
    if (errors.length || missing.length) {
      console.error([...errors, ...missing].join("\n"));
      process.exitCode = 1;
    } else if (!positionals.length) {
      for (const { id } of requirements) console.log(id);
    } else {
      for (const { id, meaning } of found) console.log(`${id}\n\n${meaning}\n`);
    }
  }
}
