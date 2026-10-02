import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { birthNode } from "../skills/managing-kaal-graph/scripts/birth.js";
import { readNodes, referrersOf } from "../skills/managing-kaal-graph/scripts/graph.js";
import { closureErrors, kaalGraph } from "./graph.js";

// The birth-test: KAAL's graph is exactly Definition, Reference and Node, and describes itself.
// Why: brain/learning/graph/26/10/02/01/nodes/managing-kaal-graph.md
const byId = () => new Map(kaalGraph().nodes.map((n) => [n.id, n]));

test("KAAL's graph is valid, closed, and holds exactly the three Nodes born so far", () => {
  const { nodes, errors } = kaalGraph();
  assert.deepEqual(errors, []);
  assert.deepEqual(
    nodes.map((n) => n.id),
    ["definition", "node", "reference"],
  );
});

test("Definition is the genesis: of type Definition, so there is no typeless root, and it states no Reference", () => {
  const definition = byId().get("definition")!;
  assert.equal(definition.type, "definition");
  assert.deepEqual(definition.references, []);
  assert.match(definition.meaning, /^A Definition is a Node that defines what something is\./);
});

test("Reference and Node are ordinary Definition Nodes, one representation with Definition", () => {
  const { nodes } = kaalGraph();
  for (const id of ["reference", "node"]) assert.equal(byId().get(id)!.type, "definition");
  assert.match(
    byId().get("node")!.meaning,
    /^A Node is a durable, immutable, addressable thing with an identity in the scope that owns it\.$/,
  );
  assert.match(byId().get("reference")!.meaning, /belongs to its referrer/);
  assert.equal(new Set(nodes.map((n) => path.extname(n.file))).size, 1);
});

test("Reference uses the Reference mechanism on itself: Reference → Reference, by a relation that is itself a Definition", () => {
  const reference = byId().get("reference")!;
  assert.deepEqual(reference.references, [{ relation: "reference", target: "reference" }]);
  assert.deepEqual(referrersOf(kaalGraph().nodes, "reference"), [{ referrer: "reference", relation: "reference" }]);
  // Nothing else names Reference, and Definition and Node name nothing: the target knows no referrer.
  assert.deepEqual(byId().get("definition")!.references, []);
  assert.deepEqual(byId().get("node")!.references, []);
});

test("closure is falsifiable: an undefined relation, an undefined type or a typeless root is reported", () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kaal-graph-")), "graph");
  fs.cpSync("graph", dir, { recursive: true });
  birthNode(dir, "uses", "definition", "Uses an undefined relation.", [{ relation: "defined-using", target: "node" }]);
  birthNode(dir, "stray", "undefined-type", "Names no Definition.");
  const { nodes, errors } = readNodes(dir);
  assert.deepEqual(errors, []);
  assert.deepEqual(closureErrors(nodes), [
    'stray: type "undefined-type" names no Definition',
    'uses: relation "defined-using" names no Definition',
  ]);
  assert.match(closureErrors(nodes.filter((n) => n.id !== "definition")).join("\n"), /no Definition Node/);
  const loose = nodes.map((n) => (n.id === "definition" ? { ...n, type: "node" } : n));
  assert.match(closureErrors(loose).join("\n"), /definition: must be of type definition/);
});
