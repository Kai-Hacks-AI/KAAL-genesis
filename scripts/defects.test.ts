import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { defectErrors, readDefects } from "../skills/managing-defects/scripts/defects.js";

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

// A case is named by its test file and its name, as KAAL addresses a case now.
// Why: brain/learning/genesis/26/09/27/02/nodes/managing-defects.md
test("every case a defect of KAAL's names as testing it is a case KAAL holds", () => {
  for (const defect of readDefects(DEFECTS))
    for (const tested of defect.testedBy) {
      const [, file, name] = /^`([^`]+)`: (.+)$/.exec(tested) ?? [];
      assert.ok(file && name, `${defect.name}: ${tested} is not named as \`<test file>\`: <case>`);
      const at = path.join(REPO, file);
      assert.ok(fs.existsSync(at), `${defect.name}: ${file} does not exist`);
      assert.ok(fs.readFileSync(at, "utf8").includes(`test(${JSON.stringify(name)}`), `${defect.name}: ${tested}`);
    }
});
