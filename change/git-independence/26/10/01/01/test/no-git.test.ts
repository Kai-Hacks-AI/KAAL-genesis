// KAAL semantics are independent of Git: its core runs, and judges its own
// material, in a directory that is no Git repository, with no `git` executable
// reachable. The candidate is this Case's working directory, and each step uses
// its public entry points, as a user does.
//
// Not claimed: that KAAL's infrastructure never uses Git (CI and Change Sealing
// legitimately do, as carrier and diff), that no other executable is needed, or
// anything of GitHub.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const entry = (file: string) => path.resolve(file);
const GENESIS = entry("scripts/genesis.ts");
const BRAIN_VALIDATE = entry("skills/using-brain/scripts/validate.ts");
const BIRTH = entry("skills/managing-change/scripts/birth.ts");
const CHANGE_VALIDATE = entry("skills/managing-change/scripts/validate.ts");
const SEAL = entry("scripts/seal.ts");
const CHECK_SEALS = entry("scripts/check-seals.ts");

/** The environment with `PATH` leading nowhere, so no `git` can be found. */
function withoutGit(): { env: NodeJS.ProcessEnv; nowhere: string } {
  const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-no-path-"));
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (key.toUpperCase() !== "PATH") env[key] = value;
  env.PATH = nowhere;
  return { env, nowhere };
}

/** A fresh directory that is no Git repository, and an environment in which `git` does not exist. */
function setting() {
  const { env } = withoutGit();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-no-git-"));
  assert.equal(fs.existsSync(path.join(cwd, ".git")), false);
  const missing = spawnSync("git", ["--version"], { env, cwd });
  assert.equal((missing.error as NodeJS.ErrnoException | undefined)?.code, "ENOENT", "git must be unreachable");
  const run = (script: string, ...args: string[]) =>
    spawnSync(process.execPath, [...process.execArgv, script, ...args], { cwd, env, encoding: "utf8" });
  return { cwd, run };
}

type Run = ReturnType<typeof setting>["run"];

function succeeds(result: ReturnType<Run>, what: string) {
  assert.equal(result.status, 0, `${what} failed: ${result.stderr}${result.stdout}`);
}

/** Genesis, then a Change with some material, then sealing: all through entry points. */
function sealedKaal() {
  const { cwd, run } = setting();
  succeeds(run(GENESIS), "genesis");
  succeeds(run(BRAIN_VALIDATE), "BRAIN validation");
  succeeds(run(BIRTH, "task", "26/10/01/01"), "birth");
  const material = path.join(cwd, "change/task/26/10/01/01/result.txt");
  fs.writeFileSync(material, "done\n");
  succeeds(run(CHANGE_VALIDATE), "Change validation");
  succeeds(run(CHECK_SEALS, "."), "seal check before sealing");
  const sealed = run(SEAL);
  succeeds(sealed, "sealing");
  return { cwd, run, material, sealed: sealed.stdout };
}

test(
  "Genesis, BRAIN, Change and sealing compose in a directory that is no Git repository, with no git executable",
  { tests: { requirement: ["git-independence"] } },
  () => {
    const { cwd, run, sealed } = sealedKaal();
    assert.ok(fs.existsSync(path.join(cwd, "AGENTS.md")));
    assert.ok(fs.existsSync(path.join(cwd, "brain/learning/genesis/26/09/25/01/nodes/using-brain.md")));
    assert.match(sealed, /^sealed brain\/learning\/genesis\/26\/09\/25\/01$/m);
    assert.match(sealed, /^sealed change\/task\/26\/10\/01\/01$/m);
    succeeds(run(CHECK_SEALS, "."), "seal check after sealing");
  },
);

test(
  "a sealed Change edited afterwards is refused in a directory that is no Git repository, with no git executable",
  { tests: { requirement: ["git-independence"] } },
  () => {
    const { run, material } = sealedKaal();
    fs.writeFileSync(material, "tampered\n");
    const checked = run(CHECK_SEALS, ".");
    assert.equal(checked.status, 1);
    assert.match(checked.stderr, /change\/task\/26\/10\/01\/01\/result\.txt: changed after sealing/);
  },
);
