// Loads named test data from ../test-data so test cases hold no data themselves.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { CreateNode } from "./create-node.js";

const DATA = fileURLToPath(new URL("../test-data/", import.meta.url));

/** Path to a single node file in test-data/nodes. */
export function nodeData(name: string): string {
  return path.join(DATA, "nodes", `${name}.md`);
}

/** Path to a read-only BRAIN in test-data/brains. */
export function brainData(name: string): string {
  return path.join(DATA, "brains", name);
}

/** A writable copy of a BRAIN from test-data/brains, or an empty BRAIN when no name is given. */
export function scratchBrain(name?: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "brain-"));
  if (name) fs.cpSync(brainData(name), root, { recursive: true });
  return root;
}

/** A createNode input from test-data/births.yaml, placed in `root`. */
export function birth(name: string, root: string): CreateNode {
  const births = YAML.parse(fs.readFileSync(path.join(DATA, "births.yaml"), "utf8")) as Record<string, CreateNode>;
  if (!births[name]) throw new Error(`no birth named ${name}`);
  return { ...births[name], root };
}

/** Contents of an expected output file in test-data/expected. */
export function expected(name: string): string {
  return fs.readFileSync(path.join(DATA, "expected", `${name}.md`), "utf8");
}

/**
 * An empty BRAIN whose `genesis` lineage is a symlink to a directory outside it.
 * "resolving" points at an existing directory; "dangling" at one that does not
 * exist yet. Built at run time because a symlink leaving the repo cannot be
 * committed as test data.
 */
export function symlinkedBrain(kind: "resolving" | "dangling"): { root: string; outside: string } {
  const root = scratchBrain();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "brain-outside-"));
  const target = kind === "resolving" ? outside : path.join(outside, "not-yet");
  fs.symlinkSync(target, path.join(root, "genesis"), "dir");
  return { root, outside };
}

/**
 * Every way createBrain can fail after it has created the BRAIN's directory, by
 * name: the fs operation that fails, the path it fails on, and whether the
 * write starts before failing, as a full disk would.
 */
export const CREATE_FAILURES = {
  "agents-unwritten": { operation: "writeFileSync", path: "AGENTS.md", partial: false },
  "agents-partly-written": { operation: "writeFileSync", path: "AGENTS.md", partial: true },
  "learning-not-created": { operation: "mkdirSync", path: "learning", partial: false },
} as const;
