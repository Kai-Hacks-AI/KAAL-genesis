import fs from "node:fs";
import path from "node:path";

/**
 * What one entry of a state of KAAL's files is, read from the entry itself:
 * its kind, and what it holds. A regular file holds its bytes, and whether it
 * may be executed is part of its kind; a symbolic link holds its target, byte for
 * byte, never what it points at; a directory, a named pipe or anything else holds nothing
 * but its kind, so nothing but a regular file is ever opened. Every comparison
 * of states, and every identity taken from one, reads entries this one way.
 */
export type Entry = { kind: "directory" | "file" | "executable" | "link" | "fifo" | "special"; content: Buffer };

/** The entry at `at`, or undefined if there is none. */
export function entryAt(at: string | Buffer): Entry | undefined {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(at);
  } catch {
    return undefined;
  }
  if (stat.isDirectory()) return { kind: "directory", content: Buffer.alloc(0) };
  if (stat.isSymbolicLink()) return { kind: "link", content: fs.readlinkSync(at, { encoding: "buffer" }) };
  // Whether its owner may execute it, as Git and a checkout record it.
  if (stat.isFile()) return { kind: stat.mode & 0o100 ? "executable" : "file", content: fs.readFileSync(at) };
  return { kind: stat.isFIFO() ? "fifo" : "special", content: Buffer.alloc(0) };
}

/** An entry as bytes: its kind and content, framed so no two different entries read alike. */
export function entryBytes(entry: Entry): Buffer {
  return Buffer.concat([Buffer.from(`${entry.kind}:${entry.content.length}:`), entry.content]);
}

/**
 * The entries of the directory at `dir`, each by the path to read it at, its
 * name read as bytes so no name is lost, and the name to know it by: the name
 * itself, or, for one that is not UTF-8, its readable part, a NUL, which no
 * name can hold, and its bytes in hex, so no two names are known alike.
 */
export function entriesIn(dir: string | Buffer): { name: string; at: Buffer }[] {
  const base = Buffer.isBuffer(dir) ? dir : Buffer.from(dir, "utf8");
  return fs.readdirSync(base, { encoding: "buffer" }).map((raw) => {
    const text = raw.toString("utf8");
    const name = Buffer.from(text, "utf8").equals(raw) ? text : `${text}\0${raw.toString("hex")}`;
    return { name, at: Buffer.concat([base, Buffer.from(path.sep), raw]) };
  });
}

/**
 * Gives every entry under `at` the permissions a state records of it and
 * nothing more: a regular file its owner may execute 0755, any other 0644,
 * a directory 0755; links are left as they are. A copy of a state made this
 * way holds no permission that the state's entries, and so its identity, do
 * not name, so nothing run on the copy can depend on one.
 */
export function recordedModes(at: string): void {
  const stat = fs.lstatSync(at);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    fs.chmodSync(at, 0o755);
    for (const name of fs.readdirSync(at)) recordedModes(path.join(at, name));
  } else if (stat.isFile()) fs.chmodSync(at, stat.mode & 0o100 ? 0o755 : 0o644);
}
