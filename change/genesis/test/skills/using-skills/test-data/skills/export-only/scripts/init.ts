import fs from "node:fs";

export function init(target: string): void {
  fs.writeFileSync(target, "---\nname: export-only\ndescription: Its init writes nothing when run.\n---\n\n# Body\n");
}
