import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { casesOf, casesTesting, readCaseEdges, readGraph, suitesTesting, type Known } from "./graph.js";
import { rootData } from "./test-data.js";
import { readPlan, readSuite } from "./testing.js";

// Testing knows a Requirement or a Defect only as an identity a Case names: which exist is for the using system.
const KNOWN: Known = { requirements: ["works-offline", "keeps-data"], defects: ["lost-data"] };
const SCOPES = ["cases", "suites"];

test("a Case's reference to a Requirement or a Defect is found, and its reverse is computed from the Cases", () => {
  const { graph, errors } = readGraph(rootData("graph"), SCOPES, KNOWN);
  assert.deepEqual(errors, []);
  assert.deepEqual(casesTesting(graph, "requirement", "works-offline"), ["cases/one.test.ts", "cases/two.test.ts"]);
  assert.deepEqual(casesTesting(graph, "requirement", "keeps-data"), ["cases/one.test.ts"]);
  assert.deepEqual(casesTesting(graph, "defect", "lost-data"), ["cases/one.test.ts", "cases/three.test.ts"]);
  assert.deepEqual(casesTesting(graph, "requirement", "lost-data"), [], "a Defect id is not a Requirement id");
  assert.deepEqual(casesTesting(graph, "defect", "works-offline"), []);
});

test("a Suite states the Plans it tests, a Case the Suites it tests, and their reverses are computed", () => {
  const { graph, errors } = readGraph(rootData("graph"), SCOPES, KNOWN);
  assert.deepEqual(errors, []);
  assert.deepEqual(suitesTesting(graph, "plans/plan.md"), ["suites/contained", "suites/runnable"]);
  assert.deepEqual(suitesTesting(graph, "plans/other.md"), ["suites/contained"]);
  assert.deepEqual(suitesTesting(graph, "plans/unnamed.md"), []);
  assert.deepEqual(casesOf(graph, "suites/runnable"), ["cases/one.test.ts", "cases/two.test.ts"]);
});

test("a Case contained in a Suite that also names it is one Case of it, and containment still makes a Case", () => {
  const { graph } = readGraph(rootData("graph"), SCOPES, KNOWN);
  assert.deepEqual(casesOf(graph, "suites/contained"), [
    "suites/contained/both.test.ts",
    "suites/contained/held.test.ts",
  ]);
});

test("only the leading comment lines of a Case are its header, and prose beside a tag is never read", () => {
  const { graph } = readGraph(rootData("graph"), SCOPES, KNOWN);
  assert.deepEqual(casesTesting(graph, "requirement", "ignored-beyond-the-header"), []);
  assert.deepEqual(
    graph.cases.find((c) => c.place === "cases/bare.test.ts"),
    { place: "cases/bare.test.ts", suites: [], requirements: [], defects: [] },
  );
  const read = (text: string) => readCaseEdges(text, "c.test.ts");
  assert.deepEqual(read("#!/usr/bin/env node\n// @tests defect d\n").edges.defect, ["d"]);
  assert.deepEqual(read("﻿// @tests defect d\r\n// @tests requirement r\r\n").edges, {
    suite: [],
    requirement: ["r"],
    defect: ["d"],
  });
  assert.deepEqual(read("//@tests defect d\n//   @tests   defect   e  \n").edges.defect, ["d", "e"]);
  assert.deepEqual(read("// @testsnot defect d\n// tests defect d\n").edges, {
    suite: [],
    requirement: [],
    defect: [],
  });
  assert.deepEqual(read("\n// @tests defect d\n").edges.defect, [], "a blank line ends the header");
});

test("a Suite may be born before its Case and is found; run as a Suite it still holds no Case", () => {
  const root = rootData("graph");
  const { graph, errors } = readGraph(root, ["suites/runnable"], KNOWN);
  assert.deepEqual(errors, []);
  assert.deepEqual(graph, { suites: [{ place: "suites/runnable", tests: ["plans/plan.md"] }], cases: [] });
  assert.deepEqual(readSuite(root, "suites/runnable").errors, ["suites/runnable: holds no Case"]);
});

test("a Suite that tests a Plan is still run as before: the Plan that lists it collects it and the Cases beneath it", () => {
  const root = rootData("graph");
  assert.deepEqual(readSuite(root, "suites/contained").errors, []);
  assert.deepEqual(readSuite(root, "suites/contained").suite?.cases, ["both.test.ts", "held.test.ts"]);
});

test("a Plan born without naming a Suite is a Plan", () => {
  for (const name of ["plan", "other"]) {
    const read = readPlan(path.join(rootData("graph"), "plans", `${name}.md`));
    assert.deepEqual(read.errors, []);
    assert.deepEqual(read.plan?.suites, []);
  }
});

test("a reference to a parent that does not exist, or a malformed or repeated one, is refused", () => {
  const { graph, errors } = readGraph(rootData("graph-broken"), SCOPES, KNOWN);
  const header = (line: string) =>
    `cases/refused.test.ts: "${line}" must be "// @tests <suite|requirement|defect> <identity>"`;
  assert.deepEqual(errors, [
    'cases/refused.test.ts: suite "../up" must be a relative posix path beneath the root',
    'cases/refused.test.ts: requirement "works-offline" is tested twice',
    header("// @tests thing x"),
    header("// @tests requirement"),
    header("// @tests defect a b"),
    'cases/refused.test.ts: tests suite "suites/missing", which is no Suite',
    'cases/refused.test.ts: tests requirement "unknown-one", which is no Requirement',
    'cases/refused.test.ts: tests defect "unknown-two", which is no Defect',
    'suites/lonely: tests plan "plans/missing.md", which is no Plan',
    'suites/lonely: tests plan "plans/not-a-plan.md", which is no Plan',
    'suites/twice/suite.json: plan "plans/plan.md" is tested twice',
  ]);
  assert.equal(graph.cases.length, 1);
  // What the using system does not know is refused even when the Case names it.
  assert.ok(readGraph(rootData("graph"), SCOPES, { requirements: [], defects: [] }).errors.length > 0);
});

test("a scope that does not exist holds nothing, one that is no directory is refused, and overlapping scopes count a place once", () => {
  const root = rootData("graph");
  assert.deepEqual(readGraph(root, ["nowhere"], KNOWN), { graph: { suites: [], cases: [] }, errors: [] });
  assert.deepEqual(readGraph(root, ["plans/plan.md"], KNOWN).errors, ["plans/plan.md: not a directory"]);
  assert.deepEqual(readGraph(root, ["/abs"], KNOWN).errors, [
    'scope "/abs" must be a relative posix path beneath the root',
  ]);
  const once = readGraph(root, ["suites"], KNOWN).graph;
  const twice = readGraph(root, ["suites", "suites/runnable", "suites"], KNOWN).graph;
  assert.deepEqual(twice, once);
});

const digest = (dir: string): Record<string, string> =>
  Object.fromEntries(
    (fs.readdirSync(dir, { recursive: true, withFileTypes: true }) as fs.Dirent[])
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name))
      .map((file) => [path.relative(dir, file), createHash("sha256").update(fs.readFileSync(file)).digest("hex")]),
  );

test("children are born later, each naming what already exists, and no parent is ever written to", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "testing-graph-"));
  const write = (place: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, place)), { recursive: true });
    fs.writeFileSync(path.join(root, place), text, { flag: "wx" });
  };
  const CASE = 'import test from "node:test";\ntest("runs", () => {});\n';
  // The parents are born first: Requirements and a Defect the Testing skill never reads, and a Plan.
  write("requirement/a.md", "---\nid: a\n---\n\nA.\n");
  write("requirement/b.md", "---\nid: b\n---\n\nB.\n");
  write("defect/d.md", "---\nid: d\nholds: D.\n---\n\nObserved.\n");
  write("plan.md", "---\ntitle: P\n---\n\nP.\n");
  const known: Known = { requirements: ["a", "b"], defects: ["d"] };
  const born = digest(root);
  assert.deepEqual(readGraph(root, ["t"], known), { graph: { suites: [], cases: [] }, errors: [] });
  // A Suite is born later and names the Plan; a Case later still names the Suite and what it tests.
  write("t/s1/suite.json", '{ "concern": "C.", "tests": ["plan.md"] }');
  write("t/c1.test.ts", `// @tests suite t/s1\n// @tests requirement a\n${CASE}`);
  // N relationships: a second Suite for the same Plan, a second Case for the same Requirement, one Case for many.
  write("t/s2/suite.json", '{ "concern": "C.", "tests": ["plan.md"] }');
  write(
    "t/c2.test.ts",
    `// @tests suite t/s1\n// @tests suite t/s2\n// @tests requirement a\n// @tests requirement b\n// @tests defect d\n${CASE}`,
  );
  const { graph, errors } = readGraph(root, ["t"], known);
  assert.deepEqual(errors, []);
  assert.deepEqual(suitesTesting(graph, "plan.md"), ["t/s1", "t/s2"]);
  assert.deepEqual(casesOf(graph, "t/s1"), ["t/c1.test.ts", "t/c2.test.ts"]);
  assert.deepEqual(casesOf(graph, "t/s2"), ["t/c2.test.ts"]);
  assert.deepEqual(casesTesting(graph, "requirement", "a"), ["t/c1.test.ts", "t/c2.test.ts"]);
  assert.deepEqual(casesTesting(graph, "requirement", "b"), ["t/c2.test.ts"]);
  assert.deepEqual(casesTesting(graph, "defect", "d"), ["t/c2.test.ts"]);
  // Every parent is byte for byte what it was, and the only new files are the children.
  const after = digest(root);
  for (const [file, hash] of Object.entries(born)) assert.equal(after[file], hash, file);
  assert.deepEqual(
    Object.keys(after)
      .filter((file) => !(file in born))
      .sort(),
    ["t/c1.test.ts", "t/c2.test.ts", "t/s1/suite.json", "t/s2/suite.json"],
  );
  // Reading the graph wrote nothing: there is no registry for it to write to.
  assert.deepEqual(digest(root), after);
});
