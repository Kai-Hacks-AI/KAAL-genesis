import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";
import { brain, candidate, files, load, scratch, script } from "../candidate.js";

// What can be shown of "one mechanism" is attribution, not exclusivity: the
// state cannot prevent a file from being written some other way, so these Cases
// show that the mechanism is how a node is born and that every node there is
// is exactly what it produces. A node it could not have produced falsifies this.

test(
  "a node is born through create-node, and a BRAIN of such nodes is valid",
  { tests: { requirement: ["brain-nodes-born-through-one-mechanism"] } },
  () => {
    const dir = scratch();
    brain(dir, [["genesis", "26/09/25/01", "first"]]);
    assert.deepEqual(files(path.join(dir, "brain/learning")), ["genesis/26/09/25/01/nodes/first.md"]);
    assert.equal(script("skills/using-brain/scripts/validate.ts", [], dir).status, 0);
  },
);

test(
  "every node of this state's BRAIN is exactly what create-node produces from the node's own place, name, edges and meaning",
  { tests: { requirement: ["brain-nodes-born-through-one-mechanism"] } },
  async () => {
    const { createNode } = await load<{ createNode(input: Record<string, unknown>): string }>(
      "skills/using-brain/scripts/create-node.ts",
    );
    const root = candidate("brain/learning");
    const nodes = files(root).filter((f) => f.endsWith(".md"));
    assert.ok(nodes.length > 0);
    const rebuilt = path.join(scratch(), "learning");
    for (const node of nodes) {
      const [lineage, yy, mm, dd, cc, dir, slug] = node.split("/");
      assert.equal(dir, "nodes", `${node} is not placed where birth places a node`);
      const text = fs.readFileSync(path.join(root, node), "utf8");
      const [, frontmatter, meaning] = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/.exec(text) ?? [];
      assert.ok(frontmatter !== undefined, `${node} does not have the shape birth writes`);
      const { name, edges } = YAML.parse(frontmatter);
      const born = createNode({
        root: rebuilt,
        lineage,
        learning: `${yy}/${mm}/${dd}/${cc}`,
        slug: slug.replace(/\.md$/, ""),
        name,
        meaning,
        edges,
      });
      assert.equal(fs.readFileSync(born, "utf8"), text, `${node} is not what the mechanism produces`);
    }
  },
);
