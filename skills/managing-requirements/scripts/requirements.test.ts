import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRequirement } from "./create.js";
import { idError, parse, readRequirements, render, resolve } from "./requirements.js";

// Outside any Git repository: the skill works over ordinary files.
const scratch = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "requirements-")), "requirement");

test("a created Requirement reads back with the id it has and the meaning it states", () => {
  const dir = scratch();
  const file = createRequirement(dir, "a-b", "It holds.\n\nAlways.");
  assert.equal(file, path.join(dir, "a-b.md"));
  assert.deepEqual(readRequirements([dir]), {
    requirements: [{ id: "a-b", meaning: "It holds.\n\nAlways.", file }],
    errors: [],
  });
});

test("create refuses an unportable id, a blank meaning and an existing Requirement", () => {
  const dir = scratch();
  for (const id of ["A", "a--b", "a.b", "a/b", "nul", "con", ""]) assert.throws(() => createRequirement(dir, id, "x"));
  assert.throws(() => createRequirement(dir, "a", "  \n"), /meaning/);
  createRequirement(dir, "a", "one");
  assert.throws(() => createRequirement(dir, "a", "two"), /EEXIST/);
  assert.equal(readRequirements([dir]).requirements[0].meaning, "one");
});

test("identity is the id alone: the same text is the same Requirement wherever it is kept", () => {
  const text = render("a", "It holds.");
  const [one, two] = [scratch(), scratch()];
  for (const dir of [one, two]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "a.md"), text);
  }
  const strip = (dir: string) => readRequirements([dir]).requirements.map(({ id, meaning }) => ({ id, meaning }));
  assert.deepEqual(strip(one), strip(two));
});

test("validation refuses what is not a Requirement", () => {
  const cases: [string, RegExp][] = [
    ["It holds.\n", /missing YAML frontmatter/],
    ["---\nid: [\n---\nx\n", /not valid YAML/],
    ["---\n- a\n---\nx\n", /mapping/],
    ["---\n---\nx\n", /frontmatter/],
    ["---\nid: 1\n---\nx\n", /id is required/],
    ["---\nid: A\n---\nx\n", /kebab-case/],
    ["---\nid: other\n---\nx\n", /file name must be other\.md/],
    ["---\nid: a\n---\n  \n", /meaning/],
  ];
  for (const [text, message] of cases) assert.match(String(parse(text, "a.md")), message, text);
  // Metadata this skill does not own is neither read nor refused.
  assert.deepEqual(parse("---\nid: a\nsupersedes: b\nanything: 1\n---\nx\n", "a.md"), {
    id: "a",
    meaning: "x",
    file: "a.md",
  });
  assert.deepEqual(parse("---\nid: a\n---\n\nIt holds.\n", "a.md"), { id: "a", meaning: "It holds.", file: "a.md" });
});

test("only the *.md files directly in a root are candidates, and an id is defined once across roots", () => {
  const [one, two] = [scratch(), scratch()];
  createRequirement(one, "a", "x");
  createRequirement(two, "a", "y");
  // Nearby material that creates no discovery ambiguity is not refused.
  fs.writeFileSync(path.join(one, "notes.txt"), "");
  fs.mkdirSync(path.join(one, "sub"));
  fs.writeFileSync(path.join(one, "sub", "b.md"), "not a Requirement");
  const ignored = readRequirements([one]);
  assert.deepEqual(ignored.errors, []);
  assert.deepEqual(
    ignored.requirements.map((r) => r.id),
    ["a"],
  );
  // A candidate that is not a regular file, or not a Requirement, is refused.
  fs.symlinkSync(path.join(two, "a.md"), path.join(one, "link.md"));
  fs.writeFileSync(path.join(one, "README.md"), "No frontmatter.");
  const { errors } = readRequirements([one, two, path.join(one, "missing")]);
  assert.equal(errors.length, 3);
  assert.match(errors.join("\n"), /link\.md: a Requirement must be a regular file/);
  assert.match(errors.join("\n"), /README\.md: missing YAML frontmatter/);
  assert.match(errors.join("\n"), /id "a" is already defined/);
  assert.deepEqual(readRequirements([path.join(one, "missing")]), { requirements: [], errors: [] });
});

test("extra frontmatter does not stop a Requirement resolving, but its own id must be valid", () => {
  const dir = scratch();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "a.md"), "---\nid: a\nsupersedes: b\nstatus: whatever\n---\n\nIt holds.\n");
  fs.writeFileSync(path.join(dir, "b.md"), "---\nid_: b\nsupersedes: a\n---\n\nTypo in the owned field.\n");
  const { requirements, errors } = readRequirements([dir]);
  assert.deepEqual(
    requirements.map((r) => r.id),
    ["a"],
  );
  assert.match(errors.join("\n"), /b\.md: id is required/);
});

test("references resolve by id across roots, many to many, and an unknown id is an error", () => {
  const [one, two] = [scratch(), scratch()];
  createRequirement(one, "a", "x");
  createRequirement(two, "b", "y");
  const { requirements } = readRequirements([one, two]);
  for (const ids of [["a"], ["a", "b"], ["b", "a"]]) {
    assert.deepEqual(
      resolve(requirements, ids).found.map((r) => r.id),
      ids,
    );
  }
  assert.deepEqual(resolve(requirements, ["a", "c"]).errors, ["c: no such Requirement"]);
  assert.equal(idError("ok-1"), undefined);
});

test("the scripts create, validate and read through the command line", () => {
  const scripts = fileURLToPath(new URL(".", import.meta.url));
  // No shell: arguments reach the script exactly as given on every platform.
  const run = (script: string, ...args: string[]) =>
    spawnSync(process.execPath, ["--import", "tsx", path.join(scripts, script), ...args], { encoding: "utf8" });
  const dir = scratch();
  assert.equal(run("create.ts", dir, "a", "It holds.").status, 0);
  assert.equal(run("validate.ts", dir).status, 0);
  const read = run("read.ts", "--root", dir, "a");
  assert.equal(read.status, 0);
  assert.equal(read.stdout, "a\n\nIt holds.\n\n");
  assert.equal(run("read.ts", "--root", dir, "nope").status, 1);
  assert.equal(run("validate.ts").status, 2);
});

test("every portable id round-trips through create and read, even one YAML would read as a number or boolean", () => {
  const dir = scratch();
  for (const id of ["007", "123", "1e3", "0x1f", "true", "false", "null", "yes", "a-b"]) {
    createRequirement(dir, id, "It holds.");
    const { requirements, errors } = readRequirements([dir]);
    assert.deepEqual(errors, [], id);
    assert.equal(resolve(requirements, [id]).found[0]?.id, id);
  }
});

test("a byte order mark, and the same root supplied twice, change nothing; a duplicated id resolves to none", () => {
  const dir = scratch();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "a.md"), "\uFEFF" + render("a", "It holds."));
  assert.deepEqual(readRequirements([dir, dir, path.join(dir, ".")]).errors, []);
  const other = scratch();
  createRequirement(other, "a", "Different.");
  const { requirements, errors } = readRequirements([dir, other]);
  assert.equal(errors.length, 1);
  assert.deepEqual(resolve(requirements, ["a"]).errors, ["a: no such Requirement"]);
});

test("meaning is kept exactly as written, apart from its framing", () => {
  const dir = scratch();
  const indented = "    const code = 1;\n\nThen prose.\n   ";
  createRequirement(dir, "a", "\n\n" + indented);
  const { requirements } = readRequirements([dir]);
  assert.equal(requirements[0].meaning, "    const code = 1;\n\nThen prose.");
  // The same text hand-authored, and a second create-read, read back the same.
  fs.writeFileSync(path.join(dir, "b.md"), "---\nid: b\n---\n\n" + indented + "\n");
  assert.equal(readRequirements([dir]).requirements[1].meaning, requirements[0].meaning);
});

test("an id is refused when its file name could not be portable, by create and validate alike", () => {
  const dir = scratch();
  const ok = "a".repeat(64);
  const long = "a".repeat(65);
  createRequirement(dir, ok, "x");
  assert.throws(() => createRequirement(dir, long, "x"), /longer than 64/);
  fs.writeFileSync(path.join(dir, `${long}.md`), `---\nid: ${long}\n---\n\nx\n`);
  const { requirements, errors } = readRequirements([dir]);
  assert.deepEqual(
    requirements.map((r) => r.id),
    [ok],
  );
  assert.match(errors.join("\n"), /longer than 64/);
});

// A caller of the skill: it supplies directories and reads what comes back. It
// writes no Requirement file and knows no file name, schema or traversal.
const collect = (...dirs: string[]) =>
  spawnSync(
    process.execPath,
    ["--import", import.meta.resolve("tsx"), fileURLToPath(new URL("./collect.ts", import.meta.url)), ...dirs],
    { encoding: "utf8" },
  );

test("a caller collects the Requirements of a supplied scope through the skill, whatever else is beside them", () => {
  const dir = scratch();
  createRequirement(dir, "b", "Second.");
  createRequirement(dir, "a", "First.");
  fs.writeFileSync(path.join(dir, "notes.txt"), "not a Requirement");
  fs.mkdirSync(path.join(dir, "nested"));
  createRequirement(path.join(dir, "nested"), "deeper", "Local collection never reaches this.");
  const run = collect(dir);
  assert.equal(run.status, 0);
  assert.deepEqual(
    JSON.parse(run.stdout).map((r: { id: string; meaning: string }) => [r.id, r.meaning]),
    [
      ["a", "First."],
      ["b", "Second."],
    ],
  );
});

test("collection is local: a nested directory is collected only when it is itself supplied", () => {
  const dir = scratch();
  createRequirement(dir, "outer", "Outer.");
  createRequirement(path.join(dir, "inner"), "inner", "Inner.");
  const ids = (...dirs: string[]) => JSON.parse(collect(...dirs).stdout).map((r: { id: string }) => r.id);
  assert.deepEqual(ids(dir), ["outer"]);
  assert.deepEqual(ids(dir, path.join(dir, "inner")), ["outer", "inner"]);
});

test("collecting a scope that holds no Requirements, or does not exist, yields none", () => {
  const dir = scratch();
  fs.mkdirSync(dir, { recursive: true });
  for (const scope of [dir, path.join(dir, "missing")]) {
    const run = collect(scope);
    assert.equal(run.status, 0);
    assert.deepEqual(JSON.parse(run.stdout), []);
  }
});

test("collecting refuses what claims to be a Requirement and is not, and prints nothing else", () => {
  const dir = scratch();
  createRequirement(dir, "good", "Fine.");
  fs.writeFileSync(path.join(dir, "bad.md"), "no frontmatter");
  const run = collect(dir);
  assert.equal(run.status, 1);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /bad\.md: missing YAML frontmatter/);
});

test("collecting names no scope: a usage error", () => {
  assert.equal(collect().status, 2);
});
