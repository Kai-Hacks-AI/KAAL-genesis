import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { readIdeas, resolve } from "./ideas.js";

// Prints each referenced Idea, found across every --root: its id, then
// its possibility. Fails on an id that names no Idea, so a reference that
// resolves is always an Idea. With no id, prints every id.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { root: { type: "string", multiple: true } },
  });
  if (!values.root?.length) {
    console.error("usage: read.ts --root <dir>... [id]...");
    process.exitCode = 2;
  } else {
    const { ideas, errors } = readIdeas(values.root);
    const { found, errors: missing } = resolve(ideas, positionals);
    if (errors.length || missing.length) {
      console.error([...errors, ...missing].join("\n"));
      process.exitCode = 1;
    } else if (!positionals.length) {
      for (const { id } of ideas) console.log(id);
    } else {
      for (const { id, possibility } of found) console.log(`${id}\n\n${possibility}\n`);
    }
  }
}
