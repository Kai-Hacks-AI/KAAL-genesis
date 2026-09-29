import fs from "node:fs";
import { fileURLToPath } from "node:url";

fs.writeFileSync(
  fileURLToPath(new URL("../SKILL.md", import.meta.url)),
  "---\nname: hand-edited\ndescription: What init generates.\n---\n\n# Body\n",
);
