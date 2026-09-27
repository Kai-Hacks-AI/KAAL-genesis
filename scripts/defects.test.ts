import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { defectErrors, readDefects } from "../skills/managing-defects/scripts/defects.js";
import { caseFiles } from "./links.js";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const DEFECTS = path.join(REPO, "defects");

// Why: brain/learning/genesis/26/09/27/02/nodes/managing-defects.md
test("KAAL keeps its defects in defects/, each a complete record of what was observed not to hold", () => {
  assert.deepEqual(defectErrors(DEFECTS), []);
  // What should hold is named by the place it is stated where it has one, so such a place must exist.
  for (const defect of readDefects(DEFECTS)) {
    const place = /`([^`]+)`/.exec(defect.holds)?.[1];
    if (place) assert.ok(fs.existsSync(path.join(REPO, place)), `${defect.name}: ${place} does not exist`);
  }
});

/** A line meant to say a case tests a defect, strictly written or not: any line comment that starts with "Tests". */
const TESTS_LIKE = /^\s*\/\/\s*tests\b/i;
const TESTS = /^\/\/ Tests: defects\/(\S+)$/;

// Why: brain/learning/genesis/26/09/27/02/nodes/managing-defects.md
test("a case of KAAL's that tests a defect points at it, directly above the case, and the defect is one KAAL records", () => {
  const recorded = new Set(readDefects(DEFECTS).map((d) => d.name));
  const errors: string[] = [];
  for (const file of caseFiles(REPO)) {
    const lines = fs.readFileSync(path.join(REPO, file), "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!TESTS_LIKE.test(line)) return;
      const at = `${file}:${i + 1}`;
      // A skill's case points at nothing outside its skill, so only KAAL's own cases point at KAAL's defects.
      if (file.startsWith("skills/")) return errors.push(`${at}: a skill's case points at nothing outside its skill`);
      const defect = TESTS.exec(line)?.[1];
      if (!defect) return errors.push(`${at}: written as "// Tests: defects/<name>"`);
      if (!recorded.has(defect)) errors.push(`${at}: defects/${defect} is not a defect KAAL records`);
      let next = i + 1;
      while (next < lines.length && /^\/\/ (Tests|Why): /.test(lines[next]!)) next++;
      if (!/^test\(/.test(lines[next] ?? "")) errors.push(`${at}: belongs to no case`);
      return undefined;
    });
  }
  assert.deepEqual(errors, []);
});
