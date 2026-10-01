import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { birthChange } from "../skills/managing-change/scripts/birth.js";
import { createDefect } from "../skills/managing-defects/scripts/create.js";
import { createRequirement } from "../skills/managing-requirements/scripts/create.js";
import { casesOf, casesTesting, suitesTesting } from "../skills/testing/scripts/graph.js";
import { DEFECT_DIR } from "./defects.js";
import { REQUIREMENT_DIR } from "./requirements.js";
import { kaalTestingGraph, TEST_DIR, testScopes } from "./testing.js";

// KAAL composes Changes, Testing, Requirements and Defects: children are born in later Changes and name earlier parents.
const repo = () => fs.mkdtempSync(path.join(os.tmpdir(), "kaal-testing-"));

const digest = (dir: string): Record<string, string> =>
  Object.fromEntries(
    (fs.readdirSync(dir, { recursive: true, withFileTypes: true }) as fs.Dirent[])
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name))
      .map((file) => [
        path.relative(dir, file).split(path.sep).join("/"),
        createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      ]),
  );

const CASE = 'import test from "node:test";\ntest("runs", () => {});\n';

test("KAAL's own Testing graph, whatever it holds, has no edge to a parent that does not exist", () => {
  assert.deepEqual(kaalTestingGraph().errors, []);
});

test("a later Change tests Requirements, a Defect, a Plan and a Suite born earlier, and changes none of them", () => {
  const dir = repo();
  const root = path.join(dir, "change");
  const first = birthChange({ root, lineage: "x", occurrence: "26/09/30/01" });
  createRequirement(path.join(first, REQUIREMENT_DIR), "holds-a", "A holds.");
  createRequirement(path.join(first, REQUIREMENT_DIR), "holds-b", "B holds.");
  createDefect(path.join(first, DEFECT_DIR), "broke-a", "A holds.", "A did not.");
  fs.mkdirSync(path.join(first, TEST_DIR));
  fs.writeFileSync(path.join(first, TEST_DIR, "regression.md"), "---\n---\n\nWhat must hold.\n");
  const plan = "change/x/26/09/30/01/test/regression.md";
  const born = digest(dir);
  assert.deepEqual(kaalTestingGraph(dir), { graph: { suites: [], cases: [] }, errors: [] });

  // The Suite is born in a second Change and names the Plan; the Case, in a third, names the Suite and what it tests.
  const second = birthChange({ root, lineage: "x", occurrence: "26/09/30/02" });
  fs.mkdirSync(path.join(second, TEST_DIR, "suite"), { recursive: true });
  fs.writeFileSync(
    path.join(second, TEST_DIR, "suite", "suite.json"),
    JSON.stringify({ concern: "A and B.", tests: [plan] }),
  );
  const third = birthChange({ root, lineage: "x", occurrence: "26/09/30/03" });
  fs.mkdirSync(path.join(third, TEST_DIR));
  const suite = "change/x/26/09/30/02/test/suite";
  fs.writeFileSync(
    path.join(third, TEST_DIR, "a.test.ts"),
    `// @tests suite ${suite}\n// @tests requirement holds-a\n// @tests requirement holds-b\n// @tests defect broke-a\n${CASE}`,
  );

  const { graph, errors } = kaalTestingGraph(dir);
  assert.deepEqual(errors, []);
  const kase = "change/x/26/09/30/03/test/a.test.ts";
  assert.deepEqual(suitesTesting(graph, plan), [suite]);
  assert.deepEqual(casesOf(graph, suite), [kase]);
  assert.deepEqual(casesTesting(graph, "requirement", "holds-a"), [kase]);
  assert.deepEqual(casesTesting(graph, "requirement", "holds-b"), [kase]);
  assert.deepEqual(casesTesting(graph, "defect", "broke-a"), [kase]);
  const after = digest(dir);
  for (const [file, hash] of Object.entries(born)) assert.equal(after[file], hash, file);
  assert.deepEqual(
    Object.keys(after)
      .filter((file) => !(file in born))
      .sort(),
    ["change/x/26/09/30/02/test/suite/suite.json", "change/x/26/09/30/03/test/a.test.ts"].sort(),
  );
});

test("a Case naming a Requirement or Defect KAAL does not hold, or one of the other kind, is refused", () => {
  const dir = repo();
  const root = path.join(dir, "change");
  const first = birthChange({ root, lineage: "x", occurrence: "26/09/30/01" });
  createRequirement(path.join(first, REQUIREMENT_DIR), "r", "It holds.");
  createDefect(path.join(first, DEFECT_DIR), "d", "It holds.", "It did not.");
  fs.mkdirSync(path.join(first, TEST_DIR));
  fs.writeFileSync(
    path.join(first, TEST_DIR, "a.test.ts"),
    `// @tests requirement d\n// @tests defect r\n// @tests requirement nobody\n${CASE}`,
  );
  assert.deepEqual(kaalTestingGraph(dir).errors, [
    'change/x/26/09/30/01/test/a.test.ts: tests requirement "d", which is no Requirement',
    'change/x/26/09/30/01/test/a.test.ts: tests requirement "nobody", which is no Requirement',
    'change/x/26/09/30/01/test/a.test.ts: tests defect "r", which is no Defect',
  ]);
});

test("a Change's scope for Testing is its occurrence's test directory, and only that", () => {
  const dir = repo();
  const root = path.join(dir, "change");
  birthChange({ root, lineage: "x", occurrence: "26/09/30/01" });
  birthChange({ root, lineage: "y", occurrence: "26/09/30/01" });
  assert.deepEqual(testScopes(dir), ["change/x/26/09/30/01/test", "change/y/26/09/30/01/test"]);
});
