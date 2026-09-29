import fs from "node:fs";
import { fileURLToPath } from "node:url";

fs.writeFileSync(
  fileURLToPath(new URL("../SKILL.md", import.meta.url)),
  "---\nname: born\ndescription: Born from its own init.\n---\n\n# Body\n",
);
