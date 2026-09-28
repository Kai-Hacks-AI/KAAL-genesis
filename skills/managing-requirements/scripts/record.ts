import fs from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { recordRequirement } from "./requirements.js";

const USAGE = "usage: record.ts <dir> <name> --holds <what is committed to hold> <statement-file>";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { holds: { type: "string" } },
  });
  const [dir, name, statement, ...rest] = positionals;
  if (!dir || !name || !statement || rest.length || !values.holds) {
    console.error(USAGE);
    process.exitCode = 2;
  } else {
    try {
      console.log(recordRequirement(dir, name, { holds: values.holds, statement: fs.readFileSync(statement, "utf8") }));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
