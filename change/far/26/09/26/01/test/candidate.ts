import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// What the Genesis Test Cases share. A Case is run with the candidate, the
// Genesis state, as its working directory and reaches it only through that
// directory: `candidate("skills/using-brain/scripts/validate.ts")` is that file
// of the state being judged. Whatever a Case writes it writes in a scratch
// directory, never in the candidate.

/** A path inside the candidate. */
export const candidate = (...parts: string[]): string => path.resolve(process.cwd(), ...parts);

const made: string[] = [];
process.on("exit", () => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

/** A fresh scratch directory, removed when the Case's process ends. */
export const scratch = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "far-genesis-"));
  made.push(dir);
  return dir;
};

export type Result = { status: number | null; stdout: string; stderr: string };

/** Runs one of the candidate's scripts, as `tsx <script> <args>`, with `cwd` as its working directory: the way its `npm run` scripts run it. */
export function script(file: string, args: string[], cwd: string): Result {
  const tsx = candidate("node_modules/tsx/dist/cli.mjs");
  const run = spawnSync(process.execPath, [tsx, candidate(file), ...args], { cwd, encoding: "utf8" });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** Runs a command, failing if it does. */
export function run(command: string, args: string[], cwd: string): string {
  const out = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (out.status !== 0) throw new Error(`${command} ${args.join(" ")}: ${out.stderr || out.stdout}`);
  return out.stdout;
}

/** A module of the candidate. */
export const load = <T = Record<string, unknown>>(file: string): Promise<T> => import(pathToFileURL(candidate(file)).href);

/** Every file beneath `dir` as posix paths relative to it, sorted. */
export const files = (dir: string): string[] =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .sort();

/** The skills of the candidate, by name. */
export const skills = (): string[] =>
  fs
    .readdirSync(candidate("skills"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

/** Birth one node, through the candidate's create-node, in the BRAIN of `dir`. */
export function learn(dir: string, lineage: string, learning: string, slug: string): void {
  const node = script(
    "skills/using-brain/scripts/create-node.ts",
    [lineage, learning, slug, slug, `What ${slug} means.`],
    dir,
  );
  if (node.status !== 0) throw new Error(node.stderr);
}

/** Birth a BRAIN with one node per learning through the candidate's own scripts, in `dir`. */
export function brain(dir: string, nodes: [lineage: string, learning: string, slug: string][]): void {
  const born = script("skills/using-brain/scripts/create-brain.ts", [], dir);
  if (born.status !== 0) throw new Error(born.stderr);
  for (const [lineage, learning, slug] of nodes) learn(dir, lineage, learning, slug);
}

/** `git` in `dir`, quietly, as a fixed author. */
export const git = (dir: string, ...args: string[]): string =>
  run("git", ["-c", "user.name=far", "-c", "user.email=far@example.invalid", "-c", "commit.gpgsign=false", ...args], dir);

/**
 * A repository whose `main` holds a BRAIN of two learnings, sealed by the
 * candidate's own sealing and committed: the target branch of a change.
 */
export function sealedMain(): string {
  const dir = scratch();
  git(dir, "init", "-q", "-b", "main");
  brain(dir, [
    ["genesis", "26/09/25/01", "first"],
    ["genesis", "26/09/26/01", "second"],
  ]);
  const sealed = script("scripts/seal.ts", [], dir);
  if (sealed.status !== 0) throw new Error(sealed.stderr);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "main");
  return dir;
}

/** Starts the branch `change` from `main`'s head. */
export const change = (dir: string): void => void git(dir, "checkout", "-q", "-b", "change");

/** Commits whatever the working tree holds on the branch. */
export const commit = (dir: string): void => {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "change");
};

/**
 * A directory holding the candidate's skill `name` and nothing else of the
 * candidate: no other skill, no BRAIN, no scripts, no AGENTS.md. Only what
 * running TypeScript as a module needs is added: the installed packages, and a
 * package.json that says nothing but that files are modules.
 */
export function isolated(name: string): string {
  const dir = scratch();
  fs.mkdirSync(path.join(dir, "skills"));
  fs.cpSync(candidate("skills", name), path.join(dir, "skills", name), { recursive: true, verbatimSymlinks: true });
  fs.symlinkSync(candidate("node_modules"), path.join(dir, "node_modules"), "dir");
  fs.writeFileSync(path.join(dir, "package.json"), '{ "type": "module" }\n');
  return dir;
}

/** Runs the tests the candidate's skill `name` carries, in `dir`, as Node's test runner under tsx. */
export function skillTests(name: string, dir: string): Result {
  const tests = fs
    .readdirSync(path.join(dir, "skills", name, "scripts"))
    .filter((f) => /\.test\.ts$/.test(f))
    .map((f) => `skills/${name}/scripts/${f}`);
  // A test runner started inside a Case would otherwise believe it is that Case's own subtest and report nothing.
  const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
  const out = spawnSync(process.execPath, [candidate("node_modules/tsx/dist/cli.mjs"), "--test", ...tests], {
    cwd: dir,
    encoding: "utf8",
    env,
  });
  return { status: out.status, stdout: out.stdout, stderr: out.stderr };
}
