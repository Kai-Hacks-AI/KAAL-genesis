import fs from "node:fs";
import { fileURLToPath } from "node:url";

fs.writeFileSync(
  fileURLToPath(new URL("../SKILL.md", import.meta.url)),
  "---\nname: collect-never-finishes\ndescription: Never finishes collecting.\n---\n\n# Body\n",
);
