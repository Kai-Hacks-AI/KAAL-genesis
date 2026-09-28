import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { learningOf, nodeFiles, parseNode } from "../skills/using-brain/scripts/brain.js";
import { validate } from "../skills/using-brain/scripts/validate.js";
import { genesis, LEARNING } from "./genesis.js";
import { entries, kaal, occupied } from "./test-data.js";

// Genesis births KAAL as it understands itself now. KAAL's own BRAIN is the
// measure: what Genesis births is checked against KAAL's current nodes, while
// the history of how KAAL learned them stays in KAAL's BRAIN alone.
/** What Genesis births: KAAL's current understanding of the skills it uses and of how it works. */
const BORN = ["using-brain", "skill", "using-skills", "using-agents", "using-seals", "bass", "testing"];

/**
 * KAAL's current node of `name` in its Genesis lineage: the node of that name,
 * by its own frontmatter as BRAIN reads it, in the latest learning, which no
 * later node supersedes, whatever file it is kept in.
 */
function current(name: string): { file: string; learning: string } {
  const root = path.join(kaal(), "brain/learning");
  const [latest] = nodeFiles(root)
    .map((file) => ({ file, ...learningOf(root, file), name: parseNode(file).name }))
    .filter((node) => node.lineage === "genesis" && node.name === name)
    .sort((a, b) => b.key.localeCompare(a.key));
  assert.ok(latest, `KAAL holds no node named ${name}`);
  return { file: latest.file, learning: latest.key };
}

/** The sentences of a node's meaning, and its headings, each as written. */
function sentences(node: string): string[] {
  return node
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .split(/\n\s*\n/)
    .flatMap((paragraph) => paragraph.trim().split(/(?<=[.:;])\s+(?=[A-Z*`#])/))
    .filter(Boolean);
}

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

// Suite: suites/genesis.md
// Why: brain/learning/genesis/26/09/28/06/nodes/genesis.md
test("Genesis births the entry points and one learning of KAAL's current understanding, nothing else", () => {
  const nodes = `brain/learning/genesis/${LEARNING}/nodes`;
  assert.deepEqual(Object.keys(files(born())), [
    "AGENTS.md",
    "brain/AGENTS.md",
    ...BORN.map((name) => `${nodes}/${name}.md`).sort(),
  ]);
});

// Suite: suites/genesis.md
// Why: brain/learning/genesis/26/09/28/06/nodes/genesis.md
test("the entry points Genesis births are byte-identical to KAAL's own", () => {
  const produced = files(born());
  for (const file of ["AGENTS.md", "brain/AGENTS.md"])
    assert.equal(produced[file], fs.readFileSync(path.join(kaal(), file), "utf8"), file);
});

// Genesis may leave out of a node how KAAL came to its meaning, but may not add meaning KAAL does not hold.
// Suite: suites/genesis.md
// Why: brain/learning/genesis/26/09/28/06/nodes/genesis.md
test("Genesis adds nothing KAAL does not hold: every sentence it births is one KAAL's current node of that name holds", () => {
  const produced = files(born());
  for (const name of BORN) {
    const node = produced[`brain/learning/genesis/${LEARNING}/nodes/${name}.md`]!;
    const now = fs.readFileSync(current(name).file, "utf8");
    for (const sentence of sentences(node)) assert.ok(now.includes(sentence), `${name}: "${sentence}"`);
  }
});

// Suite: suites/genesis.md
// Why: brain/learning/genesis/26/09/28/06/nodes/genesis.md
test("Genesis is never behind KAAL: no node KAAL holds for a name it births is newer than what it births", () => {
  for (const name of BORN)
    assert.ok(current(name).learning <= LEARNING, `${name}: KAAL holds ${current(name).learning}`);
});

// Suite: suites/genesis.md
// Why: brain/learning/genesis/26/09/28/06/nodes/genesis.md
test("nothing a KAAL born by Genesis holds states KAAL's meaning through a branch, a merge or a push", () => {
  for (const [file, text] of Object.entries(files(born())))
    assert.doesNotMatch(text, /`main`|\bbranch|\bmerg|\bpush|pull request|kaal\/<name>/i, file);
});

// Suite: suites/genesis.md
// Why: scripts/brain-seals.ts
test("the BRAIN Genesis produces is valid", () => {
  assert.deepEqual(validate(path.join(born(), "brain/learning")), []);
});

// Suite: suites/genesis.md
// Why: scripts/genesis.ts
test("Genesis refuses where anything it would create is already there, leaving the repository exactly as it was", () => {
  for (const name of ["born", "agents", "brain"] as const) {
    const { repo, there } = occupied(name);
    const before = { entries: entries(repo), files: files(repo) };
    assert.throws(
      () => genesis(repo),
      (e: Error) => e.message.startsWith(`${path.join(repo, there)}: already exists`),
      name,
    );
    assert.deepEqual({ entries: entries(repo), files: files(repo) }, before, name);
  }
});

// Suite: suites/genesis.md
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
