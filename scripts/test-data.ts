// Loads named test data from ../test-data so test cases hold no data themselves.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "../skills/using-brain/scripts/brain.js";
import { type Change, sealBrain, stateChanges } from "./brain-seals.js";
import { io } from "../skills/using-seals/scripts/seals.js";
import { genesis } from "./genesis.js";

const DATA = fileURLToPath(new URL("../test-data/", import.meta.url));

/**
 * KAAL's own state: the subject of every case that makes a claim about KAAL
 * itself, such as that its links hold or its BRAIN is valid. It is the state
 * these cases are kept in, found from here, never from the directory they are
 * run from: that is part of a run's environment, not of what a case is about.
 */
export function kaal(): string {
  return fileURLToPath(new URL("../", import.meta.url));
}

/**
 * A scratch directory to run KAAL's cases from that is not KAAL: it holds an
 * invalid BRAIN at KAAL's BRAIN root, from test-data/brains/invalid-learning,
 * so a case that took its subject from where it runs would judge this BRAIN.
 */
export function elsewhere(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-elsewhere-"));
  fs.cpSync(brainData("invalid-learning"), path.join(dir, ROOT), { recursive: true });
  return dir;
}

/**
 * A scratch repository where something Genesis would create is already there,
 * and what that is: `born`, a KAAL Genesis has already born; `agents`, an Agent
 * entry point, and `brain`, a BRAIN directory, each from test-data/genesis/occupied.
 */
export function occupied(name: "born" | "agents" | "brain"): { repo: string; there: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-genesis-"));
  if (name === "born") genesis(repo);
  else fs.cpSync(path.join(DATA, "genesis", "occupied", name), repo, { recursive: true });
  return { repo, there: name === "agents" ? "AGENTS.md" : "brain" };
}

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

/** Changes between two states, from test-data/diffs: one `<status>\t<path>` per line, A, M or D. */
export function diffData(name: string): Change[] {
  return fs
    .readFileSync(path.join(DATA, "diffs", `${name}.txt`), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [status, file = ""] = line.split("\t");
      return { status: status as Change["status"], file };
    });
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
 * What sealing changes, by path relative to the repository, for a BRAIN at
 * the default root: `from` sealed with the real sealBrain, compared with
 * `from` itself as two states. `to` names the result it must match.
 */
export function sealingDiff(from: string, to: string): Change[] {
  const root = scratchBrain(from);
  sealBrain(root);
  if (JSON.stringify(tree(root)) !== JSON.stringify(tree(brainData(to))))
    throw new Error(`sealing ${from} did not produce ${to}`);
  return stateChanges(brainData(from), root).map((c) => ({ ...c, file: `${ROOT}/${c.file}` }));
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
