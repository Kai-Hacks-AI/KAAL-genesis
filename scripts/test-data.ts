// Loads named test data from ../test-data so test cases hold no data themselves.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "../skills/using-brain/scripts/brain.js";
import { sealBrain } from "./brain-seals.js";
import { io } from "../skills/using-seals/scripts/seals.js";

const DATA = fileURLToPath(new URL("../test-data/", import.meta.url));

/** Path to a read-only BRAIN in test-data/brains. */
export function brainData(name: string): string {
  return path.join(DATA, "brains", name);
}

/** A writable copy of a BRAIN from test-data/brains. */
export function scratchBrain(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-seals-"));
  fs.cpSync(brainData(name), root, { recursive: true });
  return root;
}

/** A `git diff --name-status --no-renames` output from test-data/diffs. */
export function diffData(name: string): string {
  return fs.readFileSync(path.join(DATA, "diffs", `${name}.txt`), "utf8");
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

/** Every entry under a root by posix path, with its kind, so links and special files are seen too. */
export function entries(root: string): string[] {
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .map((e) => {
      const kind = e.isFile() ? "file" : e.isDirectory() ? "directory" : e.isSymbolicLink() ? "symlink" : "other";
      return `${path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join("/")} (${kind})`;
    })
    .sort();
}

/**
 * Runs `run` while writing the seal of `unit` (a learning, as a posix path
 * within the BRAIN) fails, as a full disk would. Simulated through the
 * using-seals io seam, because such failures cannot be produced the same way
 * on every platform.
 */
export function withSealWriteFailure<T>(unit: string, run: () => T): T {
  const real = io.writeFileSync;
  io.writeFileSync = ((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
    if (String(file).split(path.sep).join("/").endsWith(`/${unit}/seal.json`))
      throw new Error("simulated write failure");
    return (real as (...args: unknown[]) => void)(file, ...rest);
  }) as typeof io.writeFileSync;
  try {
    return run();
  } finally {
    io.writeFileSync = real;
  }
}

/**
 * What sealing changes, as `git diff --name-status` for a BRAIN at the default
 * root: `from` sealed with the real sealBrain, compared with `from` itself.
 * `to` names the committed result it must match.
 */
export function sealingDiff(from: string, to: string): string {
  const root = scratchBrain(from);
  sealBrain(root);
  const before = tree(brainData(from));
  const after = tree(root);
  if (JSON.stringify(after) !== JSON.stringify(tree(brainData(to))))
    throw new Error(`sealing ${from} did not produce ${to}`);
  return Object.keys(after)
    .filter((file) => before[file] !== after[file])
    .map((file) => `${file in before ? "M" : "A"}\t${ROOT}/${file}`)
    .join("\n");
}

/** The trusted regression in test-data/regression: a small repository with a plan, BRAIN, code and cases. */
export function regressionTrusted(): string {
  return path.join(DATA, "regression", "trusted");
}

/**
 * A candidate from test-data/regression/candidates: the trusted repository
 * with the candidate's own files laid over it, in a scratch directory.
 */
export function regressionCandidate(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-candidate-"));
  fs.cpSync(regressionTrusted(), root, { recursive: true });
  fs.cpSync(path.join(DATA, "regression", "candidates", name), root, { recursive: true });
  return root;
}
