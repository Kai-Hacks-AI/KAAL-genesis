import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { computeRegression } from "../skills/testing/scripts/regression.js";
import { kaalTestCases, testPlanProtecting } from "./test-cases.js";

// The sealed FAR checkpoints, oldest first. They were written when Authorise was
// called Acceptance and say so; sealing keeps them exactly as written. They are
// read here only to show that the equation still holds over them.
const HISTORY = [
  "change/far/26/09/25/01",
  "change/far/26/09/26/01",
  "change/far/26/09/26/02",
  "change/far/26/09/26/03",
];

// FAR-4 and later are written under the word Authorise, which is what Acceptance came to be called.
// Each lists what its hit newly protects, and what it authorises away.
const AUTHORISE = [
  {
    at: "change/far/26/09/30/01",
    previous: "change/far/26/09/26/03",
    feature: ["changes-are-immutable-occurrences-beneath-their-lineage", "closed-change-cannot-change-unnoticed"],
  },
  { at: "change/far/26/09/30/02", previous: "change/far/26/09/30/01", feature: [] },
];

const identities = (file: string): string[] =>
  fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));

test("history that says Acceptance still computes: its Acceptance is an Authorise, and each recorded Regression follows", () => {
  let previous: string[] | undefined;
  for (const at of HISTORY) {
    assert.match(fs.readFileSync(`${at}/acceptance.md`, "utf8"), /^# Acceptance\r?\n/, `${at} keeps its own word`);
    assert.equal(fs.existsSync(`${at}/authorise.md`), false, `${at} is history and is not renamed`);
    const result = computeRegression({
      ...(previous && { previous }),
      feature: identities(`${at}/feature.md`),
      authorise: identities(`${at}/acceptance.md`),
    });
    assert.ok("regression" in result, `${at}: ${"errors" in result ? result.errors.join("; ") : ""}`);
    assert.deepEqual(result.regression, identities(`${at}/regression.md`).sort(), at);
    previous = result.regression;
  }
  assert.equal(previous!.length, 12);
});

test("history written under Authorise computes: each Regression follows from the one before, its Feature and its Authorise", () => {
  for (const { at, previous, feature } of AUTHORISE) {
    assert.match(fs.readFileSync(`${at}/authorise.md`, "utf8"), /^# Authorise\r?\n/, at);
    assert.equal(fs.existsSync(`${at}/acceptance.md`), false, at);
    const result = computeRegression({
      previous: identities(`${previous}/regression.md`),
      feature: identities(`${at}/feature.md`),
      authorise: identities(`${at}/authorise.md`),
    });
    assert.ok("regression" in result, `${at}: ${"errors" in result ? result.errors.join("; ") : ""}`);
    assert.deepEqual(result.regression, identities(`${at}/regression.md`).sort(), at);
    assert.deepEqual(identities(`${at}/feature.md`), feature, at);
    assert.deepEqual(identities(`${at}/authorise.md`), [], at);
  }
});

test("each Plan written under Authorise is exactly what its Regression derives from the Test Cases: made again, it is the same bytes", () => {
  const { cases, errors } = kaalTestCases();
  assert.deepEqual(errors, []);
  // FAR-1's Suite and its twelve Carriers are untouched, yet the Carrier whose Test Cases FAR-4 superseded is not run.
  const stale = "change/far/26/09/26/01/test/genesis/changes-checked-against-seals-of-target-branch.test.ts";
  assert.equal(fs.existsSync(stale), true);
  for (const { at } of AUTHORISE) {
    const derived = testPlanProtecting(cases, "requirement", identities(`${at}/regression.md`));
    assert.ok("plan" in derived, `${at}: ${"errors" in derived ? derived.errors.join("; ") : ""}`);
    assert.equal(fs.readFileSync(`${at}/runs/01/plan.md`, "utf8"), derived.plan, at);
    assert.equal(derived.carriers.includes(stale), false, at);
    assert.equal(derived.carriers.length, 14, at);
  }
});
