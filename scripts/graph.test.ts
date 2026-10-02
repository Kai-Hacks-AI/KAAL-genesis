import assert from "node:assert/strict";
import test from "node:test";
import { referrersOf } from "../skills/managing-kaal-graph/scripts/graph.js";
import { kaalGraph } from "./graph.js";

// The birth-test: KAAL's graph is exactly Node Node and Node Reference.
// Why: brain/learning/graph/26/10/02/01/nodes/managing-kaal-graph.md
test("KAAL's graph is valid and holds exactly the two Nodes born so far", () => {
  const { nodes, errors } = kaalGraph();
  assert.deepEqual(errors, []);
  assert.deepEqual(
    nodes.map((n) => n.id),
    ["node", "reference"],
  );
});

test("Node Node is the root: it states no Reference and defines Node", () => {
  const node = kaalGraph().nodes.find((n) => n.id === "node")!;
  assert.deepEqual(node.references, []);
  assert.match(
    node.meaning,
    /^A Node is a durable, immutable, addressable thing with an identity in the scope that owns it\.$/,
  );
});

test("Node Reference is a Node that uses Node Node, and Node Node knows nothing of it", () => {
  const { nodes } = kaalGraph();
  const reference = nodes.find((n) => n.id === "reference")!;
  assert.deepEqual(reference.references, [{ relation: "defined-using", target: "node" }]);
  assert.match(reference.meaning, /belongs to its referrer/);
  assert.deepEqual(referrersOf(nodes, "node"), [{ referrer: "reference", relation: "defined-using" }]);
  assert.doesNotMatch(nodes.find((n) => n.id === "node")!.meaning, /reference/i);
});
