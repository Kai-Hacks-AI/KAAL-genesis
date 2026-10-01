// KAAL supports execution on Linux and on Windows. This Test Case is generic
// HOW: it names no platform, branches on none and skips on none, so it is one
// Test Case whichever environment executes it. Where it executes is what a Run
// observes of its conditions, never something this Case asserts or selects;
// that it counts for linux-support is a Run under Linux that holds, and for
// windows-support a Run under Windows that holds. The candidate is this Case's
// working directory, and each step uses its public entry points, as a user does.
//
// Not claimed: that this has run anywhere but where a Run shows, that it is the
// only HOW either Requirement could have, or that anything specific to one
// environment (a signal, a named pipe, a symlink) is shown by it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const GENESIS = path.resolve("scripts/genesis.ts");
const BRAIN_VALIDATE = path.resolve("skills/using-brain/scripts/validate.ts");
const BIRTH = path.resolve("skills/managing-change/scripts/birth.ts");
const CHANGE_VALIDATE = path.resolve("skills/managing-change/scripts/validate.ts");
const SEAL = path.resolve("scripts/seal.ts");
const CHECK_SEALS = path.resolve("scripts/check-seals.ts");

test(
  "KAAL's core composes, seals and keeps its seals in the environment that executes it",
  { tests: { requirement: ["linux-support", "windows-support"] } },
  () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-core-"));
    const run = (script: string, ...args: string[]) =>
      spawnSync(process.execPath, [...process.execArgv, script, ...args], { cwd, encoding: "utf8" });
    const succeeds = (script: string, ...args: string[]) => {
      const result = run(script, ...args);
      assert.equal(result.status, 0, `${path.basename(script)} failed: ${result.stderr}${result.stdout}`);
      return result;
    };

    succeeds(GENESIS);
    assert.ok(fs.existsSync(path.join(cwd, "AGENTS.md")));
    succeeds(BRAIN_VALIDATE);

    succeeds(BIRTH, "task", "26/10/01/01");
    const material = path.join(cwd, "change/task/26/10/01/01/result.txt");
    fs.writeFileSync(material, "done\n");
    succeeds(CHANGE_VALIDATE);
    succeeds(CHECK_SEALS, ".");

    const sealed = succeeds(SEAL).stdout;
    assert.match(sealed, /^sealed brain\/learning\/genesis\/26\/09\/25\/01\r?$/m);
    assert.match(sealed, /^sealed change\/task\/26\/10\/01\/01\r?$/m);
    succeeds(CHECK_SEALS, ".");

    fs.writeFileSync(material, "tampered\n");
    const checked = run(CHECK_SEALS, ".");
    assert.equal(checked.status, 1);
    assert.match(checked.stderr, /change\/task\/26\/10\/01\/01\/result\.txt: changed after sealing/);
  },
);
