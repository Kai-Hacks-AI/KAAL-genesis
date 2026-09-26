import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validate } from "../skills/using-brain/scripts/validate.js";
import { genesis } from "./genesis.js";

// The committed repository is the expected result: this proves KAAL's initial
// structure is exactly what Genesis produces through its capabilities, not
// something placed by hand.
const REPO = fileURLToPath(new URL("../", import.meta.url));
const GENESIS = "brain/learning/genesis/26/09/25/01/nodes";

/** Every file under `dir`, by posix path relative to `from`, with its bytes. */
function files(from: string, dir = from): Record<string, string> {
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => path.join(e.parentPath, e.name))
      .sort()
      .map((f) => [path.relative(from, f).split(path.sep).join("/"), fs.readFileSync(f, "utf8")]),
  );
}

function born(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-genesis-"));
  genesis(repo);
  return repo;
}

// Why: brain/learning/genesis/26/09/26/03/nodes/genesis.md
test("Genesis produces exactly the root AGENTS.md, brain/AGENTS.md and the Genesis learning, nothing else", () => {
  assert.deepEqual(Object.keys(files(born())), [
    "AGENTS.md",
    "brain/AGENTS.md",
    ...Object.keys(files(REPO, path.join(REPO, GENESIS))),
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/genesis.md
test("everything Genesis produces is byte-identical to what is committed", () => {
  const produced = files(born());
  const committed = Object.fromEntries(
    Object.keys(produced).map((file) => [file, fs.readFileSync(path.join(REPO, file), "utf8")]),
  );
  assert.deepEqual(produced, committed);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/genesis.md
test("the committed Genesis learning holds exactly the nodes Genesis births", () => {
  const repo = born();
  assert.deepEqual(files(repo, path.join(repo, GENESIS)), files(REPO, path.join(REPO, GENESIS)));
});

// Why: scripts/brain-seals.ts
test("the BRAIN Genesis produces is valid", () => {
  assert.deepEqual(validate(path.join(born(), "brain/learning")), []);
});

// Why: scripts/genesis.ts
test("Genesis refuses to run over an existing KAAL, changing nothing", () => {
  const repo = born();
  const before = files(repo);
  assert.throws(() => genesis(repo), /already exists/);
  assert.deepEqual(files(repo), before);
});

// Why: scripts/genesis.ts
test("Genesis refuses when the repository already has an Agent entry point, leaving it as it was", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-genesis-"));
  fs.cpSync(path.join(REPO, "AGENTS.md"), path.join(repo, "AGENTS.md"));
  const before = files(repo);
  assert.throws(() => genesis(repo), /AGENTS\.md: already exists/);
  assert.deepEqual(files(repo), before);
  assert.equal(fs.existsSync(path.join(repo, "brain")), false);
});

// Why: scripts/genesis.ts
test("Genesis whose Agent entry point fails while being written leaves the repository exactly as it was", (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-genesis-"));
  fs.writeFileSync(path.join(repo, "README.md"), "# Existing\n");
  const before = files(repo);
  const write = fs.writeFileSync;
  // Fault injection: using-agents' write of the guidance fails partway.
  t.mock.method(fs, "writeFileSync", (target: fs.PathOrFileDescriptor, data: string, options?: fs.WriteFileOptions) => {
    if (typeof target !== "number") return write(target, data, options);
    write(target, data.slice(0, 3));
    throw new Error("write failed on purpose");
  });
  assert.throws(() => genesis(repo), /write failed on purpose/);
  t.mock.restoreAll();
  assert.deepEqual(files(repo), before);
  assert.equal(fs.existsSync(path.join(repo, "brain")), false);
  assert.equal(fs.existsSync(path.join(repo, "AGENTS.md")), false);
});
