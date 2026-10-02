import fs from "node:fs";
import { fileURLToPath } from "node:url";

fs.writeFileSync(
  fileURLToPath(new URL("../SKILL.md", import.meta.url)),
  "---\nname: collects\ndescription: Collects nothing from an empty scope.\n---\n\n# Body\n",
);
