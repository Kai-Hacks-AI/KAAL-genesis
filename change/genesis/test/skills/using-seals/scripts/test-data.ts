// Loads named test data from ../test-data so test cases hold no data themselves.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io } from "./seals.js";

const DATA = fileURLToPath(new URL("../test-data/", import.meta.url));

/** The name and units of every chain in test-data/chains, oldest first. */
export const CHAIN = "chain";
export const UNITS = ["one", "two"];

/**
 * Another chain sharing the same root. test-data/chains/nested-sealed-by-other-chain
 * holds the open chain with unit "one/nested" sealed by this chain.
 */
export const OTHER_CHAIN = "other";
export const NESTED_UNITS = ["one/nested"];

/** A valid chain name that is also a property every JavaScript object inherits. */
export const PROTOTYPE_CHAIN = "constructor";

/** The open chain's units split into two chains, sealed together: "one" in CHAIN, "two" in OTHER_CHAIN. */
export const SPLIT_CHAINS: [string, string[]][] = [
  [CHAIN, ["one"]],
  [OTHER_CHAIN, ["two"]],
];

/** A chain name that is not lowercase kebab-case. */
export const INVALID_CHAIN = "Not A Chain";

/** The units of test-data/chains/unit-renamed: unit "one" renamed to "zero" after sealing. */
export const RENAMED_UNITS = ["zero", "two"];

/**
 * Unit lists a chain must refuse before reading or writing anything, by name:
 * paths that could leave the root, spellings Windows would resolve to another
 * directory (trailing dots and spaces), Windows reserved names, the root's own
 * files (the chain heads and the lock), a unit listed
 * twice or differing only in case, and a unit nested in another.
 */
export const UNSAFE_UNITS: Record<string, string[]> = {
  traversal: ["../outside"],
  absolute: ["/outside"],
  backslash: ["one\\nested"],
  "dot-segment": ["./one"],
  "trailing-slash": ["one/"],
  "trailing-dot": ["one", "one."],
  "trailing-space": ["one", "one "],
  reserved: ["con"],
  "reserved-with-extension": ["one/NUL.txt"],
  "heads-file": ["seals.json"],
  "lock-file": ["Seals.json.lock"],
  duplicate: ["one", "two", "one"],
  "case-alias": ["one", "ONE"],
  nested: ["one", "one/nested"],
};

/** Path to a read-only chain in test-data/chains. */
export function chainData(name: string): string {
  return path.join(DATA, "chains", name);
}

/** A writable copy of a chain from test-data/chains. */
export function scratchChain(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "seals-"));
  fs.cpSync(chainData(name), root, { recursive: true });
  return root;
}

/**
 * The open chain with a third unit that holds nothing. Built at run time
 * because git cannot commit an empty directory.
 */
export function chainWithEmptyUnit(): { root: string; units: string[] } {
  const root = scratchChain("open");
  fs.mkdirSync(path.join(root, "three"));
  return { root, units: [...UNITS, "three"] };
}

/**
 * The given chain with a symlink inside unit "one". Built at run time because
 * a symlink cannot be committed portably.
 */
export function chainWithSymlink(name: string): string {
  const root = scratchChain(name);
  fs.symlinkSync(path.join(root, "two", "c.txt"), path.join(root, "one", "link.txt"));
  return root;
}

/**
 * The given chain with a symlink inside unit "one" to a directory outside the
 * root that holds a file. Built at run time because a symlink cannot be
 * committed portably.
 */
export function chainWithDirectorySymlink(name: string): string {
  const root = scratchChain(name);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "seals-outside-"));
  fs.mkdirSync(path.join(outside, "deep"));
  fs.writeFileSync(path.join(outside, "deep", "outside.txt"), "outside\n");
  fs.symlinkSync(outside, path.join(root, "one", "link"), "dir");
  return root;
}

/** Every file under a root by posix path, with its contents, for byte-for-byte comparison. */
export function tree(root: string): Record<string, string> {
  return Object.fromEntries(
    fs
      .readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => path.join(e.parentPath, e.name))
      .sort()
      .map((f) => [path.relative(root, f).split(path.sep).join("/"), fs.readFileSync(f, "utf8")]),
  );
}

/**
 * The open chain with unit "one" replaced by a symlink to a directory outside
 * the root. Built at run time because a symlink cannot be committed portably.
 */
export function chainWithSymlinkedUnit(): { root: string; outside: string } {
  const root = scratchChain("open");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "seals-outside-"));
  fs.cpSync(path.join(root, "one"), outside, { recursive: true });
  fs.rmSync(path.join(root, "one"), { recursive: true });
  fs.symlinkSync(outside, path.join(root, "one"), "dir");
  return { root, outside };
}

/**
 * A directory entry that is neither a regular file, a directory nor a symlink,
 * as FIFOs, sockets and device nodes are. A stand-in, because such entries
 * cannot be committed and do not exist on Windows.
 */
export const SPECIAL_ENTRY = {
  isFile: () => false,
  isDirectory: () => false,
  isSymbolicLink: () => false,
};

/**
 * The given chain with one file replaced by a symlink to a copy of it outside
 * the root: "seal" replaces one/seal.json, "heads" replaces seals.json. Built
 * at run time because a symlink cannot be committed portably.
 */
export function chainWithSymlinkedSealFile(name: string, which: "seal" | "heads"): { root: string; outside: string } {
  const root = scratchChain(name);
  const file = path.join(root, which === "seal" ? "one/seal.json" : "seals.json");
  const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "seals-outside-")), path.basename(file));
  fs.copyFileSync(file, outside);
  fs.rmSync(file);
  fs.symlinkSync(outside, file);
  return { root, outside };
}

/**
 * I/O failures by name: which file operation fails, and for which path in the
 * chain. Simulated through the io seam, because permissions and full disks
 * cannot be produced the same way on every platform.
 */
export const FAILURES = {
  "unreadable-file": { operation: "readFileSync", path: "one/a.txt" },
  "unwritable-seal": { operation: "writeFileSync", path: "two/seal.json" },
  "seal-partly-written": { operation: "writeFileSync", path: "two/seal.json", partial: true },
  "head-partly-written": { operation: "writeFileSync", path: ".tmp", partial: true },
  "lock-partly-written": { operation: "writeFileSync", path: "seals.json.lock", partial: true },
  "head-not-replaced": { operation: "renameSync", path: "seals.json" },
  "unprobeable-seal": { operation: "lstatSync", path: "one/seal.json" },
  "unprobeable-unit-path": { operation: "lstatSync", path: "one" },
} as const;

/**
 * Runs `run` while the named failure is in effect, then restores the real
 * operation. A partial failure writes the start of the data, as a full disk
 * would, before failing.
 */
export function withFailure<T>(name: keyof typeof FAILURES, run: () => T): T {
  const failure: { operation: keyof typeof io; path: string; partial?: boolean } = FAILURES[name];
  const { operation, path: target } = failure;
  const real = io[operation] as (...args: unknown[]) => unknown;
  const failing = (...args: unknown[]) => {
    // renameSync fails on its destination; the others on their first argument.
    const file = String(operation === "renameSync" ? args[1] : args[0])
      .split(path.sep)
      .join("/");
    if (file.endsWith(target.startsWith(".") ? target : `/${target}`)) {
      if (failure.partial) real(args[0], String(args[1]).slice(0, 10), args[2]);
      throw new Error(`simulated ${operation} failure`);
    }
    return real(...args);
  };
  (io as Record<string, unknown>)[operation] = failing;
  try {
    return run();
  } finally {
    (io as Record<string, unknown>)[operation] = real;
  }
}

/**
 * Runs `run`, and the first time it probes `target` (a posix path within the
 * root) runs `interleave` there, as a process working beside it would: for
 * example, a sealing that completes in the middle of a check.
 */
export function during<T>(target: string, interleave: () => void, run: () => T): T {
  const real = io.lstatSync;
  (io as Record<string, unknown>).lstatSync = (...args: unknown[]) => {
    if (String(args[0]).split(path.sep).join("/").endsWith(`/${target}`)) {
      io.lstatSync = real;
      interleave();
    }
    return (real as (...a: unknown[]) => unknown)(...args);
  };
  try {
    return run();
  } finally {
    io.lstatSync = real;
  }
}
