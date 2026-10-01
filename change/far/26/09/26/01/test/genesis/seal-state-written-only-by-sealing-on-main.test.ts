import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";
import { candidate, change, commit, git, learn, script, sealedMain } from "../candidate.js";

// Genesis states this about `main`, so it is demonstrated of `main`: the guard
// judges a branch against `main`, and the sealing workflow runs on pushes to it.
const guard = (dir: string) => script("scripts/seal-guard.ts", ["main", dir], dir);

test(
  "a change that writes seal state is refused",
  { tests: { requirement: ["seal-state-written-only-by-sealing-on-main"] } },
  () => {
    const writes: Record<string, (dir: string) => void> = {
      "it edits the chain heads": (dir) => fs.appendFileSync(path.join(dir, "brain/learning/seals.json"), " "),
      "it edits a seal": (dir) =>
        fs.appendFileSync(path.join(dir, "brain/learning/genesis/26/09/25/01/seal.json"), " "),
      "it removes a seal": (dir) => fs.rmSync(path.join(dir, "brain/learning/genesis/26/09/26/01/seal.json")),
      "it writes the seal of a learning it adds": (dir) => {
        learn(dir, "genesis", "26/09/27/01", "third");
        fs.writeFileSync(path.join(dir, "brain/learning/genesis/26/09/27/01/seal.json"), "{}\n");
      },
    };
    for (const [what, write] of Object.entries(writes)) {
      const dir = sealedMain();
      change(dir);
      write(dir);
      commit(dir);
      const judged = guard(dir);
      assert.notEqual(judged.status, 0, `${what}, and the change was not refused`);
      assert.match(judged.stderr, /seal state may only be written by sealing on main/);
    }
  },
);

test(
  "a change that adds a learning without sealing it writes no seal state",
  { tests: { requirement: ["seal-state-written-only-by-sealing-on-main"] } },
  () => {
    const dir = sealedMain();
    change(dir);
    const born = script(
      "skills/using-brain/scripts/create-node.ts",
      ["genesis", "26/09/27/01", "third", "third", "Learned in a change."],
      dir,
    );
    assert.equal(born.status, 0, born.stderr);
    commit(dir);
    const judged = guard(dir);
    assert.equal(judged.status, 0, judged.stderr);
  },
);

test(
  "sealing commits only what sealing produces",
  { tests: { requirement: ["seal-state-written-only-by-sealing-on-main"] } },
  () => {
    const staged = (dir: string) => script("scripts/sealing-check.ts", [dir], dir);
    const dir = sealedMain();
    const born = script(
      "skills/using-brain/scripts/create-node.ts",
      ["genesis", "26/09/27/01", "third", "third", "Learned."],
      dir,
    );
    assert.equal(born.status, 0, born.stderr);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "learning");
    const sealed = script("scripts/seal.ts", [], dir);
    assert.equal(sealed.status, 0, sealed.stderr);
    git(dir, "add", "-A");
    assert.equal(staged(dir).status, 0, "what sealing wrote is accepted");

    // Sealing never changes an existing seal, and never commits anything else.
    git(dir, "reset", "-q");
    fs.appendFileSync(path.join(dir, "brain/learning/genesis/26/09/25/01/seal.json"), " ");
    git(dir, "add", "-A");
    assert.notEqual(staged(dir).status, 0, "an edit to an existing seal is refused");
    git(dir, "reset", "-q", "--hard");
    fs.writeFileSync(path.join(dir, "elsewhere.txt"), "not seal state\n");
    git(dir, "add", "-A");
    assert.notEqual(staged(dir).status, 0, "something that is not seal state is refused");
  },
);

test(
  "the sealing workflow writes seal state on pushes to main, and on no other trigger",
  { tests: { requirement: ["seal-state-written-only-by-sealing-on-main"] } },
  () => {
    const sealing = YAML.parse(fs.readFileSync(candidate(".github/workflows/sealing.yml"), "utf8"));
    assert.deepEqual(Object.keys(sealing.on), ["push"]);
    assert.deepEqual(sealing.on.push.branches, ["main"]);
    const steps = Object.values<{ steps: { run?: string }[] }>(sealing.jobs).flatMap((job) => job.steps);
    assert.ok(steps.some((step) => step.run?.includes("npm run -s seal")), "it runs sealing");

    // No other workflow seals.
    for (const file of fs.readdirSync(candidate(".github/workflows")).filter((f) => f !== "sealing.yml")) {
      const text = fs.readFileSync(candidate(".github/workflows", file), "utf8");
      assert.doesNotMatch(text, /npm run (-s )?seal\b(?!s)/, `${file} must not seal`);
    }
  },
);
