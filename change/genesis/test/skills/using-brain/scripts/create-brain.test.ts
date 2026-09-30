import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { relativeIdentity } from "./brain.js";
import { BRAIN_AGENTS_MD, createBrain } from "./create-brain.js";
import { createNode } from "./create-node.js";
import { birth, CREATE_FAILURES, expected } from "./test-data.js";
import { validate } from "./validate.js";

const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), "brain-module-"));

test("creates the BRAIN module: AGENTS.md routing BRAIN work to this skill, and an empty learning/", () => {
  const dir = path.join(scratch(), "brain");
  const learning = createBrain(dir);
  assert.equal(learning, path.join(dir, "learning"));
  assert.deepEqual(fs.readdirSync(dir).sort(), ["AGENTS.md", "learning"]);
  assert.equal(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), expected("brain-agents"));
  assert.equal(BRAIN_AGENTS_MD, expected("brain-agents"));
  assert.deepEqual(fs.readdirSync(learning), []);
});

test("a created BRAIN is valid, and nodes are born into its learning", () => {
  const learning = createBrain(path.join(scratch(), "brain"));
  assert.deepEqual(validate(learning), []);
  const file = createNode(birth("example", learning));
  assert.equal(relativeIdentity(learning, file), "genesis/26/09/25/01/nodes/example.md");
  assert.deepEqual(validate(learning), []);
});

test("refuses to create a BRAIN where one exists, leaving it as it was", () => {
  const dir = path.join(scratch(), "brain");
  const learning = createBrain(dir);
  createNode(birth("example", learning));
  assert.throws(() => createBrain(dir), /already exists; refusing to create a BRAIN over it/);
  assert.deepEqual(fs.readdirSync(dir).sort(), ["AGENTS.md", "learning"]);
  assert.equal(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), expected("brain-agents"));
  assert.deepEqual(validate(learning), []);
});

test("refuses an existing empty directory or file at the BRAIN's place, changing nothing", () => {
  const parent = scratch();
  fs.mkdirSync(path.join(parent, "empty"));
  fs.writeFileSync(path.join(parent, "file"), "");
  assert.throws(() => createBrain(path.join(parent, "empty")), /already exists/);
  assert.throws(() => createBrain(path.join(parent, "file")), /already exists/);
  assert.deepEqual(fs.readdirSync(path.join(parent, "empty")), []);
  assert.equal(fs.readFileSync(path.join(parent, "file"), "utf8"), "");
});

test("a BRAIN whose creation fails partway is removed again, leaving its parent as it was", (t) => {
  for (const [name, failure] of Object.entries(CREATE_FAILURES)) {
    const parent = scratch();
    const real = fs[failure.operation] as (...args: unknown[]) => unknown;
    // Fault injection: the named step fails, after writing a little if it is partial.
    const mocked = t.mock.method(fs, failure.operation as "writeFileSync", (...args: unknown[]) => {
      if (!String(args[0]).endsWith(path.sep + failure.path)) return real(...args);
      if (failure.partial) real(args[0], String(args[1]).slice(0, 3), args[2]);
      throw new Error(`simulated ${failure.operation} failure`);
    });
    assert.throws(() => createBrain(path.join(parent, "brain")), /simulated/, name);
    mocked.mock.restore();
    assert.deepEqual(fs.readdirSync(parent), [], name);
  }
});
