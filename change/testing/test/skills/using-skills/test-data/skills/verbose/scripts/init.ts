import fs from "node:fs";
import { fileURLToPath } from "node:url";

const noise = "x".repeat(4 * 1024 * 1024);
fs.writeSync(1, noise);
fs.writeSync(2, noise);
fs.writeFileSync(
  fileURLToPath(new URL("../SKILL.md", import.meta.url)),
  "---\nname: verbose\ndescription: Its init prints megabytes while it works.\n---\n\n# Body\n",
);
