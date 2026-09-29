import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Generates nothing: copies whatever `template` points at to SKILL.md.
fs.copyFileSync(
  fileURLToPath(new URL("template", import.meta.url)),
  fileURLToPath(new URL("../SKILL.md", import.meta.url)),
);
