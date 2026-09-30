// Loads named test data from ../test-data so test cases hold no data themselves.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = fileURLToPath(new URL("../test-data/", import.meta.url));

/** Path to a read-only root of Changes in test-data/changes. */
export function changeData(name: string): string {
  return path.join(DATA, "changes", name);
}

/** A writable copy of a root from test-data/changes, or a root not yet created when no name is given. */
export function scratchChanges(name?: string): string {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "changes-")), "change");
  if (name) fs.cpSync(changeData(name), root, { recursive: true });
  return root;
}

/** Every entry under a root by posix path, directories ending in "/", files with their contents. */
export function tree(root: string): Record<string, string> {
  return Object.fromEntries(
    fs
      .readdirSync(root, { recursive: true, withFileTypes: true })
      .map((e) => [path.join(e.parentPath, e.name), e.isDirectory()] as const)
      .map(
        ([f, dir]) =>
          [
            path.relative(root, f).split(path.sep).join("/") + (dir ? "/" : ""),
            dir ? "" : fs.readFileSync(f, "utf8"),
          ] as const,
      )
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

/** Lineages a Change must refuse, by why: none is portable. */
export const UNPORTABLE_LINEAGES = ["", "Testing", "a_b", "a--b", "-a", "a.b", "a/b", "..", "con", "lpt1"];

/** Occurrences a Change must refuse, by why: none is a YY/MM/DD/CC calendar date and counter. */
export const MALFORMED_OCCURRENCES = [
  "",
  "26/9/30/01",
  "26-09-30-01",
  "26/09/30",
  "26/09/30/01/02",
  "26/13/01/01",
  "26/02/30/01",
  "26/09/00/01",
  "26/09/30/00",
  "../../../x",
];
