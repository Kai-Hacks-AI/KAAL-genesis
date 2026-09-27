import fs from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { recordIdea } from "./ideas.js";

const USAGE = "usage: record.ts <dir> <name> --idea <possibility> <context-file>";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { idea: { type: "string" } },
  });
  const [dir, name, context, ...rest] = positionals;
  if (!dir || !name || !context || rest.length || !values.idea) {
    console.error(USAGE);
    process.exitCode = 2;
  } else {
    try {
      console.log(recordIdea(dir, name, { idea: values.idea, context: fs.readFileSync(context, "utf8") }));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
