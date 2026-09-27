import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Where the testing anchor is created by default. */
export const ANCHOR_DIR = "test";

/** The anchor's own entry point: it routes agents working with tests to this skill. */
export const ANCHOR_AGENTS_MD = "# Testing\n\nUse the `testing` skill when working with tests.\n";

/**
 * Creates the testing anchor at `dir`: a directory holding only `AGENTS.md`,
 * which routes agents working with tests to this skill. Refuses when `dir`
 * already exists, so an existing anchor is never overwritten; a failure
 * partway removes what this call created. Returns the anchor's directory.
 */
export function createAnchor(dir = ANCHOR_DIR): string {
  try {
    // Not recursive: an existing directory, even an empty one, is refused.
    fs.mkdirSync(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`${dir}: already exists; refusing to create a testing anchor over it`);
    throw e;
  }
  try {
    fs.writeFileSync(path.join(dir, "AGENTS.md"), ANCHOR_AGENTS_MD, { flag: "wx" });
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return dir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir = ANCHOR_DIR, ...rest] = process.argv.slice(2);
  if (rest.length) {
    console.error("usage: create-anchor.ts [dir]");
    process.exitCode = 2;
  } else {
    try {
      createAnchor(dir);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  }
}
