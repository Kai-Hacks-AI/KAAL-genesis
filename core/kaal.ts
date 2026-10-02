import { pathToFileURL } from "node:url";
import { init } from "./init.js";

/** `kaal init <directory> [--kaal <kaal-directory>]`: initializes KAAL into the directory. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, directory, ...rest] = process.argv.slice(2);
  const named = rest[0] === "--kaal" && rest.length === 2;
  if (command !== "init" || !directory || (rest.length && !named)) {
    console.error("usage: kaal init <directory> [--kaal <kaal-directory>]");
    process.exitCode = 1;
  } else {
    try {
      const { born, wired } = init(directory, named ? { kaal: rest[1] } : {});
      console.log(born || wired ? `Initialized KAAL in ${directory}` : `KAAL is already initialized in ${directory}`);
    } catch (e) {
      console.error((e as Error).message);
      process.exitCode = 1;
    }
  }
}
