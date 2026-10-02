import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { birthNode } from "./birth.js";
import { nameError, parse, readNodes, referrersOf, render } from "./graph.js";

// Outside any Git repository: the skill works over ordinary files.
const scope = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "graph-")), "scope");
const bytes = (file: string) => fs.readFileSync(file);
const here = path.dirname(fileURLToPath(import.meta.url));

test("a Node may be of a type nothing defines, and be the first Node: no other Node needs to exist", () => {
  const dir = scope();
  const file = birthNode(dir, "KAAL Kernel", "Definition", "Defines.");
  assert.deepEqual(readNodes(dir), {
    nodes: [{ name: "KAAL Kernel", type: "Definition", meaning: "Defines.", references: [], file }],
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
  assert.throws(() => birthNode(dir, "a", "t", "One.", [{ relation: "r", target: "t" }]), /EEXIST/);
  assert.deepEqual(bytes(file), before);
  // The skill's whole surface is birth, read and check: no export writes over a Node.
  const source = fs.readdirSync(here).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  for (const f of source) {
    const text = fs.readFileSync(path.join(here, f), "utf8");
    assert.doesNotMatch(text, /appendFile|renameSync|unlinkSync|rmSync|flag: "w"[^x]/, f);
  }
});

test("a Reference is owned entirely by its referrer: it is in the referrer's own bytes and nowhere else", () => {
  const dir = scope();
  const target = birthNode(dir, "target", "t", "The target.");
  const referrer = birthNode(dir, "referrer", "t", "The referrer.", [{ relation: "mentions", target: "target" }]);
  assert.match(fs.readFileSync(referrer, "utf8"), /relation: mentions\n\s+target: target/);
  assert.doesNotMatch(fs.readFileSync(target, "utf8"), /referrer|mentions/);
  assert.deepEqual(readNodes(dir).nodes.find((n) => n.name === "referrer")!.references, [
    { relation: "mentions", target: "target" },
  ]);
});

test("adding a Reference does not mutate its target, whether the target is born, in another scope, or just a name", () => {
  const dir = scope();
  const other = scope();
  const inScope = birthNode(dir, "target", "t", "The target.");
  const elsewhere = birthNode(other, "target", "t", "Another Node with the same id in another scope.");
  const [a, b] = [bytes(inScope), bytes(elsewhere)];
  const stat = fs.statSync(inScope).mtimeMs;
  birthNode(dir, "one", "t", "x", [{ relation: "r", target: "target" }]);
  birthNode(dir, "two", "t", "y", [{ relation: "r", target: "target" }]);
  assert.deepEqual(bytes(inScope), a);
  assert.deepEqual(bytes(elsewhere), b);
  assert.equal(fs.statSync(inScope).mtimeMs, stat);
  // A target that is no Node, and no id of this form, is accepted and owed nothing.
  birthNode(dir, "external", "t", "z", [
    { relation: "r", target: "far/26/10/01/01" },
    { relation: "r", target: "Mixed Case 42" },
  ]);
  assert.deepEqual(readNodes(dir).errors, []);
  assert.deepEqual(fs.readdirSync(dir).sort(), ["external.md", "one.md", "target.md", "two.md"]);
});

test("reverse relationships are derived from the referrers, never written into the target", () => {
  const dir = scope();
  const target = birthNode(dir, "target", "t", "The target.");
  const before = bytes(target);
  birthNode(dir, "one", "t", "x", [{ relation: "r", target: "target" }]);
  birthNode(dir, "two", "t", "y", [
    { relation: "s", target: "target" },
    { relation: "r", target: "elsewhere" },
  ]);
  const { nodes } = readNodes(dir);
  assert.deepEqual(referrersOf(nodes, "target"), [
    { referrer: "one", relation: "r" },
    { referrer: "two", relation: "s" },
  ]);
  assert.deepEqual(referrersOf(nodes, "nobody-refers-here"), []);
  assert.deepEqual(referrersOf(nodes, "elsewhere"), [{ referrer: "two", relation: "r" }]);
  assert.deepEqual(bytes(target), before);
  assert.deepEqual(readNodes(dir).nodes.find((n) => n.name === "target")!.references, []);
});

test("different relation identities coexist, and the same relation can name many targets, without Core reading a meaning", () => {
  const dir = scope();
  const relations = ["tests", "https://example.org/relation/blocks", "is-defect-of", "Ünïcode relation", "a=b"];
  birthNode(dir, "t", "t", "A target.");
  birthNode(dir, "r", "t", "A referrer.", [
    ...relations.map((relation) => ({ relation, target: "t" })),
    { relation: "tests", target: "u" },
  ]);
  const [referrer] = readNodes(dir).nodes.filter((n) => n.name === "r");
  assert.deepEqual(
    referrer.references.map((x) => x.relation),
    [...relations, "tests"],
  );
  assert.equal(referrersOf(readNodes(dir).nodes, "t").length, relations.length);
  // Relations with the same text still differ from ones that differ in any way.
  assert.deepEqual(referrersOf(readNodes(dir).nodes, "u"), [{ referrer: "r", relation: "tests" }]);
});

test("co-birth is possible: Nodes may name each other in either order, and nothing orders births", () => {
  for (const order of [
    ["a", "b"],
    ["b", "a"],
  ]) {
    const dir = scope();
    for (const id of order)
      birthNode(dir, id, "t", `Node ${id}.`, [{ relation: "sees", target: id === "a" ? "b" : "a" }]);
    const { nodes, errors } = readNodes(dir);
    assert.deepEqual(errors, []);
    assert.deepEqual(referrersOf(nodes, "a"), [{ referrer: "b", relation: "sees" }]);
    assert.deepEqual(referrersOf(nodes, "b"), [{ referrer: "a", relation: "sees" }]);
  }
  // The first of the two named a target that did not yet exist, and was still born.
});

test("identity belongs to the scope: the same id in two scopes is two Nodes, and no scope is asked about another", () => {
  const [one, two] = [scope(), scope()];
  birthNode(one, "a", "t", "In one.");
  birthNode(two, "a", "t", "In two.");
  assert.equal(readNodes(one).nodes[0].meaning, "In one.");
  assert.equal(readNodes(two).nodes[0].meaning, "In two.");
});

test("check refuses what is not a Node, and what is a Reference only in name", () => {
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
    ["---\nname: a\ntype: t\nreferences: r\n---\nx\n", /must be a list/],
    ["---\nname: a\ntype: t\nreferences: [r]\n---\nx\n", /must be a mapping/],
    ["---\nname: a\ntype: t\nreferences:\n  - target: t\n---\nx\n", /relation/],
    ["---\nname: a\ntype: t\nreferences:\n  - relation: ' '\n    target: t\n---\nx\n", /relation/],
    ["---\nname: a\ntype: t\nreferences:\n  - relation: r\n---\nx\n", /target/],
    ["---\nname: a\ntype: t\nreferences:\n  - relation: r\n    target: 7\n---\nx\n", /target/],
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
  assert.throws(() => birthNode(dir, "a", "t", "x", [{ relation: "", target: "t" }]), /relation/);
  assert.throws(() => birthNode(dir, "a", "t", "x", [{ relation: "r", target: " " }]), /target/);
  assert.deepEqual(fs.existsSync(dir) ? fs.readdirSync(dir) : [], []);
  // Other frontmatter is neither read nor refused.
  assert.deepEqual(parse("---\nname: a\ntype: t\nsupersedes: b\n---\nx\n", "a.md"), {
    name: "a",
    type: "t",
    meaning: "x",
    references: [],
    file: "a.md",
  });
});

test("a rendered Node parses back to the same Node", () => {
  const refs = [
    { relation: "r", target: "far/26/10/01/01" },
    { relation: "s", target: "42" },
  ];
  const text = render("a", "t", "  Meaning\n\nmore.\n\n", refs);
  assert.deepEqual(parse(text, "a.md"), {
    name: "a",
    type: "t",
    meaning: "  Meaning\n\nmore.",
    references: refs,
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
  assert.equal(run("birth.ts", dir, "b", "t", "Two.", "--reference", "r=a", "--reference", "s=x=y").status, 0);
  assert.equal(run("birth.ts", dir, "a", "t", "Again.").status, 1);
  assert.equal(run("validate.ts", dir).status, 0);
  assert.deepEqual(run("read.ts", dir).stdout.trim().split(/\r?\n/), ["a", "b"]);
  assert.match(run("read.ts", dir, "b").stdout, /b: t\n\nTwo\.\n\nr -> a\ns -> x=y/);
  assert.equal(run("read.ts", dir, "--to", "a").stdout.trim(), "b r");
  assert.equal(run("read.ts", dir, "nope").status, 1);
  fs.writeFileSync(path.join(dir, "bad.md"), "not a node");
  assert.equal(run("validate.ts", dir).status, 1);
});

test("nothing is retrofitted: records of other kinds beside a scope are left exactly as they are", () => {
  const dir = scope();
  const legacy = path.join(path.dirname(dir), "idea");
  fs.mkdirSync(legacy);
  const idea = path.join(legacy, "an-idea.md");
  fs.writeFileSync(idea, "---\nname: an-idea\nidea: It could be so.\n---\n\nWhy.\n");
  const before = bytes(idea);
  birthNode(dir, "a", "t", "x", [{ relation: "from", target: "an-idea" }]);
  assert.deepEqual(readNodes(dir).errors, []);
  assert.deepEqual(
    readNodes(dir).nodes.map((n) => n.name),
    ["a"],
  );
  assert.deepEqual(bytes(idea), before);
});
