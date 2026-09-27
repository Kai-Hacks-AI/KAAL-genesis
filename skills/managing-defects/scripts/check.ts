import { pathToFileURL } from "node:url";
import { defectErrors, readDefects } from "./defects.js";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, ...rest] = process.argv.slice(2);
  if (!dir || rest.length) {
    console.error("usage: check.ts <dir>");
    process.exitCode = 2;
  } else {
    const errors = defectErrors(dir);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else {
      for (const d of readDefects(dir)) console.log(`${d.name}: tested by ${d.testedBy.join("; ")}`);
    }
  }
}
