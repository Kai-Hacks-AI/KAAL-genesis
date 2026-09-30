import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createAgents } from "./create-agents.js";
import { guidance, scratchScope } from "./test-data.js";

test("creates <scope>/AGENTS.md holding exactly the guidance supplied", () => {
  const scope = scratchScope();
  const file = createAgents(scope, guidance("example"));
  assert.equal(file, path.join(scope, "AGENTS.md"));
  assert.equal(fs.readFileSync(file, "utf8"), guidance("example"));
  assert.deepEqual(fs.readdirSync(scope), ["AGENTS.md"]);
});

test("keeps the guidance's bytes exactly, line endings included", () => {
  const scope = scratchScope();
  assert.equal(fs.readFileSync(createAgents(scope, guidance("crlf")), "utf8"), guidance("crlf"));
});

test("refuses to overwrite an existing AGENTS.md, leaving it as it was", () => {
  const scope = scratchScope();
  createAgents(scope, guidance("example"));
  assert.throws(() => createAgents(scope, guidance("crlf")), /AGENTS\.md: already exists; refusing to overwrite it/);
  assert.equal(fs.readFileSync(path.join(scope, "AGENTS.md"), "utf8"), guidance("example"));
});

test("refuses a scope that is not an existing directory, creating nothing", () => {
  const parent = scratchScope();
  const missing = path.join(parent, "missing");
  assert.throws(() => createAgents(missing, guidance("example")), /scope must be an existing directory/);
  const file = path.join(parent, "file");
  fs.writeFileSync(file, "");
  assert.throws(() => createAgents(file, guidance("example")), /scope must be an existing directory/);
  assert.deepEqual(fs.readdirSync(parent), ["file"]);
});

test("refuses empty guidance, creating nothing", () => {
  const scope = scratchScope();
  assert.throws(() => createAgents(scope, guidance("blank")), /guidance is empty/);
  assert.deepEqual(fs.readdirSync(scope), []);
});

test("a failure while writing the guidance leaves the scope as it was", (t) => {
  const scope = scratchScope();
  const write = fs.writeFileSync;
  let staged: string[] = [];
  // Fault injection: writing the guidance starts, then fails.
  t.mock.method(fs, "writeFileSync", (target: fs.PathOrFileDescriptor, data: string) => {
    if (typeof target !== "number") return write(target, data);
    write(target, data.slice(0, 3));
    staged = fs.readdirSync(scope);
    throw new Error("write failed on purpose");
  });
  assert.throws(() => createAgents(scope, guidance("example")), /write failed on purpose/);
  // Creation had begun, in a staging file; AGENTS.md itself never existed.
  assert.equal(staged.length, 1);
  assert.notEqual(staged[0], "AGENTS.md");
  assert.deepEqual(fs.readdirSync(scope), []);
});

test("a failure publishing AGENTS.md leaves the scope as it was", (t) => {
  const scope = scratchScope();
  t.mock.method(fs, "linkSync", () => {
    throw new Error("link failed on purpose");
  });
  assert.throws(() => createAgents(scope, guidance("example")), /link failed on purpose/);
  assert.deepEqual(fs.readdirSync(scope), []);
});

test("once AGENTS.md is published the call succeeds, even if its staging file cannot be removed", (t) => {
  const scope = scratchScope();
  t.mock.method(fs, "unlinkSync", () => {
    throw new Error("unlink failed on purpose");
  });
  const file = createAgents(scope, guidance("example"));
  t.mock.restoreAll();
  assert.equal(file, path.join(scope, "AGENTS.md"));
  assert.equal(fs.readFileSync(file, "utf8"), guidance("example"));
});

test("an AGENTS.md put in place while the guidance is written is refused and never touched", (t) => {
  const scope = scratchScope();
  const file = path.join(scope, "AGENTS.md");
  const write = fs.writeFileSync;
  // Another process creates AGENTS.md after this call's check, before it publishes.
  t.mock.method(fs, "writeFileSync", (target: fs.PathOrFileDescriptor, data: string) => {
    if (typeof target === "number") write(file, guidance("crlf"));
    return write(target, data);
  });
  assert.throws(() => createAgents(scope, guidance("example")), /AGENTS\.md: already exists; refusing to overwrite it/);
  t.mock.restoreAll();
  assert.equal(fs.readFileSync(file, "utf8"), guidance("crlf"));
  assert.deepEqual(fs.readdirSync(scope), ["AGENTS.md"]);
});

test("a failing call never removes or changes an AGENTS.md that existed before it", (t) => {
  const scope = scratchScope();
  const file = path.join(scope, "AGENTS.md");
  fs.writeFileSync(file, guidance("crlf"));
  // Even with every write failing, the existing entry point is refused, not touched.
  t.mock.method(fs, "writeFileSync", () => {
    throw new Error("write failed on purpose");
  });
  assert.throws(() => createAgents(scope, guidance("example")));
  t.mock.restoreAll();
  assert.equal(fs.readFileSync(file, "utf8"), guidance("crlf"));
  assert.deepEqual(fs.readdirSync(scope), ["AGENTS.md"]);
});
