import fs from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { recordDefect } from "./defects.js";

const USAGE = "usage: record.ts <dir> <name> --holds <what should hold> --observed <where> <observation-file>";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { holds: { type: "string" }, observed: { type: "string" } },
  });
  const [dir, name, observation, ...rest] = positionals;
  if (!dir || !name || !observation || rest.length || !values.holds || !values.observed) {
    console.error(USAGE);
    process.exitCode = 2;
  } else {
    try {
      console.log(
        recordDefect(dir, name, {
          holds: values.holds,
          observed: values.observed,
          observation: fs.readFileSync(observation, "utf8"),
        }),
      );
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
