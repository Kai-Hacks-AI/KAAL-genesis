import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createArchitecture } from "./create.js";
import { idError, parse, readArchitecture, render, resolve } from "./architecture.js";

// Outside any Git repository: the skill works over ordinary files.
const scratch = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "architecture-")), "architecture");

test("a created Architecture reads back with the id it has and the placement it states", () => {
  const dir = scratch();
  const file = createArchitecture(dir, "a-b", "It holds.\n\nAlways.");
  assert.equal(file, path.join(dir, "a-b.md"));
  assert.deepEqual(readArchitecture([dir]), {
    records: [{ id: "a-b", placement: "It holds.\n\nAlways.", file }],
    errors: [],
  });
});

test("create refuses an unportable id, a blank placement and an existing Architecture", () => {
  const dir = scratch();
  for (const id of ["A", "a--b", "a.b", "a/b", "nul", "con", ""]) assert.throws(() => createArchitecture(dir, id, "x"));
  assert.throws(() => createArchitecture(dir, "a", "  \n"), /placement/);
  createArchitecture(dir, "a", "one");
  assert.throws(() => createArchitecture(dir, "a", "two"), /EEXIST/);
  assert.equal(readArchitecture([dir]).records[0].placement, "one");
});

test("identity is the id alone: the same text is the same Architecture wherever it is kept", () => {
  const text = render("a", "It holds.");
  const [one, two] = [scratch(), scratch()];
  for (const dir of [one, two]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "a.md"), text);
  }
  const strip = (dir: string) => readArchitecture([dir]).records.map(({ id, placement }) => ({ id, placement }));
  assert.deepEqual(strip(one), strip(two));
});

test("validation refuses what is not an Architecture", () => {
  const cases: [string, RegExp][] = [
    ["It holds.\n", /missing YAML frontmatter/],
    ["---\nid: [\n---\nx\n", /not valid YAML/],
    ["---\n- a\n---\nx\n", /mapping/],
    ["---\n---\nx\n", /frontmatter/],
    ["---\nid: 1\n---\nx\n", /id is required/],
    ["---\nid: A\n---\nx\n", /kebab-case/],
    ["---\nid: other\n---\nx\n", /file name must be other\.md/],
    ["---\nid: a\n---\n  \n", /placement/],
  ];
  for (const [text, message] of cases) assert.match(String(parse(text, "a.md")), message, text);
  // Metadata this skill does not own is neither read nor refused.
  assert.deepEqual(parse("---\nid: a\nsupersedes: b\nanything: 1\n---\nx\n", "a.md"), {
    id: "a",
    placement: "x",
    file: "a.md",
  });
  assert.deepEqual(parse("---\nid: a\n---\n\nIt holds.\n", "a.md"), { id: "a", placement: "It holds.", file: "a.md" });
});

test("only the *.md files directly in a root are candidates, and an id is defined once across roots", () => {
  const [one, two] = [scratch(), scratch()];
  createArchitecture(one, "a", "x");
  createArchitecture(two, "a", "y");
  // Nearby material that creates no discovery ambiguity is not refused.
  fs.writeFileSync(path.join(one, "notes.txt"), "");
  fs.mkdirSync(path.join(one, "sub"));
  fs.writeFileSync(path.join(one, "sub", "b.md"), "not an Architecture");
  const ignored = readArchitecture([one]);
  assert.deepEqual(ignored.errors, []);
  assert.deepEqual(
    ignored.records.map((r) => r.id),
    ["a"],
  );
  // A candidate that is not a regular file, or not an Architecture, is refused.
  fs.symlinkSync(path.join(two, "a.md"), path.join(one, "link.md"));
  fs.writeFileSync(path.join(one, "README.md"), "No frontmatter.");
  const { errors } = readArchitecture([one, two, path.join(one, "missing")]);
  assert.equal(errors.length, 3);
  assert.match(errors.join("\n"), /link\.md: an Architecture must be a regular file/);
  assert.match(errors.join("\n"), /README\.md: missing YAML frontmatter/);
  assert.match(errors.join("\n"), /id "a" is already defined/);
  assert.deepEqual(readArchitecture([path.join(one, "missing")]), { records: [], errors: [] });
});

test("extra frontmatter does not stop an Architecture resolving, but its own id must be valid", () => {
  const dir = scratch();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "a.md"), "---\nid: a\nsupersedes: b\nstatus: whatever\n---\n\nIt holds.\n");
  fs.writeFileSync(path.join(dir, "b.md"), "---\nid_: b\nsupersedes: a\n---\n\nTypo in the owned field.\n");
  const { records, errors } = readArchitecture([dir]);
  assert.deepEqual(
    records.map((r) => r.id),
    ["a"],
  );
  assert.match(errors.join("\n"), /b\.md: id is required/);
});

test("references resolve by id across roots, many to many, and an unknown id is an error", () => {
  const [one, two] = [scratch(), scratch()];
  createArchitecture(one, "a", "x");
  createArchitecture(two, "b", "y");
  const { records } = readArchitecture([one, two]);
  for (const ids of [["a"], ["a", "b"], ["b", "a"]]) {
    assert.deepEqual(
      resolve(records, ids).found.map((r) => r.id),
      ids,
    );
  }
  assert.deepEqual(resolve(records, ["a", "c"]).errors, ["c: no such Architecture"]);
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
    createArchitecture(dir, id, "It holds.");
    const { records, errors } = readArchitecture([dir]);
    assert.deepEqual(errors, [], id);
    assert.equal(resolve(records, [id]).found[0]?.id, id);
  }
});

test("a byte order mark, and the same root supplied twice, change nothing; a duplicated id resolves to none", () => {
  const dir = scratch();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "a.md"), "\uFEFF" + render("a", "It holds."));
  assert.deepEqual(readArchitecture([dir, dir, path.join(dir, ".")]).errors, []);
  const other = scratch();
  createArchitecture(other, "a", "Different.");
  const { records, errors } = readArchitecture([dir, other]);
  assert.equal(errors.length, 1);
  assert.deepEqual(resolve(records, ["a"]).errors, ["a: no such Architecture"]);
});

test("placement is kept exactly as written, apart from its framing", () => {
  const dir = scratch();
  const indented = "    const code = 1;\n\nThen prose.\n   ";
  createArchitecture(dir, "a", "\n\n" + indented);
  const { records } = readArchitecture([dir]);
  assert.equal(records[0].placement, "    const code = 1;\n\nThen prose.");
  // The same text hand-authored, and a second create-read, read back the same.
  fs.writeFileSync(path.join(dir, "b.md"), "---\nid: b\n---\n\n" + indented + "\n");
  assert.equal(readArchitecture([dir]).records[1].placement, records[0].placement);
});

test("an id is refused when its file name could not be portable, by create and validate alike", () => {
  const dir = scratch();
  const ok = "a".repeat(64);
  const long = "a".repeat(65);
  createArchitecture(dir, ok, "x");
  assert.throws(() => createArchitecture(dir, long, "x"), /longer than 64/);
  fs.writeFileSync(path.join(dir, `${long}.md`), `---\nid: ${long}\n---\n\nx\n`);
  const { records, errors } = readArchitecture([dir]);
  assert.deepEqual(
    records.map((r) => r.id),
    [ok],
  );
  assert.match(errors.join("\n"), /longer than 64/);
});
