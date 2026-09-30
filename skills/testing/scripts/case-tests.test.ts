import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { casesTesting, parseTests, readCaseTests, type CaseTests } from "./case-tests.js";

const CODE = 'import test from "node:test";\ntest("passes", () => {});\n';

test("a Case states what it tests in its header: one reference per line, each a kind and an id, in order", () => {
  const text = `#!/usr/bin/env node
// Why this Case exists is prose and states nothing.
// @tests requirement works-offline
//@tests   defect\tcheck-leaves-directory

// @tests requirement survives-restart
${CODE}`;
  assert.deepEqual(parseTests(text, "a.test.ts"), {
    tests: [
      { kind: "requirement", id: "works-offline" },
      { kind: "defect", id: "check-leaves-directory" },
      { kind: "requirement", id: "survives-restart" },
    ],
    errors: [],
  });
});

test("a Case may test many things, and a Case that states nothing tests nothing Testing knows of", () => {
  assert.deepEqual(parseTests(CODE, "a.test.ts"), { tests: [], errors: [] });
  assert.deepEqual(parseTests("", "a.test.ts"), { tests: [], errors: [] });
});

test("references are read through a byte order mark and CRLF line endings", () => {
  assert.deepEqual(parseTests(`﻿// @tests requirement a\r\n// @tests defect b\r\n${CODE}`, "a.test.ts").tests, [
    { kind: "requirement", id: "a" },
    { kind: "defect", id: "b" },
  ]);
});

test("only the header states references: a later @tests line is not one", () => {
  const text = `${CODE}// @tests requirement late\n`;
  assert.deepEqual(parseTests(text, "a.test.ts"), { tests: [], errors: [] });
  assert.deepEqual(parseTests(`// @tests requirement a\nconst x = 1; // @tests defect b\n`, "a.test.ts").tests, [
    { kind: "requirement", id: "a" },
  ]);
});

test("refuses a malformed reference, naming its line", () => {
  const text =
    "// @tests\n// @tests requirement\n// @tests requirement a b\n// @tests-not-a-reference\n// @testsrequirement a\n";
  assert.deepEqual(parseTests(text, "a.test.ts"), {
    tests: [],
    errors: [
      'a.test.ts:1: a reference must be "// @tests <kind> <id>"',
      'a.test.ts:2: a reference must be "// @tests <kind> <id>"',
      'a.test.ts:3: a reference must be "// @tests <kind> <id>"',
    ],
  });
});

test("refuses a reference stated twice, deterministically: the first stands, each repeat is an error", () => {
  const text = "// @tests requirement a\n// @tests defect a\n// @tests requirement a\n// @tests requirement a\n";
  assert.deepEqual(parseTests(text, "a.test.ts"), {
    tests: [
      { kind: "requirement", id: "a" },
      { kind: "defect", id: "a" },
    ],
    errors: ['a.test.ts:3: tests requirement "a" twice', 'a.test.ts:4: tests requirement "a" twice'],
  });
});

test("reads a Case from its file, and says when it cannot", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "case-tests-"));
  const file = path.join(dir, "a.test.ts");
  fs.writeFileSync(file, `// @tests requirement a\n${CODE}`);
  assert.deepEqual(readCaseTests(file), { tests: [{ kind: "requirement", id: "a" }], errors: [] });
  const missing = readCaseTests(path.join(dir, "none.test.ts"), "none.test.ts");
  assert.deepEqual(missing.tests, []);
  assert.match(missing.errors[0], /^none\.test\.ts: unreadable case \(/);
});

test("the Cases testing something are computed from the Cases alone, with many Cases for one identity", () => {
  const cases: CaseTests[] = [
    { case: "s/a.test.ts", tests: [{ kind: "requirement", id: "r" }] },
    { case: "s/b.test.ts", tests: [{ kind: "defect", id: "r" }] },
    {
      case: "s/c.test.ts",
      tests: [
        { kind: "requirement", id: "r" },
        { kind: "requirement", id: "q" },
      ],
    },
    { case: "s/d.test.ts", tests: [] },
  ];
  assert.deepEqual(casesTesting(cases, "requirement", "r"), ["s/a.test.ts", "s/c.test.ts"]);
  assert.deepEqual(casesTesting(cases, "defect", "r"), ["s/b.test.ts"]);
  assert.deepEqual(casesTesting(cases, "requirement", "q"), ["s/c.test.ts"]);
  assert.deepEqual(casesTesting(cases, "requirement", "none"), []);
  assert.deepEqual(casesTesting([], "requirement", "r"), []);
});

test("Testing keeps no reverse registry and stays independent of Requirements and Defects", () => {
  const scripts = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  for (const name of fs.readdirSync(scripts).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
    const source = fs.readFileSync(path.join(scripts, name), "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(
      imports.filter((i) => /managing-|requirement|defect/i.test(i)),
      [],
      name,
    );
    if (name === "case-tests.ts")
      assert.doesNotMatch(source, /writeFileSync|writeFile\(/, "reading references writes nothing");
  }
  assert.deepEqual(
    fs.readdirSync(scripts).filter((n) => /index|registry|reverse/i.test(n)),
    [],
  );
});
