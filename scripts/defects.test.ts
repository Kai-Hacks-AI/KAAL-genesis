import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { defectErrors, readDefects } from "../skills/managing-defects/scripts/defects.js";
import { testedDefects } from "./links.js";
import { regressionErrors } from "./regression.js";
import { kaal, regressionCandidate, regressionTrusted } from "./test-data.js";

/** The subject of this file's cases about KAAL itself. */
const KAAL = kaal();
const DEFECTS = path.join(KAAL, "defects");

// Why: brain/learning/genesis/26/09/27/02/nodes/managing-defects.md
test("KAAL keeps its defects in defects/, each a complete record of what was observed not to hold", () => {
  // A missing defects/ is not an empty one: it would lose every defect KAAL records.
  assert.ok(fs.lstatSync(DEFECTS, { throwIfNoEntry: false })?.isDirectory(), "defects/ is missing");
  assert.deepEqual(defectErrors(DEFECTS), []);
  // What should hold is named by the place it is stated where it has one, so such a place must exist.
  for (const defect of readDefects(DEFECTS)) {
    const place = /`([^`]+)`/.exec(defect.holds)?.[1];
    if (place) assert.ok(fs.existsSync(path.join(KAAL, place)), `${defect.name}: ${place} does not exist`);
  }
});

// Why: brain/learning/genesis/26/09/27/02/nodes/managing-defects.md
test("a case of KAAL's that tests a defect points at it, among its links, and the defect is one KAAL records", () => {
  const recorded = new Set(readDefects(DEFECTS).map((d) => `defects/${d.name}`));
  const { tested, stray } = testedDefects(KAAL);
  const errors = stray.map((at) => `${at}: belongs to no case, written as "// Tests: defects/<name>"`);
  for (const { file, title, defects } of tested) {
    // A skill's case points at nothing outside its skill, so only KAAL's own cases point at KAAL's defects.
    if (file.startsWith("skills/")) errors.push(`${file}: "${title}" is a skill's case, so it points at no defect`);
    else
      for (const defect of defects.filter((d) => !recorded.has(d)))
        errors.push(`${file}: "${title}" points at ${defect}, which is not a defect KAAL records`);
  }
  assert.deepEqual(errors, []);
});

// A Tests: line is read as the case's own link, so it lives and dies with the case the trusted regression holds to running.
// Why: brain/learning/genesis/26/09/27/02/nodes/managing-defects.md
// Why: brain/learning/genesis/26/09/27/03/nodes/case.md
test("a case that says it tests a defect but does not run, such as one inside a block comment, is refused", () => {
  const candidate = regressionCandidate("tested-ghost");
  assert.deepEqual(testedDefects(candidate).tested, [
    { file: "scripts/cases.test.ts", title: "ghost", defects: ["defects/adds-wrong"] },
  ]);
  assert.deepEqual(regressionErrors(regressionTrusted(), candidate, "b".repeat(64)), [
    'as the next accepted regression, scripts/cases.test.ts: "ghost" is named but does not run',
  ]);
});
