import fs from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { resolveDefect } from "./defects.js";

const USAGE = "usage: resolve.ts <dir> <name> --by <what repaired it> <how-file>";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { by: { type: "string" } } });
  const [dir, name, how, ...rest] = positionals;
  if (!dir || !name || !how || rest.length || !values.by) {
    console.error(USAGE);
    process.exitCode = 2;
  } else {
    try {
      console.log(resolveDefect(dir, name, { by: values.by, how: fs.readFileSync(how, "utf8") }));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
