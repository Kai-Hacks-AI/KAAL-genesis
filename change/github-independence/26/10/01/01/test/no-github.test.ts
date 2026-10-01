// KAAL semantics are independent of GitHub: what KAAL's core decides, and the
// seals it writes, do not vary with any fact GitHub supplies. The same core
// work is done in two environments, one carrying no GitHub fact at all and one
// carrying a hostile set of them (a pull request, a run, an actor, a token),
// and what it decides must be identical. The candidate is this Case's working
// directory, and each step uses its public entry points, as a user does.
//
// Not claimed: that KAAL's infrastructure never uses GitHub (admission,
// workflows and the sealing App legitimately do, as host), that GitHub is
// unreachable, or anything of Git.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const GENESIS = path.resolve("scripts/genesis.ts");
const BIRTH = path.resolve("skills/managing-change/scripts/birth.ts");
const CHANGE_VALIDATE = path.resolve("skills/managing-change/scripts/validate.ts");
const SEAL = path.resolve("scripts/seal.ts");
const CHECK_SEALS = path.resolve("scripts/check-seals.ts");

const GITHUB_FACT = /^(GITHUB_|GH_|RUNNER_|ACTIONS_|CI$)/;

/** The environment with no GitHub fact in it. */
function plain(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (!GITHUB_FACT.test(key.toUpperCase())) env[key] = value;
  return env;
}

/** The same environment carrying GitHub facts that name a pull request nobody made. */
function hostile(): NodeJS.ProcessEnv {
  return {
    ...plain(),
    CI: "true",
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "nobody/nothing",
    GITHUB_REPOSITORY_OWNER: "nobody",
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_EVENT_PATH: path.join(os.tmpdir(), "kaal-no-such-event.json"),
    GITHUB_REF: "refs/pull/9999/merge",
    GITHUB_REF_NAME: "9999/merge",
    GITHUB_HEAD_REF: "feature/not-kaal",
    GITHUB_BASE_REF: "elsewhere",
    GITHUB_SHA: "0".repeat(40),
    GITHUB_RUN_ID: "424242424242",
    GITHUB_RUN_NUMBER: "7",
    GITHUB_ACTOR: "someone-else",
    GITHUB_TOKEN: "ghs_not_a_token",
    GH_TOKEN: "ghs_not_a_token",
    RUNNER_OS: "Elsewhere",
  };
}

type Outcome = { seals: Record<string, string>; stdout: string[] };

/** Genesis, a Change with material, then sealing and checking, all through entry points, in `env`. */
function coreWork(env: NodeJS.ProcessEnv): Outcome {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-no-github-"));
  const stdout: string[] = [];
  const run = (script: string, ...args: string[]) => {
    const result = spawnSync(process.execPath, [...process.execArgv, script, ...args], { cwd, env, encoding: "utf8" });
    assert.equal(result.status, 0, `${path.basename(script)} failed: ${result.stderr}${result.stdout}`);
    stdout.push(result.stdout);
  };
  run(GENESIS);
  run(BIRTH, "task", "26/10/01/01");
  fs.writeFileSync(path.join(cwd, "change/task/26/10/01/01/result.txt"), "done\n");
  run(CHANGE_VALIDATE);
  run(CHECK_SEALS, ".");
  run(SEAL);
  run(CHECK_SEALS, ".");

  const seals: Record<string, string> = {};
  for (const entry of fs.readdirSync(cwd, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || (entry.name !== "seal.json" && entry.name !== "seals.json")) continue;
    const file = path.relative(cwd, path.join(entry.parentPath, entry.name)).split(path.sep).join("/");
    seals[file] = fs.readFileSync(path.join(cwd, file), "utf8").replace(/\r\n/g, "\n");
  }
  return { seals, stdout };
}

test(
  "what KAAL's core decides and seals is the same with no GitHub fact as with a hostile set of them",
  { tests: { requirement: ["github-independence"] } },
  () => {
    const without = coreWork(plain());
    const hostileTo = coreWork(hostile());
    assert.ok(Object.keys(without.seals).length >= 3, "sealing must have written seal state to compare");
    assert.deepEqual(hostileTo.seals, without.seals);
    assert.deepEqual(hostileTo.stdout, without.stdout);
  },
);
