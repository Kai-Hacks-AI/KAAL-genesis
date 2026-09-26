import fs from "node:fs";

/**
 * What one entry of a state of KAAL's files is, read from the entry itself:
 * its kind, and what it holds. A regular file holds its bytes, and whether it
 * may be executed is part of its kind; a symbolic link holds its target, never
 * what it points at; a directory, a named pipe or anything else holds nothing
 * but its kind, so nothing but a regular file is ever opened. Every comparison
 * of states, and every identity taken from one, reads entries this one way.
 */
export type Entry = { kind: "directory" | "file" | "executable" | "link" | "fifo" | "special"; content: Buffer };

/** The entry at `at`, or undefined if there is none. */
export function entryAt(at: string): Entry | undefined {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(at);
  } catch {
    return undefined;
  }
  if (stat.isDirectory()) return { kind: "directory", content: Buffer.alloc(0) };
  if (stat.isSymbolicLink()) return { kind: "link", content: Buffer.from(fs.readlinkSync(at), "utf8") };
  if (stat.isFile()) return { kind: stat.mode & 0o111 ? "executable" : "file", content: fs.readFileSync(at) };
  return { kind: stat.isFIFO() ? "fifo" : "special", content: Buffer.alloc(0) };
}

/** An entry as bytes: its kind and content, framed so no two different entries read alike. */
export function entryBytes(entry: Entry): Buffer {
  return Buffer.concat([Buffer.from(`${entry.kind}:${entry.content.length}:`), entry.content]);
}
