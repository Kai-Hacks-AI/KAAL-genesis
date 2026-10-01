import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { computeRegression } from "../skills/testing/scripts/regression.js";

// The sealed FAR checkpoints, oldest first. They were written when Authorise was
// called Acceptance and say so; sealing keeps them exactly as written. They are
// read here only to show that the equation still holds over them.
const HISTORY = [
  "change/far/26/09/25/01",
  "change/far/26/09/26/01",
  "change/far/26/09/26/02",
  "change/far/26/09/26/03",
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
