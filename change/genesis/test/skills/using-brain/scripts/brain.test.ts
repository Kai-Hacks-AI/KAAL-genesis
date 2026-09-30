import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { learningKey, nodeFiles, parseNode, relativeIdentity } from "./brain.js";
import { brainData, nodeData } from "./test-data.js";

test("parses required name and edges", () => {
  assert.deepEqual(parseNode(nodeData("with-edges")), { name: "A", edges: [{ relation: "r", to: "B" }] });
});
test("rejects missing frontmatter and missing name", () => {
  assert.throws(() => parseNode(nodeData("plain")), /missing YAML frontmatter/);
  assert.throws(() => parseNode(nodeData("unnamed")), /name is required/);
});
test("rejects whitespace-only names", () => {
  assert.throws(() => parseNode(nodeData("blank-name")), /name is required/);
});
test("discovers markdown nodes and derives identity and learning relative to root", () => {
  const root = brainData("discovery");
  const file = path.join(root, "genesis/26/09/25/01/nodes/a.md");
  assert.deepEqual(nodeFiles(root), [file]);
  assert.equal(relativeIdentity(root, file), "genesis/26/09/25/01/nodes/a.md");
  assert.equal(learningKey(root, file), "26/09/25/01");
});
test("accepts CRLF line endings and frontmatter at end of file", () => {
  assert.deepEqual(parseNode(nodeData("crlf")), { name: "A" });
  assert.deepEqual(parseNode(nodeData("eof")), { name: "B" });
});
