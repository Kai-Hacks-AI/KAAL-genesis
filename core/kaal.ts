import { pathToFileURL } from "node:url";
import { init } from "./init.js";

/** `kaal init <directory>`: initializes KAAL into the directory. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, directory, ...rest] = process.argv.slice(2);
  if (command !== "init" || !directory || rest.length) {
    console.error("usage: kaal init <directory>");
    process.exitCode = 1;
  } else {
    try {
      console.log(
        init(directory).born ? `Initialized KAAL in ${directory}` : `KAAL is already initialized in ${directory}`,
      );
    } catch (e) {
      console.error((e as Error).message);
      process.exitCode = 1;
    }
  }
}
