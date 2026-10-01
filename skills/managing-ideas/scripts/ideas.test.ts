import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createIdea } from "./create.js";
import { idError, parse, readIdeas, render, resolve } from "./ideas.js";

// Outside any Git repository: the skill works over ordinary files.
const scratch = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "idea-")), "idea");

test("a created Idea reads back with the id it has, the possibility it states and its context", () => {
  const dir = scratch();
  const file = createIdea(dir, "a-b", "It could be so.", "Worth keeping.\n\nAlways.");
  assert.equal(file, path.join(dir, "a-b.md"));
  assert.deepEqual(readIdeas([dir]), {
    ideas: [{ id: "a-b", idea: "It could be so.", context: "Worth keeping.\n\nAlways.", file }],
    errors: [],
  });
});

test("create refuses an unportable id, a blank idea, a blank context and an existing Idea", () => {
  const dir = scratch();
  for (const id of ["A", "a--b", "a.b", "a/b", "nul", "con", ""]) assert.throws(() => createIdea(dir, id, "x", "y"));
  assert.throws(() => createIdea(dir, "a", "  \n", "y"), /possibility/);
  assert.throws(() => createIdea(dir, "a", "x", "  \n"), /context/);
  createIdea(dir, "a", "one", "why");
  assert.throws(() => createIdea(dir, "a", "two", "other"), /EEXIST/);
  assert.equal(readIdeas([dir]).ideas[0].idea, "one");
});

test("identity is the id alone: the same text is the same Idea wherever it is kept", () => {
  const text = render("a", "It could be so.", "Worth keeping.");
  const [one, two] = [scratch(), scratch()];
  for (const dir of [one, two]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "a.md"), text);
  }
  const strip = (dir: string) => readIdeas([dir]).ideas.map(({ id, idea, context }) => ({ id, idea, context }));
  assert.deepEqual(strip(one), strip(two));
});

test("validation refuses what is not an Idea", () => {
  const cases: [string, RegExp][] = [
    ["It could be so.\n", /missing YAML frontmatter/],
    ["---\nid: [\n---\nx\n", /not valid YAML/],
    ["---\n- a\n---\nx\n", /mapping/],
    ["---\n---\nx\n", /frontmatter/],
    ["---\nidea: i\n---\nx\n", /id is required/],
    ["---\nid: 1\nidea: i\n---\nx\n", /id is required/],
    ["---\nid: A\nidea: i\n---\nx\n", /kebab-case/],
    ["---\nid: other\nidea: i\n---\nx\n", /file name must be other\.md/],
    ["---\nid: a\n---\nx\n", /idea is required/],
    ["---\nid: a\nidea: 1\n---\nx\n", /idea is required/],
    ["---\nid: a\nidea: '  '\n---\nx\n", /idea is required/],
    ["---\nid: a\nidea: i\n---\n  \n", /context/],
  ];
  for (const [text, message] of cases) assert.match(String(parse(text, "a.md")), message, text);
  // Metadata this skill does not own is neither read nor refused.
  assert.deepEqual(parse("---\nid: a\nidea: i\nsupersedes: b\nanything: 1\n---\nx\n", "a.md"), {
    id: "a",
    idea: "i",
    context: "x",
    file: "a.md",
  });
  assert.deepEqual(parse("---\nid: a\nidea: It could be so.\n---\n\nWorth keeping.\n", "a.md"), {
    id: "a",
    idea: "It could be so.",
    context: "Worth keeping.",
    file: "a.md",
  });
});

test("only the *.md files directly in a root are candidates, and an id is defined once across roots", () => {
  const [one, two] = [scratch(), scratch()];
  createIdea(one, "a", "x", "why");
  createIdea(two, "a", "y", "why");
  // Nearby material that creates no discovery ambiguity is not refused.
  fs.writeFileSync(path.join(one, "notes.txt"), "");
  fs.mkdirSync(path.join(one, "sub"));
  fs.writeFileSync(path.join(one, "sub", "b.md"), "not an Idea");
  const ignored = readIdeas([one]);
  assert.deepEqual(ignored.errors, []);
  assert.deepEqual(
    ignored.ideas.map((r) => r.id),
    ["a"],
  );
  // A candidate that is not a regular file, or not an Idea, is refused.
  fs.symlinkSync(path.join(two, "a.md"), path.join(one, "link.md"));
  fs.writeFileSync(path.join(one, "README.md"), "No frontmatter.");
  const { errors } = readIdeas([one, two, path.join(one, "missing")]);
  assert.equal(errors.length, 3);
  assert.match(errors.join("\n"), /link\.md: an Idea must be a regular file/);
  assert.match(errors.join("\n"), /README\.md: missing YAML frontmatter/);
  assert.match(errors.join("\n"), /id "a" is already defined/);
  assert.deepEqual(readIdeas([path.join(one, "missing")]), { ideas: [], errors: [] });
});

test("extra frontmatter does not stop an Idea resolving, but its own id must be valid", () => {
  const dir = scratch();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "a.md"),
    "---\nid: a\nidea: It could be so.\nsupersedes: b\nstatus: whatever\n---\n\nWorth keeping.\n",
  );
  fs.writeFileSync(path.join(dir, "b.md"), "---\nid_: b\nidea: i\nsupersedes: a\n---\n\nTypo in the owned field.\n");
  const { ideas, errors } = readIdeas([dir]);
  assert.deepEqual(
    ideas.map((r) => r.id),
    ["a"],
  );
  assert.match(errors.join("\n"), /b\.md: id is required/);
});

test("references resolve by id across roots, many to many, and an unknown id is an error", () => {
  const [one, two] = [scratch(), scratch()];
  createIdea(one, "a", "x", "why");
  createIdea(two, "b", "y", "why");
  const { ideas } = readIdeas([one, two]);
  for (const ids of [["a"], ["a", "b"], ["b", "a"]]) {
    assert.deepEqual(
      resolve(ideas, ids).found.map((r) => r.id),
      ids,
    );
  }
  assert.deepEqual(resolve(ideas, ["a", "c"]).errors, ["c: no such Idea"]);
  assert.equal(idError("ok-1"), undefined);
});

test("the scripts create, validate and read through the command line", () => {
  const scripts = fileURLToPath(new URL(".", import.meta.url));
  // No shell: arguments reach the script exactly as given on every platform.
  const run = (script: string, ...args: string[]) =>
    spawnSync(process.execPath, ["--import", "tsx", path.join(scripts, script), ...args], { encoding: "utf8" });
  const dir = scratch();
  assert.equal(run("create.ts", dir, "a", "It could be so.", "Worth keeping.").status, 0);
  assert.equal(run("validate.ts", dir).status, 0);
  const read = run("read.ts", "--root", dir, "a");
  assert.equal(read.status, 0);
  assert.equal(read.stdout, "a\n\nidea: It could be so.\n\nWorth keeping.\n\n");
  assert.equal(run("read.ts", "--root", dir, "nope").status, 1);
  assert.equal(run("validate.ts").status, 2);
});

test("every portable id round-trips through create and read, even one YAML would read as a number or boolean", () => {
  const dir = scratch();
  for (const id of ["007", "123", "1e3", "0x1f", "true", "false", "null", "yes", "a-b"]) {
    createIdea(dir, id, "It could be so.", "why");
    const { ideas, errors } = readIdeas([dir]);
    assert.deepEqual(errors, [], id);
    assert.equal(resolve(ideas, [id]).found[0]?.id, id);
  }
});

test("a byte order mark, and the same root supplied twice, change nothing; a duplicated id resolves to none", () => {
  const dir = scratch();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "a.md"), "\uFEFF" + render("a", "It could be so.", "Worth keeping."));
  assert.deepEqual(readIdeas([dir, dir, path.join(dir, ".")]).errors, []);
  const other = scratch();
  createIdea(other, "a", "Different.", "why");
  const { ideas, errors } = readIdeas([dir, other]);
  assert.equal(errors.length, 1);
  assert.deepEqual(resolve(ideas, ["a"]).errors, ["a: no such Idea"]);
});

test("context is kept exactly as written, apart from its framing", () => {
  const dir = scratch();
  const indented = "    const code = 1;\n\nThen prose.\n   ";
  createIdea(dir, "a", "i", "\n\n" + indented);
  const { ideas } = readIdeas([dir]);
  assert.equal(ideas[0].context, "    const code = 1;\n\nThen prose.");
  // The same text hand-authored, and a second create-read, read back the same.
  fs.writeFileSync(path.join(dir, "b.md"), "---\nid: b\nidea: i\n---\n\n" + indented + "\n");
  assert.equal(readIdeas([dir]).ideas[1].context, ideas[0].context);
});

test("an id is refused when its file name could not be portable, by create and validate alike", () => {
  const dir = scratch();
  const ok = "a".repeat(64);
  const long = "a".repeat(65);
  createIdea(dir, ok, "x", "why");
  assert.throws(() => createIdea(dir, long, "x", "why"), /longer than 64/);
  fs.writeFileSync(path.join(dir, `${long}.md`), `---\nid: ${long}\nidea: i\n---\n\nx\n`);
  const { ideas, errors } = readIdeas([dir]);
  assert.deepEqual(
    ideas.map((r) => r.id),
    [ok],
  );
  assert.match(errors.join("\n"), /longer than 64/);
});
