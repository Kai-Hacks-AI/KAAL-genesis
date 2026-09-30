import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { readDefects, resolve } from "./defects.js";

// Prints each referenced Defect, found across every --root: its id, what was
// intended to hold, then what was observed. Fails on an id that names no Defect, so a reference that
// resolves is always a Defect. With no id, prints every id.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { root: { type: "string", multiple: true } },
  });
  if (!values.root?.length) {
    console.error("usage: read.ts --root <dir>... [id]...");
    process.exitCode = 2;
  } else {
    const { defects, errors } = readDefects(values.root);
    const { found, errors: missing } = resolve(defects, positionals);
    if (errors.length || missing.length) {
      console.error([...errors, ...missing].join("\n"));
      process.exitCode = 1;
    } else if (!positionals.length) {
      for (const { id } of defects) console.log(id);
    } else {
      for (const { id, holds, observation } of found) console.log(`${id}\n\nholds: ${holds}\n\n${observation}\n`);
    }
  }
}
