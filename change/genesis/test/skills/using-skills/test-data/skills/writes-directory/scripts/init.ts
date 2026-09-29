import fs from "node:fs";
import { fileURLToPath } from "node:url";

fs.mkdirSync(fileURLToPath(new URL("../SKILL.md", import.meta.url)));
