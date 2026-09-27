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
