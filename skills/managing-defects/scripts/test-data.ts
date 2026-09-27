// Loads named test data from ../test-data so test cases hold no data themselves.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = fileURLToPath(new URL("../test-data/", import.meta.url));

/** An observation or a repair's account, from test-data/observations, as exact bytes. */
export function observation(name: string): string {
  return fs.readFileSync(path.join(DATA, "observations", `${name}.md`), "utf8");
}

/** The path of an observation or a repair's account, from test-data/observations. */
export function observationFile(name: string): string {
  return path.join(DATA, "observations", `${name}.md`);
}

/** A scratch copy of a defects directory from test-data: `defects`, holding one open and one resolved defect, or `broken`. */
export function defectsDir(name: "defects" | "broken"): string {
  const to = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "defects-")), name);
  fs.cpSync(path.join(DATA, name), to, { recursive: true });
  return to;
}

/** A new, empty directory to keep defects in. */
export function emptyDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "defects-"));
}
