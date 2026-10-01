import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { scratch, script } from "../../../../../../26/09/26/01/test/candidate.js";

// Judged through the candidate's own managing-change: a Change is born with its
// scripts, in the working directory of a scratch repository, and validated by
// them.
const birth = (dir: string, lineage: string, occurrence: string) =>
  script("skills/managing-change/scripts/birth.ts", [lineage, occurrence], dir);
const validate = (dir: string) => script("skills/managing-change/scripts/validate.ts", [], dir);
const owned = (dir: string, occurrence: string, file: string, bytes: string) => {
  const at = path.join(dir, "change/testing", occurrence, file);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, bytes);
  return at;
};

test(
  "a Change is born beneath the lineage it contributes to, owning nothing until work arises from it",
  { tests: { requirement: ["changes-are-immutable-occurrences-beneath-their-lineage"] } },
  () => {
    const dir = scratch();
    const born = birth(dir, "testing", "26/09/30/01");
    assert.equal(born.status, 0, born.stderr);
    const at = path.join(dir, "change/testing/26/09/30/01");
    assert.ok(fs.statSync(at).isDirectory());
    assert.deepEqual(fs.readdirSync(at), []);
    const checked = validate(dir);
    assert.equal(checked.status, 0, checked.stderr);
  },
);

test(
  "birth refuses a Change that exists, so a later Change never writes over an earlier one",
  { tests: { requirement: ["changes-are-immutable-occurrences-beneath-their-lineage"] } },
  () => {
    const dir = scratch();
    assert.equal(birth(dir, "testing", "26/09/30/01").status, 0);
    const at = owned(dir, "26/09/30/01", "owned.txt", "the first Change's\n");
    const again = birth(dir, "testing", "26/09/30/01");
    assert.notEqual(again.status, 0);
    assert.equal(fs.readFileSync(at, "utf8"), "the first Change's\n");
    assert.deepEqual(fs.readdirSync(path.dirname(at)), ["owned.txt"]);
  },
);

test(
  "two Changes may own the same relative path with different bytes, and neither overwrites the other",
  { tests: { requirement: ["changes-are-immutable-occurrences-beneath-their-lineage"] } },
  () => {
    const dir = scratch();
    assert.equal(birth(dir, "testing", "26/09/30/01").status, 0);
    assert.equal(birth(dir, "testing", "26/09/30/02").status, 0);
    const first = owned(dir, "26/09/30/01", "test/shared.txt", "from the first\n");
    const second = owned(dir, "26/09/30/02", "test/shared.txt", "from the second\n");
    const checked = validate(dir);
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(fs.readFileSync(first, "utf8"), "from the first\n");
    assert.equal(fs.readFileSync(second, "utf8"), "from the second\n");
  },
);
