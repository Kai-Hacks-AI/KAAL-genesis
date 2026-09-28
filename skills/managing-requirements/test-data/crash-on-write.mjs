// Preloaded into a recording to crash it: the first write is cut short and the process dies at once, running no cleanup.
import fs from "node:fs";

const write = fs.writeFileSync;
fs.writeFileSync = (target, data, options) => {
  write(target, String(data).slice(0, 3), options);
  process.exit(9);
};
