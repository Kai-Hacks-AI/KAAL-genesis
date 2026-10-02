import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { birthNode } from "./birth.js";
import { nameError, parse, readNodes, render } from "./graph.js";

// Outside any Git repository: the skill works over ordinary files.
const scope = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "graph-")), "scope");
const bytes = (file: string) => fs.readFileSync(file);
const here = path.dirname(fileURLToPath(import.meta.url));

test("a Node may be of a type nothing defines, and be the first Node: no other Node needs to exist", () => {
  const dir = scope();
  const file = birthNode(dir, "KAAL Kernel", "Definition", "Defines.");
  assert.deepEqual(readNodes(dir), {
    nodes: [{ name: "KAAL Kernel", type: "Definition", meaning: "Defines.", file }],
    errors: [],
  });
  assert.equal(path.basename(file), "KAAL Kernel.md");
});

test("every Node, whatever it defines, is one representation read and checked by the same rules", () => {
  const dir = scope();
  for (const name of ["KAAL Kernel", "Reference", "Node"]) birthNode(dir, name, "Definition", `Meaning of ${name}.`);
  const { nodes, errors } = readNodes(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    nodes.map((n) => n.name),
    ["KAAL Kernel", "Node", "Reference"],
  );
  for (const n of nodes) assert.equal(typeof parse(fs.readFileSync(n.file, "utf8"), n.file), "object");
});

test("a type is a name the skill reads and owes nothing: it need not resolve, but it must be stated", () => {
  const dir = scope();
  birthNode(dir, "a", "no-such-node", "x");
  birthNode(dir, "b", "far/26/10/01/01", "y");
  assert.deepEqual(readNodes(dir).errors, []);
  assert.throws(() => birthNode(dir, "c", " ", "z"), /type/);
  assert.equal(fs.existsSync(path.join(dir, "c.md")), false);
});

test("a Node is immutable after birth: it is never rewritten, and nothing here edits one", () => {
  const dir = scope();
  const file = birthNode(dir, "a", "t", "One.");
  const before = bytes(file);
  assert.throws(() => birthNode(dir, "a", "t", "Two."), /EEXIST/);
  assert.deepEqual(bytes(file), before);
  // The skill's whole surface is birth, read and check: no export writes over a Node.
  const source = fs.readdirSync(here).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  for (const f of source) {
    const text = fs.readFileSync(path.join(here, f), "utf8");
    assert.doesNotMatch(text, /appendFile|renameSync|unlinkSync|rmSync|flag: "w"[^x]/, f);
  }
});

test("identity belongs to the scope: the same id in two scopes is two Nodes, and no scope is asked about another", () => {
  const [one, two] = [scope(), scope()];
  birthNode(one, "a", "t", "In one.");
  birthNode(two, "a", "t", "In two.");
  assert.equal(readNodes(one).nodes[0].meaning, "In one.");
  assert.equal(readNodes(two).nodes[0].meaning, "In two.");
});

test("check refuses what is not a Node, ", () => {
  const cases: [string, RegExp][] = [
    ["Node.\n", /missing YAML frontmatter/],
    ["---\nname: [\n---\nx\n", /not valid YAML/],
    ["---\n- a\n---\nx\n", /mapping/],
    ["---\nname: 1\ntype: t\n---\nx\n", /name is required/],
    ["---\nname: a\n---\nx\n", /name its type/],
    ["---\nname: a\ntype: 3\n---\nx\n", /name its type/],
    ["---\nname: a\ntype: ' '\n---\nx\n", /name its type/],
    ["---\nname: a-b\ntype: t\n---\nx\n", /words of letters and digits/],
    ["---\nname: other\ntype: t\n---\nx\n", /file name must be other\.md/],
    ["---\nname: a\ntype: t\n---\n  \n", /meaning/],
  ];
  for (const [text, message] of cases) assert.match(String(parse(text, "a.md")), message, text);
  for (const name of ["", " a", "a ", "a  b", "a-b", "a.b", "a/b", "a:b", "NUL", "con", "x".repeat(65), "e\u0301"])
    assert.ok(nameError(name), name);
  for (const name of ["a", "KAAL Kernel", "Größe", "Reference 2", "x".repeat(64)])
    assert.equal(nameError(name), undefined, name);
  // Names differing only in case are one name, because a file system may say so.
  const folded = scope();
  fs.mkdirSync(folded, { recursive: true });
  fs.writeFileSync(path.join(folded, "Reference.md"), render("Reference", "t", "x"));
  fs.writeFileSync(path.join(folded, "reference.md"), render("reference", "t", "y"));
  if (readNodes(folded).nodes.length === 2) assert.match(readNodes(folded).errors.join("\n"), /another case/);
  const dir = scope();
  assert.throws(() => birthNode(dir, "a", "t", " \n"), /meaning/);
  assert.deepEqual(fs.existsSync(dir) ? fs.readdirSync(dir) : [], []);
  // Other frontmatter is neither read nor refused.
  assert.deepEqual(parse("---\nname: a\ntype: t\nsupersedes: b\n---\nx\n", "a.md"), {
    name: "a",
    type: "t",
    meaning: "x",
    file: "a.md",
  });
});

test("a rendered Node parses back to the same Node", () => {
  const text = render("a", "far/26/10/01/01", "  Meaning\n\nmore.\n\n");
  assert.deepEqual(parse(text, "a.md"), {
    name: "a",
    type: "far/26/10/01/01",
    meaning: "  Meaning\n\nmore.",
    file: "a.md",
  });
});

test("only *.md regular files directly in the scope are candidates; a missing scope holds none", () => {
  const dir = scope();
  birthNode(dir, "a", "t", "x");
  fs.writeFileSync(path.join(dir, "notes.txt"), "not a node");
  fs.mkdirSync(path.join(dir, "sub"));
  fs.writeFileSync(path.join(dir, "sub", "b.md"), "not directly in the scope");
  assert.deepEqual(
    readNodes(dir).nodes.map((n) => n.name),
    ["a"],
  );
  assert.deepEqual(readNodes(dir).errors, []);
  fs.mkdirSync(path.join(dir, "dir.md"));
  assert.match(readNodes(dir).errors[0], /regular file/);
  assert.deepEqual(readNodes(path.join(dir, "missing")), { nodes: [], errors: [] });
});

test("the skill stands alone: its code imports nothing outside itself, and it runs outside any KAAL checkout", () => {
  const imports = new Set<string>();
  for (const f of fs.readdirSync(here).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
    for (const m of fs.readFileSync(path.join(here, f), "utf8").matchAll(/^import .*? from "([^"]+)";$/gm))
      imports.add(m[1]);
  }
  for (const spec of imports) assert.match(spec, /^(node:[a-z/]+|yaml|\.\/[a-z]+\.js)$/, spec);
  const skill = fs.readFileSync(path.join(here, "..", "SKILL.md"), "utf8");
  for (const word of ["BRAIN", "Requirement", "Testing", "Git", "GitHub"])
    assert.doesNotMatch(skill, new RegExp(`\\b${word}\\b`), word);

  const dir = scope();
  const run = (script: string, ...args: string[]) =>
    spawnSync("npx", ["tsx", path.join(here, script), ...args], {
      encoding: "utf8",
      cwd: path.dirname(dir),
      shell: process.platform === "win32",
    });
  assert.equal(run("birth.ts", dir, "a", "t", "One.").status, 0);
  assert.equal(run("birth.ts", dir, "b", "t", "Two.").status, 0);
  assert.equal(run("birth.ts", dir, "a", "t", "Again.").status, 1);
  assert.equal(run("validate.ts", dir).status, 0);
  assert.deepEqual(run("read.ts", dir).stdout.trim().split(/\r?\n/), ["a", "b"]);
  assert.match(run("read.ts", dir, "b").stdout, /b: t\n\nTwo\./);
  assert.equal(run("read.ts", dir, "nope").status, 1);
  fs.writeFileSync(path.join(dir, "bad.md"), "not a node");
  assert.equal(run("validate.ts", dir).status, 1);
});

test("nothing is retrofitted: records of other kinds beside a scope are left exactly as they are", () => {
  const dir = scope();
  const legacy = path.join(path.dirname(dir), "idea");
  fs.mkdirSync(legacy);
  const idea = path.join(legacy, "an-idea.md");
  fs.writeFileSync(idea, "---\nid: an-idea\nidea: It could be so.\n---\n\nWhy.\n");
  const before = bytes(idea);
  birthNode(dir, "a", "t", "x");
  assert.deepEqual(readNodes(dir).errors, []);
  assert.deepEqual(
    readNodes(dir).nodes.map((n) => n.name),
    ["a"],
  );
  assert.deepEqual(bytes(idea), before);
});
