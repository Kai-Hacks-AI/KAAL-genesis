import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { birthChange } from "../skills/managing-change/scripts/birth.js";
import { readChanges } from "../skills/managing-change/scripts/changes.js";
import { validate as validateChanges } from "../skills/managing-change/scripts/validate.js";
import { createAgents } from "../skills/using-agents/scripts/create-agents.js";
import { BRAIN_DIR, createBrain } from "../skills/using-brain/scripts/create-brain.js";
import { createNode } from "../skills/using-brain/scripts/create-node.js";
import { validate as validateBrain } from "../skills/using-brain/scripts/validate.js";
import { checkSkills } from "../skills/using-skills/scripts/skills.js";
import { checkBrain, sealBrain } from "./brain-seals.js";
import { checkChanges, sealChanges } from "./change-seals.js";
import { genesis } from "./genesis.js";
import { kaalSealErrors, kaalSealingOutputErrors, kaalSealStateChanges, sealKaal } from "./kaal-seals.js";

const REPO = fileURLToPath(new URL("../", import.meta.url));

/**
 * Runs `fn` in an environment where `git` cannot be found on `PATH`.
 * Ensures git is unavailable and fails if git is invoked.
 */
function withoutGit<T>(fn: () => T): T {
  const origPath = process.env.PATH;
  // Point PATH only to the directory holding node binary, so node/tsx work but git is absent.
  process.env.PATH = path.dirname(process.execPath);
  try {
    // Confirm git is unavailable in this environment.
    assert.throws(
      () => execFileSync("git", ["--version"]),
      (err: unknown) => {
        return err instanceof Error && "code" in err && err.code === "ENOENT";
      },
    );
    return fn();
  } finally {
    process.env.PATH = origPath;
  }
}

/** Creates a temporary directory that is explicitly NOT a git repository. */
function scratchDir(prefix = "kaal-nogit-"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  assert.equal(fs.existsSync(path.join(dir, ".git")), false);
  return dir;
}

test("verifies git is unreachable in the withoutGit wrapper", () => {
  withoutGit(() => {
    assert.throws(() => execFileSync("git", ["status"]));
  });
});

// Requirement: git-independence
test("Genesis runs without git in a non-git directory", () => {
  withoutGit(() => {
    const repo = scratchDir();
    genesis(repo);

    assert.ok(fs.existsSync(path.join(repo, "AGENTS.md")));
    assert.ok(fs.existsSync(path.join(repo, "brain/AGENTS.md")));
    assert.ok(fs.existsSync(path.join(repo, "brain/learning/genesis/26/09/25/01/nodes/using-brain.md")));

    assert.deepEqual(validateBrain(path.join(repo, "brain/learning")), []);
  });
});

// Requirement: git-independence
test("Genesis cleans up when failing in a non-git directory", (t) => {
  withoutGit(() => {
    const repo = scratchDir();
    fs.writeFileSync(path.join(repo, "README.md"), "# Test\n");

    const realWrite = fs.writeFileSync;
    t.mock.method(
      fs,
      "writeFileSync",
      (target: fs.PathOrFileDescriptor, data: string, options?: fs.WriteFileOptions) => {
        if (typeof target !== "number") return realWrite(target, data, options);
        realWrite(target, data.slice(0, 3));
        throw new Error("simulated write failure without git");
      },
    );

    assert.throws(() => genesis(repo), /simulated write failure without git/);
    t.mock.restoreAll();

    assert.ok(fs.existsSync(path.join(repo, "README.md")));
    assert.equal(fs.existsSync(path.join(repo, "brain")), false);
    assert.equal(fs.existsSync(path.join(repo, "AGENTS.md")), false);
  });
});

// Requirement: git-independence
test("BRAIN node creation, edge relationships, and validation work without git", () => {
  withoutGit(() => {
    const dir = scratchDir();
    const root = createBrain(path.join(dir, BRAIN_DIR));

    createNode({
      root,
      lineage: "core",
      learning: "26/10/01/01",
      slug: "base-concept",
      name: "base-concept",
      meaning: "# Base Concept\n\nInitial concept.\n",
    });

    createNode({
      root,
      lineage: "core",
      learning: "26/10/01/01",
      slug: "relation-concept",
      name: "relation-concept",
      meaning: "# Relation Concept\n\nRelation concept.\n",
    });

    createNode({
      root,
      lineage: "core",
      learning: "26/10/01/02",
      slug: "derived-concept",
      name: "derived-concept",
      meaning: "# Derived Concept\n\nDerived concept.\n",
      edges: [
        {
          relation: "core/26/10/01/01/nodes/relation-concept.md",
          to: "core/26/10/01/01/nodes/base-concept.md",
        },
      ],
    });

    assert.deepEqual(validateBrain(root), []);
  });
});

// Requirement: git-independence
test("Managing Change birth, listing, and validation work without git", () => {
  withoutGit(() => {
    const repo = scratchDir();
    const changeRoot = path.join(repo, "change");

    const change1 = birthChange({ root: changeRoot, lineage: "feature", occurrence: "26/10/01/01" });
    fs.writeFileSync(path.join(change1, "spec.md"), "# Spec\n");

    const change2 = birthChange({ root: changeRoot, lineage: "feature", occurrence: "26/10/01/02" });
    fs.writeFileSync(path.join(change2, "impl.txt"), "code\n");

    const { changes, errors } = readChanges(changeRoot);
    assert.deepEqual(errors, []);
    assert.equal(changes.length, 2);
    assert.equal(changes[0].lineage, "feature");
    assert.equal(changes[0].occurrence, "26/10/01/01");
    assert.equal(changes[1].occurrence, "26/10/01/02");

    assert.deepEqual(validateChanges(changeRoot), []);
  });
});

// Requirement: git-independence
test("Sealing and seal verification (KAAL seals, BRAIN seals, Change seals) work without git", () => {
  withoutGit(() => {
    const repo = scratchDir();
    genesis(repo);

    const changeDir = birthChange({ root: path.join(repo, "change"), lineage: "task", occurrence: "26/10/01/01" });
    fs.writeFileSync(path.join(changeDir, "result.txt"), "done\n");

    assert.deepEqual(kaalSealErrors(repo), []);

    const sealedUnits = sealKaal(repo);
    assert.ok(sealedUnits.includes("brain/learning/genesis/26/09/25/01"));
    assert.ok(sealedUnits.includes("change/task/26/10/01/01"));

    assert.deepEqual(kaalSealErrors(repo), []);
    assert.deepEqual(checkBrain(path.join(repo, "brain/learning")), []);
    assert.deepEqual(checkChanges(repo), []);

    // Tampering detection without git
    fs.writeFileSync(path.join(changeDir, "result.txt"), "tampered\n");
    assert.deepEqual(checkChanges(repo), ["change/task/26/10/01/01/result.txt: changed after sealing"]);
  });
});

// Requirement: git-independence
test("Using Skills checks skills without git", () => {
  withoutGit(() => {
    const skillsDir = path.join(REPO, "skills");
    const errors = checkSkills(skillsDir);
    assert.deepEqual(errors, []);
  });
});

// Requirement: git-independence
test("Using Agents creates AGENTS.md without git", () => {
  withoutGit(() => {
    const dir = scratchDir();
    const created = createAgents(dir, "# Scoped Agent Guidance\n");
    assert.equal(created, path.join(dir, "AGENTS.md"));
    assert.equal(fs.readFileSync(created, "utf8"), "# Scoped Agent Guidance\n");
  });
});

// Requirement: git-independence
test("Seal state and sealing output diff validation work purely on diff strings without git", () => {
  withoutGit(() => {
    assert.deepEqual(kaalSealStateChanges("M\tbrain/learning/genesis/26/09/25/01/seal.json"), [
      "brain/learning/genesis/26/09/25/01/seal.json: seal state may only be written by sealing on main (M)",
    ]);

    assert.deepEqual(kaalSealStateChanges("A\tchange/task/26/10/01/01/file.txt"), []);

    assert.deepEqual(kaalSealingOutputErrors("A\tbrain/learning/genesis/26/09/25/01/seal.json"), []);

    assert.deepEqual(kaalSealingOutputErrors("A\tbrain/learning/genesis/26/09/25/01/nodes/a.md"), [
      "brain/learning/genesis/26/09/25/01/nodes/a.md: sealing never commits this (not seal state)",
    ]);
  });
});

// Requirement: git-independence
test("Full end-to-end KAAL lifecycle works completely without git in a non-git directory", () => {
  withoutGit(() => {
    const repo = scratchDir();

    // 1. Genesis
    genesis(repo);

    // 2. Add BRAIN learnings
    const brainRoot = path.join(repo, "brain/learning");
    createNode({
      root: brainRoot,
      lineage: "architecture",
      learning: "26/10/01/01",
      slug: "overview",
      name: "overview",
      meaning: "# Architecture Overview\n",
    });

    // 3. Add Changes
    const changeDir = birthChange({
      root: path.join(repo, "change"),
      lineage: "architecture",
      occurrence: "26/10/01/01",
    });
    fs.writeFileSync(path.join(changeDir, "arch.md"), "# Architecture Change\n");

    // 4. Validate before sealing
    assert.deepEqual(validateBrain(brainRoot), []);
    assert.deepEqual(validateChanges(path.join(repo, "change")), []);
    assert.deepEqual(kaalSealErrors(repo), []);

    // 5. Seal
    const sealed = sealKaal(repo);
    assert.ok(sealed.length >= 2);

    // 6. Check seals after sealing
    assert.deepEqual(kaalSealErrors(repo), []);
  });
});
