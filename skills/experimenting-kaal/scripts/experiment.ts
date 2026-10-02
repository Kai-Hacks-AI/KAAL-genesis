import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Environment names that would tell the child where the apparatus is: the invoking npm and shell's own record of it. */
const APPARATUS_ENV = /^(npm_.*|INIT_CWD|OLDPWD|PWD)$/i;

/** Files an agent harness reads from the directories above its working directory. */
const ANCESTOR_MARKERS = ["AGENTS.md", "CLAUDE.md", ".git"];

const sha256 = (data: crypto.BinaryLike) => crypto.createHash("sha256").update(data).digest("hex");

export type Manifest = Record<string, string>;

export type Experiment = {
  /** A directory holding the KAAL under observation. It is only read. */
  host: string;
  /** The question or instruction, as the exact bytes the child is given. */
  instruction: string;
  /** An empty or missing directory outside the host where the Run is retained. */
  evidence: string;
  /** The child agent: a command and its arguments, started with the workspace as its working directory. */
  agent: string[];
  /** What the child may use, opaque to this skill: the agent command alone knows how to grant them. */
  capabilities?: string[];
  timeoutSeconds?: number;
  /** Where the workspace is made; the system's temporary directory by default. */
  scratch?: string;
};

/** What a Run retains in `run.json`. */
export type Run = {
  startedAt: string;
  finishedAt: string;
  conditions: { node: string; platform: string; arch: string };
  host: { path: string; digest: string; manifest: Manifest; unchangedAfterRun: boolean };
  instruction: { sha256: string; bytes: number };
  capabilities: string[];
  agent: string[];
  workspace: { path: string; ancestorsWithInstructions: string[] };
  outcome: { exitCode: number | null; signal: string | null; timedOut: boolean; spawnError: string | null };
  changes: { added: string[]; modified: string[]; removed: string[] };
};

/** Every file and symbolic link beneath `root`, by posix path, with the digest of its bytes or the text of its link. */
export function manifest(root: string): Manifest {
  const entries: Manifest = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      const key = path.relative(root, file).split(path.sep).join("/");
      if (entry.isSymbolicLink()) entries[key] = `link:${fs.readlinkSync(file)}`;
      else if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) entries[key] = sha256(fs.readFileSync(file));
    }
  };
  walk(root);
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** One digest for a host's whole tree, so evidence can say which host it observed. */
export const digest = (entries: Manifest) => sha256(JSON.stringify(entries));

const inside = (parent: string, child: string) => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

/** Why a Run cannot be performed, or nothing. */
function refusal(input: Experiment): string | undefined {
  if (!fs.existsSync(input.host) || !fs.statSync(input.host).isDirectory())
    return `${input.host}: host is not a directory`;
  if (!input.instruction.trim()) return "instruction is empty";
  if (input.agent.length === 0 || !input.agent[0]) return "no agent command";
  if ((input.capabilities ?? []).some((c) => !c.trim())) return "a capability is empty";
  if (input.timeoutSeconds !== undefined && !(input.timeoutSeconds > 0))
    return "timeout must be a positive number of seconds";
  const host = fs.realpathSync(input.host);
  const evidence = path.resolve(input.evidence);
  if (inside(host, evidence) || inside(evidence, host)) return "evidence and host must not contain one another";
  if (fs.existsSync(evidence) && (!fs.statSync(evidence).isDirectory() || fs.readdirSync(evidence).length > 0))
    return `${input.evidence}: evidence is not an empty directory`;
  for (const [file, entry] of Object.entries(manifest(host))) {
    if (!entry.startsWith("link:")) continue;
    const from = path.join(host, ...file.split("/"));
    if (!inside(host, path.resolve(path.dirname(from), entry.slice(5)))) return `${file}: link leaves the host`;
  }
  return undefined;
}

/** The directories above `dir`, nearest first, that hold something an agent harness would read from there. */
function ancestorsWithInstructions(dir: string): string[] {
  const found: string[] = [];
  for (let up = path.dirname(dir); ; up = path.dirname(up)) {
    for (const marker of ANCESTOR_MARKERS) if (fs.existsSync(path.join(up, marker))) found.push(path.join(up, marker));
    if (up === path.dirname(up)) return found;
  }
}

/**
 * Runs a fresh child agent against a copy of the host and retains what happened.
 *
 * The child's working directory is a copy of the host made under a new scratch
 * directory, so the surrounding checkout is not above it and the host itself is
 * never written. The copy is the Run's workspace; it is removed afterwards and
 * what the child changed in it is retained. The child's own result, whatever it
 * is, is retained and never judged: this refuses only when it cannot perform or
 * retain a Run.
 */
export function runExperiment(input: Experiment): Run {
  const problem = refusal(input);
  if (problem) throw new Error(problem);
  const host = fs.realpathSync(input.host);
  const capabilities = input.capabilities ?? [];
  const before = manifest(host);

  const scratch = fs.mkdtempSync(path.join(input.scratch ?? os.tmpdir(), "experimenting-kaal-"));
  const workspace = path.join(scratch, "host");
  const startedAt = new Date();
  try {
    fs.cpSync(host, workspace, { recursive: true, verbatimSymlinks: true });
    const [command, ...args] = input.agent;
    const resolved = /[\\/]/.test(command) ? path.resolve(command) : command;
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !APPARATUS_ENV.test(name)));
    env.PWD = workspace;
    env.KAAL_EXPERIMENT_CAPABILITIES = JSON.stringify(capabilities);
    const child = spawnSync(resolved, args, {
      cwd: workspace,
      env,
      input: input.instruction,
      timeout: input.timeoutSeconds === undefined ? undefined : input.timeoutSeconds * 1000,
      killSignal: "SIGKILL",
      maxBuffer: 1 << 30,
    });
    const finishedAt = new Date();

    const after = manifest(workspace);
    const changes = {
      added: Object.keys(after).filter((f) => !(f in before)),
      modified: Object.keys(after).filter((f) => f in before && after[f] !== before[f]),
      removed: Object.keys(before).filter((f) => !(f in after)),
    };
    const hostAfter = manifest(host);
    const run: Run = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      conditions: { node: process.version, platform: process.platform, arch: process.arch },
      host: {
        path: host,
        digest: digest(before),
        manifest: before,
        unchangedAfterRun: digest(hostAfter) === digest(before),
      },
      instruction: { sha256: sha256(input.instruction), bytes: Buffer.byteLength(input.instruction) },
      capabilities,
      agent: input.agent,
      workspace: { path: workspace, ancestorsWithInstructions: ancestorsWithInstructions(workspace) },
      outcome: {
        exitCode: child.status,
        signal: child.signal,
        timedOut: (child.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT",
        spawnError:
          child.error && (child.error as NodeJS.ErrnoException).code !== "ETIMEDOUT" ? child.error.message : null,
      },
      changes,
    };

    const evidence = path.resolve(input.evidence);
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, "instruction"), input.instruction);
    fs.writeFileSync(path.join(evidence, "stdout"), child.stdout ?? "");
    fs.writeFileSync(path.join(evidence, "stderr"), child.stderr ?? "");
    for (const file of [...changes.added, ...changes.modified]) {
      const target = path.join(evidence, "changes", ...file.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(path.join(workspace, ...file.split("/")), target, { verbatimSymlinks: true });
    }
    fs.writeFileSync(path.join(evidence, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
    return run;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
