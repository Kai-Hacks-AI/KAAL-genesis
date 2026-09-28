import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acceptance, acceptancePlan, named } from "./acceptance.js";
import { newPromises } from "./feature.js";
import { PLAN } from "./links.js";
import { layeredState } from "./test-data.js";

const BY_NAME = "requirements/greets-by-name/requirement.md";
const GREETING = "brain/learning/k/26/01/01/01/nodes/greeting.md";
/** The accepted state these cases give up from: adding, greeting and greeting by name, on Linux and Windows, served by a suite. */
const PROTECTED = ["feature/promised", "acceptance/protected"];
const accepted = () => layeredState(...PROTECTED);
const candidate = (...layers: string[]) => layeredState(...PROTECTED, ...layers);
const REQUIRED = [
  "commitment: src/add.ts",
  `commitment: ${GREETING}`,
  `commitment: ${BY_NAME}`,
  "suite: suites/plain.md",
  "proof: the seal checks",
];
const greetsFails = /inherited case not excluded: scripts\/cases\.test\.ts: "greets" failed/;

// Why: requirements/inherited-reductions/requirement.md
test("a candidate that gives up nothing holds the Acceptance Test Plan while every inherited case passes against it, whatever its own plan says", () => {
  const now = accepted();
  // A refactoring, a new promise, and a plan of its own that no longer requires Windows: none gives anything up.
  for (const layers of [["feature/refactored"], ["acceptance/extended"], ["acceptance/windowless"]])
    assert.deepEqual(
      acceptance(now, candidate(...layers)),
      { excluded: [], requires: REQUIRED, errors: [] },
      layers[0],
    );
  // What the accepted plan requires stays required under the conditions it states, whatever the candidate's says.
  const { requires } = acceptancePlan(now, []);
  assert.ok(requires.every((r) => r.kind === "proof" || r.under.some((c) => c.platform === "win32")));
});

// Why: requirements/inherited-reductions/requirement.md
// Why: requirements/accepted-reductions/requirement.md
test("silence retains: an inherited case that no longer holds is refused unless the candidate excludes it, even where an old record once did", () => {
  const withdrawn = ["regression/candidates/withdrawn"];
  assert.match(acceptance(accepted(), candidate(...withdrawn)).errors.join("\n"), greetsFails);
  // A record the accepted state already holds is history: it gave up a case of an earlier regression, not of this one.
  const history = candidate("acceptance/history");
  assert.match(acceptance(history, candidate("acceptance/history", ...withdrawn)).errors.join("\n"), greetsFails);
  // An accepted regression without a plan still hands down every case it keeps.
  const planless = accepted();
  fs.rmSync(path.join(planless, PLAN));
  assert.match(acceptance(planless, candidate(...withdrawn)).errors.join("\n"), greetsFails);
});

// Why: requirements/accepted-reductions/requirement.md
test("an excluded inherited case is given up, and a commitment only once every case of it is excluded", () => {
  const now = accepted();
  const result = acceptance(now, candidate("regression/candidates/withdrawn", "acceptance/excludes-greets"));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.excluded.map((a) => [named(a.exclusion), a.record]),
    [['case: scripts/cases.test.ts: "greets"', "acceptance/stop-greeting-with-hello.md"]],
  );
  assert.deepEqual(
    result.requires,
    REQUIRED.filter((r) => r !== `commitment: ${GREETING}`),
  );
  // Where its cases alone show adding, excluding one of its two cases gives up that case, never adding.
  const byCases = layeredState("feature/promised");
  const once = acceptance(
    byCases,
    layeredState("feature/promised", "feature/refactored", "acceptance/excludes-adding-once"),
  );
  assert.deepEqual([once.errors, once.requires.includes("commitment: src/add.ts")], [[], true]);
  // Where the seal checks show it too, excluding every case of it still keeps adding, shown by them.
  const sealed = acceptance(now, candidate("feature/refactored", "acceptance/excludes-adding"));
  assert.deepEqual([sealed.errors, sealed.requires], [[], REQUIRED]);
  // Excluding a suite gives up that requirement, never the cases that show what they help prove.
  const unplain = acceptance(now, candidate("acceptance/excludes-plain"));
  assert.deepEqual([unplain.errors, unplain.requires], [[], REQUIRED.filter((r) => r !== "suite: suites/plain.md")]);
});

// Why: requirements/accepted-reductions/requirement.md
test("a replacement is two decisions: Feature names what the candidate newly promises, Acceptance only what it gives up", () => {
  const now = accepted();
  const successor = "brain/learning/k/26/01/02/01/nodes/greeting.md";
  const [without, withRecord] = [
    candidate("regression/candidates/replaced"),
    candidate("regression/candidates/replaced", "acceptance/excludes-greets"),
  ];
  // Feature names the successor whether or not the case of what it replaces is given up.
  assert.deepEqual(newPromises(now, without).promises, [successor]);
  assert.deepEqual(newPromises(now, withRecord).promises, [successor]);
  // Acceptance gives up only what it is told to, and never requires the successor.
  assert.match(acceptance(now, without).errors.join("\n"), greetsFails);
  const given = acceptance(now, withRecord);
  assert.deepEqual(given.errors, []);
  assert.ok(!given.requires.some((r) => r.includes(successor) || r.includes(GREETING)));
  // A Requirement moved to another place gives up nothing: its inherited cases still hold, so it stays required,
  // beside the new place Feature names, until they are excluded.
  const moved = candidate("feature/moved");
  assert.deepEqual(newPromises(now, moved).promises, ["requirements/greets-its-guest-by-name/requirement.md"]);
  assert.deepEqual(acceptance(now, moved), { excluded: [], requires: REQUIRED, errors: [] });
});

// Why: requirements/accepted-reductions/requirement.md
test("an exclusion names a case or a suite the accepted regression has, once, and says why", () => {
  const now = accepted();
  assert.deepEqual(acceptance(now, candidate("acceptance/excludes-waves")).errors, [
    'acceptance/wave-goodbye.md: excludes case: scripts/cases.test.ts: "waves", which the accepted regression has no case of',
  ]);
  assert.deepEqual(acceptance(now, candidate("acceptance/reasonless")).errors, [
    "acceptance/drop-greeting.md: entry 1 says not why it is given up, as because: <why>",
  ]);
  // A suite that does not serve the accepted regression's plan is nothing it has to give up.
  const unserved = layeredState("feature/promised");
  assert.deepEqual(acceptance(unserved, layeredState("feature/promised", "acceptance/excludes-plain")).errors, [
    "acceptance/unplain.md: excludes suite: suites/plain.md, which serves no Regression Plan of the accepted regression",
  ]);
});

// Why: requirements/accepted-reductions/requirement.md
test("an acceptance record, and a Requirement the accepted plan names, stay as they were: history is never rewritten or removed", () => {
  const history = candidate("acceptance/history");
  const rewritten = candidate("acceptance/history");
  fs.writeFileSync(
    path.join(rewritten, "acceptance", "stop-greeting-with-hello.md"),
    fs.readFileSync(path.join(layeredState("acceptance/excludes-plain"), "acceptance", "unplain.md")),
  );
  assert.deepEqual(acceptance(history, rewritten).errors, [
    "acceptance/stop-greeting-with-hello.md: rewritten; an acceptance record is history, never rewritten",
  ]);
  assert.deepEqual(acceptance(history, candidate()).errors, [
    "acceptance/stop-greeting-with-hello.md: removed; an acceptance record is history, never removed",
  ]);
  const now = accepted();
  assert.match(
    acceptance(now, candidate("feature/rewritten")).errors.join("\n"),
    /greets-by-name\/requirement\.md: rewritten/,
  );
  const removed = candidate();
  fs.rmSync(path.join(removed, "requirements", "greets-by-name"), { recursive: true });
  assert.match(acceptance(now, removed).errors.join("\n"), /greets-by-name\/requirement\.md: removed/);
  // A Requirement the accepted plan names by a wildcard is kept as it was, as one it names directly is.
  const wild = ["feature/promised", "acceptance/wild-requirements"];
  const wildNow = layeredState(...wild);
  assert.deepEqual(acceptance(wildNow, layeredState(...wild, "feature/refactored")).errors, []);
  assert.deepEqual(acceptance(wildNow, layeredState(...wild, "feature/rewritten")).errors, [
    `${BY_NAME}: rewritten; a Requirement never changes, so a new commitment is a new Requirement`,
  ]);
});

// Why: requirements/accepted-reductions/requirement.md
test("what either state keeps through a link is not its own, and is refused rather than read through it", () => {
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-elsewhere-"));
  fs.cpSync(candidate("acceptance/excludes-greets"), elsewhere, { recursive: true });
  // Acceptance records kept elsewhere.
  const linkedRecords = candidate("regression/candidates/withdrawn");
  fs.symlinkSync(path.join(elsewhere, "acceptance"), path.join(linkedRecords, "acceptance"), "junction");
  assert.match(acceptance(accepted(), linkedRecords).errors.join("\n"), /acceptance: not a directory of its own/);
  // The accepted Regression Plan kept elsewhere; a file link needs privileges on Windows, so this is shown where one
  // can be made.
  if (process.platform !== "win32") {
    const linkedPlan = accepted();
    fs.rmSync(path.join(linkedPlan, PLAN));
    fs.symlinkSync(path.join(elsewhere, PLAN), path.join(linkedPlan, PLAN));
    assert.match(acceptance(linkedPlan, candidate()).errors.join("\n"), /a plan stated through a link/);
  }
});
