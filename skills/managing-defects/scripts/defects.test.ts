import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createDefect } from "./create.js";
import { idError, parse, readDefects, render, resolve } from "./defects.js";

// Outside any Git repository: the skill works over ordinary files.
const scratch = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "defects-")), "defect");

test("a born Defect reads back with the id it has, what should have held and what was observed", () => {
  const dir = scratch();
  const file = createDefect(
    dir,
    "a-b",
    "The check leaves nothing behind.",
    "A second run left a directory.\n\nOn Linux.",
  );
  assert.equal(file, path.join(dir, "a-b.md"));
  assert.deepEqual(readDefects([dir]), {
    defects: [
      {
        id: "a-b",
        holds: "The check leaves nothing behind.",
        observation: "A second run left a directory.\n\nOn Linux.",
        file,
      },
    ],
    errors: [],
  });
});

test("create refuses an unportable id, a blank holds or observation, and never overwrites a Defect", () => {
  const dir = scratch();
  for (const id of ["A", "a--b", "a.b", "a/b", "nul", "con", ""]) assert.throws(() => createDefect(dir, id, "h", "x"));
  assert.throws(() => createDefect(dir, "a", "  ", "x"), /intended to hold/);
  assert.throws(() => createDefect(dir, "a", "h", "  \n"), /observed/);
  createDefect(dir, "a", "holds", "one");
  assert.throws(() => createDefect(dir, "a", "holds", "two"), /EEXIST/);
  assert.throws(() => createDefect(dir, "a", "other", "one"), /EEXIST/);
  assert.equal(readDefects([dir]).defects[0].observation, "one");
  assert.equal(readDefects([dir]).defects[0].holds, "holds");
});

test("identity is the id alone: the same text is the same Defect wherever it is kept", () => {
  const text = render("a", "It holds.", "It did not.");
  const [one, two] = [scratch(), scratch()];
  for (const dir of [one, two]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "a.md"), text);
  }
  const strip = (dir: string) => readDefects([dir]).defects.map(({ file: _, ...rest }) => rest);
  assert.deepEqual(strip(one), strip(two));
});

test("validation refuses what is not a Defect", () => {
  const cases: [string, RegExp][] = [
    ["It did not.\n", /missing YAML frontmatter/],
    ["---\nid: [\n---\nx\n", /not valid YAML/],
    ["---\n- a\n---\nx\n", /mapping/],
    ["---\n---\nx\n", /frontmatter/],
    ["---\nid: 1\nholds: h\n---\nx\n", /id is required/],
    ["---\nid: A\nholds: h\n---\nx\n", /kebab-case/],
    ["---\nid: other\nholds: h\n---\nx\n", /file name must be other\.md/],
    ["---\nid: a\n---\nx\n", /holds is required/],
    ["---\nid: a\nholds: '  '\n---\nx\n", /holds is required/],
    ["---\nid: a\nholds: [1]\n---\nx\n", /holds is required/],
    ["---\nid: a\nholds: h\n---\n  \n", /what was observed/],
  ];
  for (const [text, message] of cases) assert.match(String(parse(text, "a.md")), message, text);
  assert.deepEqual(parse("---\nid: a\nholds: h\n---\n\nIt did not.\n", "a.md"), {
    id: "a",
    holds: "h",
    observation: "It did not.",
    file: "a.md",
  });
});

test("a Defect carries no disposition: what else sits in its frontmatter is neither read nor given meaning", () => {
  const born = render("a", "h", "x");
  assert.equal(born, "---\nid: a\nholds: h\n---\n\nx\n");
  // Whatever a Change decides about a Defect is the Change's; the Defect never offers a place for it.
  assert.deepEqual(parse("---\nid: a\nholds: h\nstatus: fixed\nblocking: true\n---\nx\n", "a.md"), {
    id: "a",
    holds: "h",
    observation: "x",
    file: "a.md",
  });
});

test("only the *.md files directly in a root are candidates, and an id is defined once across roots", () => {
  const [one, two] = [scratch(), scratch()];
  createDefect(one, "a", "h", "x");
  createDefect(two, "a", "h", "y");
  fs.writeFileSync(path.join(one, "notes.txt"), "");
  fs.mkdirSync(path.join(one, "sub"));
  fs.writeFileSync(path.join(one, "sub", "b.md"), "not a Defect");
  const ignored = readDefects([one]);
  assert.deepEqual(ignored.errors, []);
  assert.deepEqual(
    ignored.defects.map((d) => d.id),
    ["a"],
  );
  fs.symlinkSync(path.join(two, "a.md"), path.join(one, "link.md"));
  fs.writeFileSync(path.join(one, "README.md"), "No frontmatter.");
  const { errors } = readDefects([one, two, path.join(one, "missing")]);
  assert.equal(errors.length, 3);
  assert.match(errors.join("\n"), /link\.md: a Defect must be a regular file/);
  assert.match(errors.join("\n"), /README\.md: missing YAML frontmatter/);
  assert.match(errors.join("\n"), /id "a" is already defined/);
  assert.deepEqual(readDefects([path.join(one, "missing")]), { defects: [], errors: [] });
});

test("references resolve by id across roots, many to many, and an unknown id is an error", () => {
  const [one, two] = [scratch(), scratch()];
  createDefect(one, "a", "h", "x");
  createDefect(two, "b", "h", "y");
  const { defects } = readDefects([one, two]);
  for (const ids of [["a"], ["a", "b"], ["b", "a"]]) {
    assert.deepEqual(
      resolve(defects, ids).found.map((d) => d.id),
      ids,
    );
  }
  assert.deepEqual(resolve(defects, ["a", "c"]).errors, ["c: no such Defect"]);
  assert.equal(idError("ok-1"), undefined);
});

test("the scripts create, validate and read through the command line", () => {
  const scripts = fileURLToPath(new URL(".", import.meta.url));
  // No shell: arguments reach the script exactly as given on every platform.
  const run = (script: string, ...args: string[]) =>
    spawnSync(process.execPath, ["--import", "tsx", path.join(scripts, script), ...args], { encoding: "utf8" });
  const dir = scratch();
  assert.equal(run("create.ts", dir, "a", "It holds.", "It did not.").status, 0);
  assert.equal(run("create.ts", dir, "a", "It holds.", "Again.").status, 1);
  assert.equal(run("validate.ts", dir).status, 0);
  const read = run("read.ts", "--root", dir, "a");
  assert.equal(read.status, 0);
  assert.equal(read.stdout, "a\n\nholds: It holds.\n\nIt did not.\n\n");
  assert.equal(run("read.ts", "--root", dir, "nope").status, 1);
  assert.equal(run("validate.ts").status, 2);
  assert.equal(run("create.ts", dir, "b", "only holds").status, 2);
});

test("every portable id round-trips through create and read, even one YAML would read as a number or boolean", () => {
  const dir = scratch();
  for (const id of ["007", "123", "1e3", "0x1f", "true", "false", "null", "yes", "a-b"]) {
    createDefect(dir, id, "It holds.", "It did not.");
    const { defects, errors } = readDefects([dir]);
    assert.deepEqual(errors, [], id);
    assert.equal(resolve(defects, [id]).found[0]?.id, id);
  }
});

test("a holds that YAML would read differently round-trips as written", () => {
  const dir = scratch();
  for (const [i, holds] of [
    "true",
    "12",
    "a: b",
    "- x",
    "# not a comment",
    "multi\nline",
    'it\'s "quoted"',
  ].entries()) {
    createDefect(dir, `d${i}`, holds, "x");
    assert.equal(resolve(readDefects([dir]).defects, [`d${i}`]).found[0].holds, holds);
  }
});

test("a byte order mark, and the same root supplied twice, change nothing; a duplicated id resolves to none", () => {
  const dir = scratch();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "a.md"), "﻿" + render("a", "h", "It did not."));
  assert.deepEqual(readDefects([dir, dir, path.join(dir, ".")]).errors, []);
  const other = scratch();
  createDefect(other, "a", "h", "Different.");
  const { defects, errors } = readDefects([dir, other]);
  assert.equal(errors.length, 1);
  assert.deepEqual(resolve(defects, ["a"]).errors, ["a: no such Defect"]);
});

test("the observation is kept exactly as written, apart from its framing", () => {
  const dir = scratch();
  const indented = "    const code = 1;\n\nThen prose.\n   ";
  createDefect(dir, "a", "h", "\n\n" + indented);
  const { defects } = readDefects([dir]);
  assert.equal(defects[0].observation, "    const code = 1;\n\nThen prose.");
  fs.writeFileSync(path.join(dir, "b.md"), "---\nid: b\nholds: h\n---\n\n" + indented + "\n");
  assert.equal(readDefects([dir]).defects[1].observation, defects[0].observation);
});

test("an id is refused when its file name could not be portable, by create and validate alike", () => {
  const dir = scratch();
  const ok = "a".repeat(64);
  const long = "a".repeat(65);
  createDefect(dir, ok, "h", "x");
  assert.throws(() => createDefect(dir, long, "h", "x"), /longer than 64/);
  fs.writeFileSync(path.join(dir, `${long}.md`), `---\nid: ${long}\nholds: h\n---\n\nx\n`);
  const { defects, errors } = readDefects([dir]);
  assert.deepEqual(
    defects.map((d) => d.id),
    [ok],
  );
  assert.match(errors.join("\n"), /longer than 64/);
});
