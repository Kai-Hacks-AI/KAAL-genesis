import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { birthChange } from "./birth.js";
import { identity, readChanges } from "./changes.js";
import { changeData, MALFORMED_OCCURRENCES, scratchChanges, tree, UNPORTABLE_LINEAGES } from "./test-data.js";
import { validate } from "./validate.js";

const identities = (root: string) => readChanges(root).changes.map(identity);

test("births a first Change: its occurrence, empty, and nothing else", () => {
  const root = scratchChanges();
  const dir = birthChange({ root, lineage: "testing", occurrence: "26/09/30/01" });
  assert.equal(dir, path.join(root, "testing", "26", "09", "30", "01"));
  assert.deepEqual(tree(root), {
    "testing/": "",
    "testing/26/": "",
    "testing/26/09/": "",
    "testing/26/09/30/": "",
    "testing/26/09/30/01/": "",
  });
  assert.deepEqual(validate(root), []);
  assert.deepEqual(identities(root), ["testing/26/09/30/01"]);
});

test("births a second Change in the same lineage, leaving the first exactly as it was", () => {
  const root = scratchChanges("valid");
  const before = tree(root);
  birthChange({ root, lineage: "testing", occurrence: "26/10/01/02" });
  assert.deepEqual(tree(root), { ...before, "testing/26/10/01/02/": "" });
  assert.deepEqual(validate(root), []);
});

test("Changes own sparse, arbitrary subtrees, and the same path with different bytes in two Changes", () => {
  const root = changeData("valid");
  assert.deepEqual(validate(root), []);
  const [a, b] = ["01", "02"].map((cc) =>
    fs.readFileSync(path.join(root, `testing/26/09/30/${cc}/test/cases/foo.txt`), "utf8"),
  );
  assert.deepEqual([a, b], ["A\n", "B\n"]);
  // Sparse: no Change holds what another does, and none holds a required child.
  assert.deepEqual(fs.readdirSync(path.join(root, "testing/26/10/01/01")), ["learning"]);
  assert.deepEqual(fs.readdirSync(path.join(root, "change/26/09/30/01")), ["anything"]);
});

test("refuses to birth a Change again, leaving it and everything else as it was", () => {
  const root = scratchChanges("valid");
  const before = tree(root);
  assert.throws(
    () => birthChange({ root, lineage: "testing", occurrence: "26/09/30/01" }),
    /testing\/26\/09\/30\/01: already exists; a Change is never born again/,
  );
  assert.deepEqual(tree(root), before);
});

test("refuses unportable lineages and malformed occurrences before writing anything", () => {
  const root = scratchChanges();
  for (const lineage of UNPORTABLE_LINEAGES) {
    assert.throws(() => birthChange({ root, lineage, occurrence: "26/09/30/01" }), /^Error: lineage /, lineage);
  }
  for (const occurrence of MALFORMED_OCCURRENCES) {
    assert.throws(() => birthChange({ root, lineage: "testing", occurrence }), /^Error: occurrence /, occurrence);
  }
  assert.equal(fs.existsSync(root), false);
});

test("refuses to birth through a symlink, writing nothing through it", () => {
  const root = scratchChanges("valid");
  const outside = fs.mkdtempSync(path.join(path.dirname(root), "outside-"));
  // Built at run time because a symlink cannot be committed portably.
  fs.symlinkSync(outside, path.join(root, "linked"), "dir");
  assert.throws(() => birthChange({ root, lineage: "linked", occurrence: "26/09/30/01" }), /symlink in Change path/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

/**
 * Fault injection: creating the directory at `rel` beneath `root` fails. A
 * recursive creation passing through it first creates the levels above it, as
 * a real one does before it meets the failure.
 */
function failMkdirAt(t: TestContext, root: string, rel: string): void {
  const mkdir = fs.mkdirSync;
  const target = path.resolve(root, rel);
  t.mock.method(fs, "mkdirSync", (dir: fs.PathLike, options?: fs.MakeDirectoryOptions) => {
    const at = path.resolve(String(dir));
    if (at === target || (options?.recursive && at.startsWith(target + path.sep))) {
      if (options?.recursive) mkdir(path.dirname(target), options);
      throw new Error("mkdir failed on purpose");
    }
    return mkdir(dir, options);
  });
}

test("a birth that fails at any level removes every directory it created", (t) => {
  for (const rel of ["other", "other/26", "other/26/09", "other/26/09/30", "other/26/09/30/01"]) {
    const root = scratchChanges("valid");
    const before = tree(root);
    failMkdirAt(t, root, rel);
    assert.throws(
      () => birthChange({ root, lineage: "other", occurrence: "26/09/30/01" }),
      /mkdir failed on purpose/,
      rel,
    );
    t.mock.restoreAll();
    assert.deepEqual(tree(root), before, rel);
  }
});

test("a birth that loses a race for the same occurrence refuses, leaving the Change born beside it", (t) => {
  const root = scratchChanges("valid");
  const mkdir = fs.mkdirSync;
  const occurrence = path.resolve(root, "other/26/09/30/01");
  // Fault injection: another birth creates the same occurrence, and gives it
  // material, between this birth creating its levels and creating the occurrence.
  t.mock.method(fs, "mkdirSync", (dir: fs.PathLike, options?: fs.MakeDirectoryOptions) => {
    if (path.resolve(String(dir)) !== occurrence) return mkdir(dir, options);
    t.mock.restoreAll();
    birthChange({ root, lineage: "other", occurrence: "26/09/30/01" });
    fs.writeFileSync(path.join(occurrence, "owned.txt"), "theirs\n");
    return mkdir(dir, options);
  });
  assert.throws(() => birthChange({ root, lineage: "other", occurrence: "26/09/30/01" }), /already exists/);
  t.mock.restoreAll();
  assert.equal(tree(root)["other/26/09/30/01/owned.txt"], "theirs\n");
  assert.deepEqual(validate(root), []);
});

test("a birth that shares its levels with a Change born meanwhile beside it still births, leaving both", (t) => {
  const root = scratchChanges("valid");
  const mkdir = fs.mkdirSync;
  const lineage = path.resolve(root, "other");
  // Fault injection: another birth, of a sibling occurrence, creates the same
  // levels between this birth finding them missing and creating them.
  t.mock.method(fs, "mkdirSync", (dir: fs.PathLike, options?: fs.MakeDirectoryOptions) => {
    if (path.resolve(String(dir)) === lineage) {
      t.mock.restoreAll();
      birthChange({ root, lineage: "other", occurrence: "26/09/30/02" });
    }
    return mkdir(dir, options);
  });
  birthChange({ root, lineage: "other", occurrence: "26/09/30/01" });
  t.mock.restoreAll();
  assert.deepEqual(
    readChanges(root)
      .changes.map(identity)
      .filter((id) => id.startsWith("other/")),
    ["other/26/09/30/01", "other/26/09/30/02"],
  );
});

test("a birth refuses a level that appears meanwhile as a symlink, writing nothing through it", (t) => {
  const root = scratchChanges("valid");
  const before = tree(root);
  const outside = fs.mkdtempSync(path.join(path.dirname(root), "outside-"));
  const mkdir = fs.mkdirSync;
  const level = path.resolve(root, "other");
  // Fault injection: another process puts a symlink where this birth is about
  // to create a level, after the path was checked. Built at run time because a
  // symlink cannot be committed portably.
  t.mock.method(fs, "mkdirSync", (dir: fs.PathLike, options?: fs.MakeDirectoryOptions) => {
    if (path.resolve(String(dir)) === level && !fs.existsSync(level)) fs.symlinkSync(outside, level, "dir");
    return mkdir(dir, options);
  });
  assert.throws(() => birthChange({ root, lineage: "other", occurrence: "26/09/30/01" }), /symlink in Change path/);
  t.mock.restoreAll();
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.rmSync(level);
  assert.deepEqual(tree(root), before);
});

test("traversal is deterministic: lineages by name, each lineage's occurrences in sorted order, whatever order they were born in", () => {
  const expected = ["change/26/09/30/01", "testing/26/09/30/01", "testing/26/09/30/02", "testing/26/10/01/01"];
  assert.deepEqual(identities(changeData("valid")), expected);
  const root = scratchChanges();
  for (const id of [...expected].reverse()) {
    const [lineage, ...occurrence] = id.split("/");
    birthChange({ root, lineage, occurrence: occurrence.join("/") });
  }
  assert.deepEqual(identities(root), expected);
});

test("refuses everything at the levels Changes own that is not a Change, and still reads the Changes there", () => {
  const root = changeData("malformed");
  assert.deepEqual(validate(root), [
    'Other: lineage "Other" must be lowercase kebab-case (a-z, 0-9, single hyphens)',
    "README.md: not a lineage",
    'testing/26/09/30/00: occurrence "26/09/30/00" must count from 01',
    'testing/26/09/30/001: "001" must be two digits',
    "testing/26/09/stray.txt: not an occurrence level",
    'testing/26/13/01/01: occurrence "26/13/01/01" is not a calendar date',
  ]);
  assert.deepEqual(identities(root), ["testing/26/09/30/01"]);
});

test("refuses a level that leads to no Change, and a symlink anywhere a Change owns", () => {
  // Built at run time because git can commit neither an empty directory nor a portable symlink.
  const root = scratchChanges("valid");
  fs.mkdirSync(path.join(root, "testing/26/11"));
  fs.mkdirSync(path.join(root, "empty"));
  fs.symlinkSync(
    path.join(root, "testing/26/09/30/01/test/cases/foo.txt"),
    path.join(root, "testing/26/09/30/02/test/link.txt"),
  );
  assert.deepEqual(validate(root), [
    "empty: holds no Change",
    "testing/26/09/30/02/test/link.txt: a Change owns only files and directories",
    "testing/26/11: holds no Change",
  ]);
});

test("a Change holding nothing is valid, and a root not yet created holds no Changes", () => {
  const root = scratchChanges();
  assert.deepEqual(readChanges(root), { changes: [], errors: [] });
  birthChange({ root, lineage: "change", occurrence: "26/09/30/01" });
  assert.deepEqual(readChanges(root), { changes: [{ lineage: "change", occurrence: "26/09/30/01" }], errors: [] });
});
