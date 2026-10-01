import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { brain, scratch, script } from "../candidate.js";

const validate = (dir: string) => script("skills/using-brain/scripts/validate.ts", [], dir);

/** A valid BRAIN, then `node` written by hand beside its born node. */
function withHandWritten(file: string, text: string): string {
  const dir = scratch();
  brain(dir, [["genesis", "26/09/25/01", "born"]]);
  const place = path.join(dir, "brain/learning/genesis/26/09/25/01/nodes", file);
  fs.mkdirSync(path.dirname(place), { recursive: true });
  fs.writeFileSync(place, text);
  return dir;
}

test(
  "validation accepts the BRAIN this state carries",
  { tests: { requirement: ["brain-structure-validation"] } },
  () => {
    const checked = script("skills/using-brain/scripts/validate.ts", [], process.cwd());
    assert.equal(checked.status, 0, checked.stderr);
  },
);

test(
  "validation reports a node whose mechanics are wrong",
  { tests: { requirement: ["brain-structure-validation"] } },
  () => {
    for (const [file, text] of [
      ["no-frontmatter.md", "Just a body.\n"],
      ["unnamed.md", "---\nedges: []\n---\n\nBody.\n"],
      ["Not-Portable.md", "---\nname: x\n---\n\nBody.\n"],
      ["dangling.md", "---\nname: x\nedges:\n  - relation: r\n    to: genesis/26/09/25/01/nodes/absent.md\n---\n\nBody.\n"],
    ]) {
      const checked = validate(withHandWritten(file, text));
      assert.notEqual(checked.status, 0, `${file} is invalid and was not reported`);
      assert.match(checked.stderr, new RegExp(file.replace(".", "\\.")), `${file} is named`);
    }
  },
);

test(
  "validation does not judge what a valid node says",
  { tests: { requirement: ["brain-structure-validation"] } },
  () => {
    const checked = validate(withHandWritten("anything.md", "---\nname: x\n---\n\nAny meaning at all.\n"));
    assert.equal(checked.status, 0, checked.stderr);
  },
);
