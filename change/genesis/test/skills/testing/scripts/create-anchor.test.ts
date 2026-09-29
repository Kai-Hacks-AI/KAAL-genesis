import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ANCHOR_AGENTS_MD, createAnchor } from "./create-anchor.js";
import { expected, scratch } from "./test-data.js";

test("creates the testing anchor holding only AGENTS.md, which routes work with tests to this skill", () => {
  const dir = path.join(scratch(), "test");
  assert.equal(createAnchor(dir), dir);
  assert.deepEqual(fs.readdirSync(dir), ["AGENTS.md"]);
  assert.equal(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), expected("anchor-agents"));
  assert.equal(ANCHOR_AGENTS_MD, expected("anchor-agents"));
});

test("refuses to create an anchor where one exists, leaving it as it was", () => {
  const dir = path.join(scratch(), "test");
  createAnchor(dir);
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "# Changed\n");
  assert.throws(() => createAnchor(dir), /already exists; refusing to create a testing anchor over it/);
  assert.deepEqual(fs.readdirSync(dir), ["AGENTS.md"]);
  assert.equal(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), "# Changed\n");
});

test("refuses an existing empty directory or file at the anchor's place, changing nothing", () => {
  const parent = scratch();
  fs.mkdirSync(path.join(parent, "empty"));
  fs.writeFileSync(path.join(parent, "file"), "");
  assert.throws(() => createAnchor(path.join(parent, "empty")), /already exists/);
  assert.throws(() => createAnchor(path.join(parent, "file")), /already exists/);
  assert.deepEqual(fs.readdirSync(path.join(parent, "empty")), []);
  assert.equal(fs.readFileSync(path.join(parent, "file"), "utf8"), "");
});

test("an anchor whose AGENTS.md fails to be written is removed again, leaving its parent as it was", (t) => {
  const parent = scratch();
  // Fault injection: writing AGENTS.md fails, as a full disk would.
  t.mock.method(fs, "writeFileSync", () => {
    throw new Error("simulated write failure");
  });
  assert.throws(() => createAnchor(path.join(parent, "test")), /simulated write failure/);
  t.mock.restoreAll();
  assert.deepEqual(fs.readdirSync(parent), []);
});
