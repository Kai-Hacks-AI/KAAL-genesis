import fs from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { recordDefect } from "./defects.js";

const USAGE =
  "usage: record.ts <dir> <name> --holds <what should hold> --observed <where> --tested-by <case>... <observation-file>";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      holds: { type: "string" },
      observed: { type: "string" },
      "tested-by": { type: "string", multiple: true },
    },
  });
  const [dir, name, observation, ...rest] = positionals;
  const testedBy = values["tested-by"];
  if (!dir || !name || !observation || rest.length || !values.holds || !values.observed || !testedBy) {
    console.error(USAGE);
    process.exitCode = 2;
  } else {
    try {
      console.log(
        recordDefect(dir, name, {
          holds: values.holds,
          observed: values.observed,
          testedBy,
          observation: fs.readFileSync(observation, "utf8"),
        }),
      );
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
