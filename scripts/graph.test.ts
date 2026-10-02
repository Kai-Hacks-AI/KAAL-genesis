import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { birthNode } from "../skills/managing-kaal-graph/scripts/birth.js";
import { readNodes } from "../skills/managing-kaal-graph/scripts/graph.js";
import { kaalGraph, kernelErrors } from "./graph.js";

// The birth-test: KAAL's graph is KAAL Kernel, then Reference, then Node, each of type Definition.
// Why: brain/learning/graph/26/10/02/01/nodes/managing-kaal-graph.md
const byName = () => new Map(kaalGraph().nodes.map((n) => [n.name, n]));
const copy = () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kaal-graph-")), "graph");
  fs.cpSync("graph", dir, { recursive: true });
  return dir;
};

test("KAAL's graph is valid and holds exactly the three Nodes born so far", () => {
  const { nodes, errors } = kaalGraph();
  assert.deepEqual(errors, []);
  assert.deepEqual(nodes.map((n) => n.name).sort(), ["KAAL Kernel", "Node", "Reference"]);
});

test("KAAL Kernel is the first Node: of type Definition, and it says only what a Definition and its name, type and body are", () => {
  const kernel = byName().get("KAAL Kernel")!;
  assert.equal(kernel.type, "Definition");
  assert.match(kernel.meaning, /A Definition is a Markdown file that defines a thing\./);
  assert.match(kernel.meaning, /`name`.*`type`/s);
  assert.match(kernel.meaning, /Markdown body/);
  // Bare minimum: the Kernel pre-designs none of what comes after it or beside it.
  for (const word of ["Reference", "Node", "supersed", "travers", "resol", "version", "scope", "immutab", "Core"])
    assert.doesNotMatch(kernel.meaning, new RegExp(word, "i"), word);
});

test("Reference is born from the Kernel alone: name, type Definition and a body, read like any Definition", () => {
  const reference = byName().get("Reference")!;
  assert.equal(reference.type, "Definition");
  assert.match(reference.meaning, /^A Reference belongs to its referrer\. It names a relation and a target\./);
  assert.match(reference.meaning, /requires the target to know nothing about its referrers\.$/);
  // Nothing beyond the Kernel's contract was needed: its file is the contract's three parts and nothing else.
  assert.deepEqual(Object.keys(reference).sort(), ["file", "meaning", "name", "type"]);
  assert.equal(
    fs.readFileSync(reference.file, "utf8").replace(/\r\n/g, "\n").split("\n---\n")[0],
    "---\nname: Reference\ntype: Definition",
  );
});

test("Node follows as another Definition, and nothing earlier names it or any later Node", () => {
  const node = byName().get("Node")!;
  assert.equal(node.type, "Definition");
  assert.match(
    node.meaning,
    /^A Node is a durable, immutable, addressable thing with an identity in the scope that owns it\.$/,
  );
  for (const n of [byName().get("KAAL Kernel")!, byName().get("Reference")!])
    assert.doesNotMatch(n.meaning, /\bNode\b/);
});

test("the Kernel is falsifiable: no Kernel, a Kernel not of type Definition, or a Node of an undefined type is reported", () => {
  const dir = copy();
  birthNode(dir, "Stray", "Mystery", "Of a type the Kernel does not define.");
  const { nodes, errors } = readNodes(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(kernelErrors(nodes), ['Stray: type "Mystery" is not defined by KAAL Kernel']);
  assert.match(kernelErrors(nodes.filter((n) => n.name !== "KAAL Kernel")).join("\n"), /no KAAL Kernel/);
  const loose = nodes.map((n) => (n.name === "KAAL Kernel" ? { ...n, type: "Other" } : n));
  assert.match(kernelErrors(loose).join("\n"), /KAAL Kernel: must be of type Definition/);
});
