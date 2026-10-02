import fs from "node:fs";

/** What stands at a path, without following a link: a link is `"other"`, whatever it points at. */
export type Kind = "missing" | "file" | "directory" | "other";

/** What stands at `path`. Only absence is reported as `"missing"`; any other failure to look is thrown. */
export function kind(path: string): Kind {
  const stat = fs.lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return "missing";
  return stat.isFile() ? "file" : stat.isDirectory() ? "directory" : "other";
}

/** Whether a regular file stands at `path`; false for anything else, and for a path that cannot be looked at. */
export function isRegularFile(path: string): boolean {
  try {
    return fs.lstatSync(path).isFile();
  } catch {
    return false;
  }
}
