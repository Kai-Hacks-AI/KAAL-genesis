// Loads named test data from ../test-data so test cases hold no data themselves.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = fileURLToPath(new URL("../test-data/", import.meta.url));

/** Guidance a using system supplies, from test-data/guidance, as exact bytes. */
export function guidance(name: string): string {
  return fs.readFileSync(path.join(DATA, "guidance", `${name}.md`), "utf8");
}

/** A new, empty directory to use as a scope. */
export function scratchScope(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agents-"));
}
