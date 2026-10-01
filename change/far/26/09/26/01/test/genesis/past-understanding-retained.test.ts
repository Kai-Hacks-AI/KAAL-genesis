import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { brain, scratch, script } from "../candidate.js";

test(
  "a born node is never overwritten, and later understanding is a later node beside it",
  { tests: { requirement: ["past-understanding-retained"] } },
  () => {
    const dir = scratch();
    brain(dir, [["genesis", "26/09/25/01", "idea"]]);
    const first = path.join(dir, "brain/learning/genesis/26/09/25/01/nodes/idea.md");
    const learned = fs.readFileSync(first, "utf8");

    const again = script(
      "skills/using-brain/scripts/create-node.ts",
      ["genesis", "26/09/25/01", "idea", "idea", "A different meaning."],
      dir,
    );
    assert.notEqual(again.status, 0, "the same node cannot be born twice");
    assert.equal(fs.readFileSync(first, "utf8"), learned);

    const later = script(
      "skills/using-brain/scripts/create-node.ts",
      ["genesis", "26/09/26/01", "idea", "idea", "Understanding changed."],
      dir,
    );
    assert.equal(later.status, 0, later.stderr);
    assert.equal(fs.readFileSync(first, "utf8"), learned);
    assert.match(
      fs.readFileSync(path.join(dir, "brain/learning/genesis/26/09/26/01/nodes/idea.md"), "utf8"),
      /Understanding changed\./,
    );
    assert.equal(script("skills/using-brain/scripts/validate.ts", [], dir).status, 0);
  },
);
