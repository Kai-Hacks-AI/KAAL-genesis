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
    ["---\nid: a\nstatus: open\n---\nx\n", /only id, not status/],
    ["---\nid: 1\n---\nx\n", /id is required/],
    ["---\nid: A\n---\nx\n", /kebab-case/],
    ["---\nid: other\n---\nx\n", /file name must be other\.md/],
    ["---\nid: a\n---\n  \n", /meaning/],
  ];
  for (const [text, message] of cases) assert.match(String(parse(text, "a.md")), message, text);
  assert.deepEqual(parse("---\nid: a\n---\n\nIt holds.\n", "a.md"), { id: "a", meaning: "It holds.", file: "a.md" });
});

test("a root holds Requirements and nothing else, and an id is defined once across roots", () => {
  const [one, two] = [scratch(), scratch()];
  createRequirement(one, "a", "x");
  createRequirement(two, "a", "y");
  fs.writeFileSync(path.join(one, "notes.txt"), "");
  fs.mkdirSync(path.join(one, "sub"));
  fs.symlinkSync(path.join(two, "a.md"), path.join(one, "link.md"));
  const { errors } = readRequirements([one, two, path.join(one, "missing")]);
  assert.equal(errors.length, 4);
  assert.match(errors.join("\n"), /notes\.txt: not a Requirement file/);
  assert.match(errors.join("\n"), /sub: not a Requirement file/);
  assert.match(errors.join("\n"), /link\.md: not a Requirement file/);
  assert.match(errors.join("\n"), /id "a" is already defined/);
  assert.deepEqual(readRequirements([path.join(one, "missing")]), { requirements: [], errors: [] });
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
  const run = (script: string, ...args: string[]) =>
    spawnSync("npx", ["tsx", path.join(scripts, script), ...args], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
  const dir = scratch();
  assert.equal(run("create.ts", dir, "a", "It holds.").status, 0);
  assert.equal(run("validate.ts", dir).status, 0);
  const read = run("read.ts", "--root", dir, "a");
  assert.equal(read.status, 0);
  assert.equal(read.stdout, "a\n\nIt holds.\n\n");
  assert.equal(run("read.ts", "--root", dir, "nope").status, 1);
  assert.equal(run("validate.ts").status, 2);
});
