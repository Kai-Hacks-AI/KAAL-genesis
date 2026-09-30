import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { birthChange, birthOccurrence, changeErrors, changes } from "./change.js";
import { entries, kaal, scratchChange } from "./test-data.js";

/** Every entry under a root with its kind and, for a file, its bytes, so any change to what is there is seen. */
function snapshot(root: string): Record<string, string> {
  return Object.fromEntries(
    entries(root).map((entry) => {
      const file = entry.replace(/ \(file\)$/, "");
      return [entry, file === entry ? "" : fs.readFileSync(path.join(root, file)).toString("base64")];
    }),
  );
}

// Why: requirements/change-occurrences/requirement.md
test("a lineage holds many Change occurrences, each born after the last at an identity of its own", () => {
  const root = scratchChange();
  assert.deepEqual(
    ["testing", "testing", "genesis", "testing"].map((lineage) => birthChange(root, lineage)),
    ["testing/1", "testing/2", "genesis/1", "testing/3"],
  );
  assert.deepEqual(changeErrors(root), []);
  assert.deepEqual(changes(root), ["genesis/1", "testing/1", "testing/2", "testing/3"]);
});

// Why: requirements/change-occurrences/requirement.md
test("birthing a Change changes nothing already born, and a later Change may own the same relative path with other bytes", () => {
  const root = scratchChange("born");
  const earlier = path.join(root, "testing", "1");
  const before = snapshot(earlier);
  assert.equal(birthChange(root, "testing"), "testing/2");
  assert.deepEqual(snapshot(earlier), before);

  const later = path.join(root, "testing", "2", "test", "scripts", "foo.test.ts");
  fs.mkdirSync(path.dirname(later), { recursive: true });
  fs.writeFileSync(later, "// Owned by the second Change of testing: other bytes, the same relative path.\n");
  assert.deepEqual(snapshot(earlier), before);
  assert.notDeepEqual(fs.readFileSync(later), fs.readFileSync(path.join(earlier, "test", "scripts", "foo.test.ts")));
  assert.deepEqual(changeErrors(root), []);
  assert.deepEqual(changes(root), ["testing/1", "testing/2"]);
});

// Why: requirements/change-occurrences/requirement.md
test("an occurrence is born once: birthing it again, or before a later one, is refused and changes nothing", () => {
  const root = scratchChange("born");
  assert.equal(birthChange(root, "testing"), "testing/2");
  const before = snapshot(root);
  assert.throws(() => birthOccurrence(root, "testing", "2"), /change\/testing\/2 is already born/);
  assert.throws(() => birthOccurrence(root, "testing", "1"), /change\/testing\/1 is not later than testing\/2/);
  assert.deepEqual(snapshot(root), before);
});

// Why: requirements/change-occurrences/requirement.md
test("a Change is never born under a lineage or occurrence name that is not portable, and nothing is created", () => {
  const root = scratchChange();
  const lineages = [
    "Testing",
    "con",
    "nul",
    "com1",
    "lpt9",
    "kaal/testing",
    "kaal\\testing",
    "..",
    "",
    "a--b",
    "-a",
    "a-",
    "testing.",
    "under_score",
    "tést",
  ];
  for (const lineage of lineages) {
    assert.throws(() => birthChange(root, lineage), /must be lowercase kebab-case|is reserved on Windows/, lineage);
    assert.throws(
      () => birthOccurrence(root, lineage, "1"),
      /must be lowercase kebab-case|is reserved on Windows/,
      lineage,
    );
  }
  for (const occurrence of ["0", "01", "a", "1.0", "-1", "", "1 ", "1/2", "٣"])
    assert.throws(() => birthOccurrence(root, "testing", occurrence), /must be a positive integer/, occurrence);
  assert.equal(fs.existsSync(root), false);
});

// Why: requirements/change-occurrences/requirement.md
test("a Change tree holds nothing but lineages and their occurrences, and is refused where it holds anything else", () => {
  const root = scratchChange("malformed");
  // Links are made while the case runs; a junction needs no privilege on Windows.
  fs.symlinkSync(path.join(root, "testing", "3"), path.join(root, "testing", "4"), "junction");
  fs.symlinkSync(path.join(root, "testing"), path.join(root, "linked"), "junction");
  assert.deepEqual(changeErrors(root), [
    'change/Lineage: lineage "Lineage" must be lowercase kebab-case (a-z, 0-9, single hyphens)',
    "change/linked: a lineage must be a directory",
    'change/stray.md: lineage "stray.md" must be lowercase kebab-case (a-z, 0-9, single hyphens)',
    'change/testing/01: occurrence "01" must be a positive integer without leading zeros',
    "change/testing/2: an occurrence must be a directory",
    "change/testing/4: an occurrence must be a directory",
    'change/testing/one: occurrence "one" must be a positive integer without leading zeros',
    'change/under_score: lineage "under_score" must be lowercase kebab-case (a-z, 0-9, single hyphens)',
  ]);
  assert.throws(() => changes(root));
  assert.throws(() => birthChange(root, "testing"), /change\/testing\/01/);

  const file = scratchChange();
  fs.writeFileSync(file, "a Change tree that is a file\n");
  assert.deepEqual(changeErrors(file), ["change: must be a directory"]);
});

// Why: requirements/change-occurrences/requirement.md
test("a Change is born empty, owns only what is placed beneath it, and is valid however sparse", () => {
  const root = scratchChange();
  assert.equal(birthChange(root, "testing"), "testing/1");
  assert.deepEqual(entries(root), ["testing (directory)", "testing/1 (directory)"]);
  assert.deepEqual(changeErrors(root), []);
  assert.deepEqual(changes(root), ["testing/1"]);

  fs.mkdirSync(path.join(root, "testing", "1", "test"));
  fs.writeFileSync(path.join(root, "testing", "1", "test", "only.txt"), "only what this Change produced\n");
  assert.deepEqual(changeErrors(root), []);
  assert.deepEqual(changes(root), ["testing/1"]);
});

// Why: requirements/change-occurrences/requirement.md
test("what a Change owns is neither read nor judged by the Change tree", () => {
  const root = scratchChange("uninterpreted");
  assert.deepEqual(changeErrors(root), []);
  assert.deepEqual(changes(root), ["testing/1"]);
  assert.equal(birthChange(root, "testing"), "testing/2");
});

// Why: requirements/change-occurrences/requirement.md
test("Change occurrences are traversed in one order, from the files alone: lineages by name, occurrences by birth", () => {
  const root = scratchChange();
  const born = [
    birthChange(root, "b"),
    ...Array.from({ length: 10 }, () => birthChange(root, "a")),
    birthChange(root, "a-b"),
  ];
  assert.equal(born.at(-2), "a/10");
  const order = ["a/1", "a/2", "a/3", "a/4", "a/5", "a/6", "a/7", "a/8", "a/9", "a/10", "a-b/1", "b/1"];
  assert.deepEqual(changes(root), order);
  assert.deepEqual(changes(root), order);
});

/** The subject of the case about KAAL itself. */
const KAAL = kaal();

// Why: requirements/change-occurrences/requirement.md
test("KAAL keeps its Changes in change/, and holds nothing out of place there", () => {
  const root = path.join(KAAL, "change");
  assert.ok(fs.lstatSync(root, { throwIfNoEntry: false })?.isDirectory(), "change/ is missing");
  assert.deepEqual(changeErrors(root), []);
});
