import { pathToFileURL } from "node:url";
import { checkSkills } from "./skills.js";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [skillsDir, ...rest] = process.argv.slice(2);
  if (!skillsDir || rest.length) {
    console.error("usage: check.ts <skills-dir>");
    process.exitCode = 2;
  } else {
    const errors = checkSkills(skillsDir);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  }
}
