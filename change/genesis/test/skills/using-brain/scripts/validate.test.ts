import assert from "node:assert/strict";
import test from "node:test";
import { brainData } from "./test-data.js";
import { validate } from "./validate.js";

test("accepts references to relation and target born in earlier learnings", () => {
  assert.deepEqual(validate(brainData("earlier-edges")), []);
});

test("rejects missing and same-or-later knowledge", () => {
  assert.deepEqual(validate(brainData("same-learning-and-missing")), [
    "genesis/26/09/25/01/nodes/a.md: relation genesis/26/09/25/01/nodes/relation.md was not born earlier",
    "genesis/26/09/25/01/nodes/a.md: missing target genesis/26/09/25/01/nodes/missing.md",
  ]);
});

test("reports malformed frontmatter as file-prefixed errors instead of crashing", () => {
  const errors = validate(brainData("malformed"));
  assert.equal(errors.length, 2);
  assert.match(errors[0], /empty\.md: frontmatter must be a mapping/);
  assert.match(errors[1], /null-edge\.md: each edge needs string relation and to/);
});

test("rejects edges that cross lineages, even to an earlier learning", () => {
  assert.deepEqual(validate(brainData("across-lineages")), [
    "other/26/09/25/02/nodes/a.md: relation genesis/26/09/25/01/nodes/relation.md is in another lineage",
    "other/26/09/25/02/nodes/a.md: target genesis/26/09/25/01/nodes/b.md is in another lineage",
  ]);
});

test("reports lineages and slugs that would not name the same file on every platform", () => {
  assert.deepEqual(validate(brainData("unportable-names")), [
    'Other/26/09/25/01/nodes/a.md: lineage "Other" must be lowercase kebab-case (a-z, 0-9, single hyphens)',
    'genesis/26/09/25/01/nodes/Upper.md: slug "Upper" must be lowercase kebab-case (a-z, 0-9, single hyphens)',
  ]);
});
