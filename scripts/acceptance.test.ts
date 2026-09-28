import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acceptance, named, reductions } from "./acceptance.js";
import { newPromises } from "./feature.js";
import { PLAN } from "./links.js";
import { layeredState } from "./test-data.js";

const BY_NAME = "requirements/greets-by-name/requirement.md";
/** The accepted state these cases reduce: adding, greeting and greeting by name, on Linux and Windows, served by a suite. */
const PROTECTED = ["feature/promised", "acceptance/protected"];
const accepted = () => layeredState(...PROTECTED);
const candidate = (...layers: string[]) => layeredState(...PROTECTED, ...layers);
const reduced = (a: string, c: string) => {
  const { reductions: found, errors } = reductions(a, c);
  return { reductions: found.map(named), errors };
};

// Why: requirements/inherited-reductions/requirement.md
test("a candidate reduces each piece of protection the accepted Regression Plan requires that its own no longer does", () => {
  const now = accepted();
  for (const [layers, reduction] of [
    [["acceptance/unnamed"], `commitment: ${BY_NAME}`],
    [["acceptance/windowless"], 'conditions: {"platform":"win32"}'],
    [["acceptance/unsealed"], "proof: the seal checks of src/add.ts"],
    [["acceptance/unserved"], "suite: suites/plain.md"],
    [["feature/moved", "acceptance/moved"], `commitment: ${BY_NAME}`],
    [
      ["regression/candidates/replaced", "acceptance/replaced"],
      "commitment: brain/learning/k/26/01/01/01/nodes/greeting.md",
    ],
  ] as [string[], string][])
    assert.deepEqual(reduced(now, candidate(...layers)), { reductions: [reduction], errors: [] }, layers.join(" + "));
});

// Why: requirements/inherited-reductions/requirement.md
test("what a candidate adds, rewrites in code, or rearranges in its testing reduces nothing its plan still requires", () => {
  const now = accepted();
  for (const layers of [[], ["acceptance/extended"], ["feature/refactored"], ["feature/decomposed"]])
    assert.deepEqual(reduced(now, candidate(...layers)), { reductions: [], errors: [] }, layers.join(" + "));
});

// Why: requirements/inherited-reductions/requirement.md
test("a place named by a wildcard is reduced once when dropped, and file by file while the candidate still names it", () => {
  const skilled = candidate("acceptance/skilled", "acceptance/skill-c");
  assert.deepEqual(reduced(skilled, candidate("acceptance/skilled")), {
    reductions: ["commitment: skills/c/SKILL.md"],
    errors: [],
  });
  assert.deepEqual(reduced(skilled, accepted()), { reductions: ["commitment: skills/*/SKILL.md"], errors: [] });
});

// Why: requirements/inherited-reductions/requirement.md
test("a Requirement the accepted plan names, rewritten in place, is a loss no acceptance can accept", () => {
  const now = accepted();
  const why = /requirement\.md: rewritten in place, which no acceptance can accept/;
  assert.match(reduced(now, candidate("feature/rewritten")).errors.join("\n"), why);
  assert.match(acceptance(now, candidate("feature/rewritten", "acceptance/accepts-unnamed")).errors.join("\n"), why);
});

// Why: requirements/accepted-reductions/requirement.md
test("silence retains: a reduction no record the candidate adds accepts is refused, even where an old record once accepted it", () => {
  const unaccepted = `commitment: ${BY_NAME}: the candidate reduces it, but no acceptance record it adds accepts that`;
  assert.deepEqual(acceptance(accepted(), candidate("acceptance/unnamed")).errors, [unaccepted]);
  // A record the accepted state already holds is history: it accepted a reduction of an earlier regression, not this one.
  const withHistory = candidate("acceptance/history");
  assert.deepEqual(acceptance(withHistory, candidate("acceptance/history", "acceptance/unnamed")).errors, [unaccepted]);
});

// Why: requirements/accepted-reductions/requirement.md
test("a reduction is accepted by an entry of a record the candidate adds that names it and says why", () => {
  const now = accepted();
  for (const [layers, reduction] of [
    [["acceptance/unnamed", "acceptance/accepts-unnamed"], `commitment: ${BY_NAME}`],
    [["acceptance/windowless", "acceptance/accepts-windowless"], 'conditions: {"platform":"win32"}'],
    [["acceptance/unsealed", "acceptance/accepts-unsealed"], "proof: the seal checks of src/add.ts"],
    [["acceptance/unserved", "acceptance/accepts-unserved"], "suite: suites/plain.md"],
  ] as [string[], string][]) {
    const result = acceptance(now, candidate(...layers));
    assert.deepEqual(result.errors, [], layers.join(" + "));
    assert.deepEqual(
      result.accepted.map((a) => [named(a.protection), a.record]),
      [[reduction, `acceptance/${recordOf(layers[1]!)}`]],
    );
    assert.ok(result.accepted.every((a) => a.because.length > 0));
  }
});

/** The name of the one record a layer in test-data/acceptance adds. */
function recordOf(layer: string): string {
  const dir = path.join(layeredState(layer), "acceptance");
  return fs.readdirSync(dir).find((f) => f.endsWith(".md") && f !== "AGENTS.md")!;
}

// Why: requirements/accepted-reductions/requirement.md
test("an entry that accepts what the candidate does not reduce, or says not why, is refused, and an old record is never rewritten or removed", () => {
  const now = accepted();
  assert.deepEqual(acceptance(now, candidate("acceptance/unnamed", "acceptance/overreaching")).errors, [
    "acceptance/everything-else.md: accepts losing commitment: src/add.ts, which the candidate does not reduce",
  ]);
  assert.deepEqual(acceptance(now, candidate("acceptance/unnamed", "acceptance/reasonless")).errors, [
    "acceptance/drop-by-name.md: entry 1 says not why its loss is accepted, as because: <why>",
    `commitment: ${BY_NAME}: the candidate reduces it, but no acceptance record it adds accepts that`,
  ]);
  const history = candidate("acceptance/history");
  const rewritten = candidate("acceptance/history");
  fs.writeFileSync(
    path.join(rewritten, "acceptance", "stop-naming-guests.md"),
    fs.readFileSync(path.join(layeredState("acceptance/accepts-unserved"), "acceptance", "unplain.md")),
  );
  assert.deepEqual(acceptance(history, rewritten).errors, [
    "acceptance/stop-naming-guests.md: rewritten; an acceptance record is history, never rewritten",
  ]);
  // Removed, it could be added again later as if new, so it is refused too.
  const removed = candidate();
  assert.deepEqual(acceptance(history, removed).errors, [
    "acceptance/stop-naming-guests.md: removed; an acceptance record is history, never removed",
  ]);
});

// Why: requirements/accepted-reductions/requirement.md
test("a candidate that reduces nothing needs no record, whether it newly promises something or nothing", () => {
  const now = accepted();
  // Neither: a refactoring newly promises nothing and reduces nothing.
  const refactored = candidate("feature/refactored");
  assert.deepEqual(newPromises(now, refactored).promises, []);
  assert.deepEqual(acceptance(now, refactored), { reductions: [], accepted: [], errors: [] });
  // Feature only: a new promise reduces nothing, so Acceptance stays empty.
  const extended = candidate("acceptance/extended");
  assert.deepEqual(newPromises(now, extended).promises, ["requirements/greets-politely/requirement.md"]);
  assert.deepEqual(acceptance(now, extended), { reductions: [], accepted: [], errors: [] });
  // Acceptance only: a loss accepted, with nothing newly promised.
  const unnamed = candidate("acceptance/unnamed", "acceptance/accepts-unnamed");
  assert.deepEqual(newPromises(now, unnamed).promises, []);
  assert.deepEqual(acceptance(now, unnamed).errors, []);
});

// Why: requirements/accepted-reductions/requirement.md
test("a replacement is two decisions: Feature names what the candidate newly promises, Acceptance only what it loses", () => {
  const now = accepted();
  for (const [layers, successor, lost] of [
    [
      ["regression/candidates/replaced", "acceptance/replaced"],
      "brain/learning/k/26/01/02/01/nodes/greeting.md",
      "brain/learning/k/26/01/01/01/nodes/greeting.md",
    ],
    [["feature/moved", "acceptance/moved"], "requirements/greets-its-guest-by-name/requirement.md", BY_NAME],
  ] as [string[], string, string][]) {
    // Feature names the successor, whether or not its loss is accepted, and never names what it replaces.
    const [without, withRecord] = [
      candidate(...layers),
      candidate(...layers, layers[0] === "feature/moved" ? "acceptance/accepts-moved" : "acceptance/accepts-replaced"),
    ];
    assert.deepEqual(newPromises(now, without).promises, [successor]);
    assert.deepEqual(newPromises(now, withRecord).promises, [successor]);
    // Acceptance names only the loss, never the successor, and holds only once the loss is accepted.
    assert.deepEqual(acceptance(now, without).reductions.map(named), [`commitment: ${lost}`]);
    assert.equal(acceptance(now, without).errors.length, 1);
    assert.deepEqual(acceptance(now, withRecord).errors, []);
    assert.deepEqual(
      acceptance(now, withRecord).accepted.map((a) => named(a.protection)),
      [`commitment: ${lost}`],
    );
  }
});

// Why: requirements/inherited-reductions/requirement.md
// Why: requirements/accepted-reductions/requirement.md
test("what a state protects or accepts through a link is not its own, and is refused rather than read through it", () => {
  const now = accepted();
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-elsewhere-"));
  fs.cpSync(candidate("acceptance/accepts-unnamed", "acceptance/unserved"), elsewhere, { recursive: true });
  // Acceptance records kept elsewhere.
  const linkedRecords = candidate("acceptance/unnamed");
  fs.symlinkSync(path.join(elsewhere, "acceptance"), path.join(linkedRecords, "acceptance"), "junction");
  assert.match(acceptance(now, linkedRecords).errors.join("\n"), /acceptance: not a directory of its own/);
  // Suites kept elsewhere, in the candidate and in the accepted state.
  const linkedSuites = candidate();
  fs.rmSync(path.join(linkedSuites, "suites"), { recursive: true });
  fs.symlinkSync(path.join(elsewhere, "suites"), path.join(linkedSuites, "suites"), "junction");
  assert.match(reduced(now, linkedSuites).errors.join("\n"), /suites: reached through a link/);
  assert.match(reduced(linkedSuites, now).errors.join("\n"), /suites: reached through a link/);
  // A Regression Plan kept elsewhere; a file link needs privileges on Windows, so this is shown where one can be made.
  if (process.platform !== "win32") {
    const linkedPlan = candidate();
    fs.rmSync(path.join(linkedPlan, PLAN));
    fs.symlinkSync(path.join(elsewhere, PLAN), path.join(linkedPlan, PLAN));
    assert.match(reduced(now, linkedPlan).errors.join("\n"), /a plan stated through a link/);
    assert.match(reduced(linkedPlan, now).errors.join("\n"), /a plan stated through a link/);
    // One suite reached through a link, which would otherwise be passed over as serving nothing.
    const linkedSuite = candidate();
    fs.rmSync(path.join(linkedSuite, "suites", "plain.md"));
    fs.symlinkSync(path.join(elsewhere, "suites", "plain.md"), path.join(linkedSuite, "suites", "plain.md"));
    assert.match(reduced(now, linkedSuite).errors.join("\n"), /suites\/plain\.md: a suite stated through a link/);
    assert.match(reduced(linkedSuite, now).errors.join("\n"), /suites\/plain\.md: a suite stated through a link/);
  }
});
