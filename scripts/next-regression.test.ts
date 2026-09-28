import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PLAN } from "./links.js";
import { nextRegression, protectionOf, regressionErrors } from "./next-regression.js";
import { regressionIdentity } from "./regression.js";
import { layeredState, succeeding } from "./test-data.js";

/** The layers of test-data/next-regression, wherever the cases run. */
const LAYERS = fileURLToPath(new URL("../test-data/next-regression/", import.meta.url));
const WAVES = "requirements/waves/requirement.md";
const POLITE = "requirements/greets-politely/requirement.md";
const GREETING = "brain/learning/k/26/01/01/01/nodes/greeting.md";
/** The first regression of the line: adding, greeting and greeting by name, on Linux and Windows, adding also shown by the seal checks, served by a suite one of its cases belongs to. */
const r0 = () => layeredState("feature/planned", "feature/promised", "acceptance/protected", "next-regression/r0");
/** Whether `candidate` is accepted over `accepted`, by the accepted regression's own judgement, as the checker judges it. */
const judged = (accepted: string, candidate: string) =>
  regressionErrors(accepted, candidate, regressionIdentity(accepted));
/** A state changed by `change` to one of its files. */
const edited = (state: string, file: string, change: (text: string) => string) => {
  fs.writeFileSync(path.join(state, file), change(fs.readFileSync(path.join(state, file), "utf8")));
  return state;
};
const places = (state: string) => protectionOf(state).protection.commitments.map((c) => c.place);

// Why: requirements/derived-regression/requirement.md
// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("each regression of a line is derived from the one before by the same operation, whatever the candidate newly promises or gives up", () => {
  const R0 = r0();
  // F only: a new promise, demonstrated, enters with its case; everything inherited stays.
  const R1 = succeeding(R0, "next-regression/waves");
  assert.deepEqual(judged(R0, R1), []);
  const first = nextRegression(R0, R1);
  assert.deepEqual([first.promises, first.demonstrated, first.errors], [[WAVES], [WAVES], []]);
  assert.deepEqual(first.protection, protectionOf(R1).protection);
  assert.deepEqual(places(R1), [...places(R0), WAVES].sort());
  // A only, from the regression just derived, as its own accepted regression: exactly the case given up goes.
  const R2 = succeeding(R1, "next-regression/fixture-given-up");
  assert.deepEqual(judged(R1, R2), []);
  const second = nextRegression(R1, R2);
  assert.deepEqual([second.promises, second.errors], [[], []]);
  assert.deepEqual(second.protection, protectionOf(R2).protection);
  assert.deepEqual(
    second.protection.cases.map((c) => c.title),
    protectionOf(R1)
      .protection.cases.map((c) => c.title)
      .filter((t) => t !== "adds as its fixture says"),
  );
  assert.deepEqual(places(R2), places(R1));
  // F and A: a replacement is a new promise demonstrated and what it replaces given up, never anything else.
  const R3 = succeeding(R2, "next-regression/polite");
  assert.deepEqual(judged(R2, R3), []);
  const third = nextRegression(R2, R3);
  assert.deepEqual([third.demonstrated, third.errors], [[POLITE], []]);
  assert.deepEqual(third.protection, protectionOf(R3).protection);
  assert.deepEqual(places(R3), [...places(R2).filter((p) => p !== GREETING), POLITE].sort());
  // Neither: code rearranged, nothing promised or given up, and the protection is the inherited one.
  const R4 = succeeding(R3, "next-regression/refactored");
  assert.deepEqual(judged(R3, R4), []);
  assert.deepEqual(nextRegression(R3, R4).protection, protectionOf(R3).protection);
});

// Why: requirements/derived-regression/requirement.md
// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("silence never gives up protection: an inherited case, suite, membership, link, condition or proof left out without a record is refused", () => {
  const R1 = succeeding(r0(), "next-regression/waves");
  const from = (change: (state: string) => string) => judged(R1, change(succeeding(R1)));
  // A case left out, as the record that would exclude it is not added.
  assert.ok(
    from(
      (s) => (
        fs.cpSync(path.join(LAYERS, "fixture-given-up/scripts"), path.join(s, "scripts"), { recursive: true }),
        s
      ),
    ).includes(
      'scripts/cases.test.ts: "adds as its fixture says": in the regression, and no acceptance record excludes it, but the candidate no longer has it',
    ),
  );
  // A suite that stops serving the plan.
  assert.ok(
    from((s) => edited(s, "suites/plain.md", (t) => t.replace("Serves: test/regression-plan.md\n", ""))).includes(
      "suites/plain.md: serves the regression, and no acceptance record gives it up, but no longer serves the candidate's",
    ),
  );
  // A case that leaves it.
  assert.deepEqual(
    from((s) => edited(s, "scripts/cases.test.ts", (t) => t.replace("// Suite: suites/plain.md\n", ""))),
    [
      'scripts/cases.test.ts: "adds": belongs to suites/plain.md in the regression, but no longer does in the candidate\'s',
    ],
  );
  // A condition, and the proof other than cases the plan required.
  assert.deepEqual(
    from((s) => edited(s, PLAN, (t) => t.replace("  - { platform: win32 }\n", ""))),
    [
      `${PLAN}: its conditions are [{"platform":"linux"}], but the regression's are [{"platform":"linux"},{"platform":"win32"}], which nothing gives up or adds to`,
    ],
  );
  assert.ok(
    from((s) =>
      edited(s, PLAN, (t) =>
        t.replace(/proof:\n  the seal checks:\n    - \{ platform: linux \}\n/, "").replace(" and the seal checks", ""),
      ),
    ).includes(
      `${PLAN}: its proof are {}, but the regression's are {"the seal checks":[{"platform":"linux"}]}, which nothing gives up or adds to`,
    ),
  );
  // Nor does an account in the plan of what BRAIN supersedes give up anything, as it once did.
  const withdrawn = edited(succeeding(R1), PLAN, (t) =>
    t
      .replace(/^2\. Greeting\..*\n/m, "")
      .replace(
        "## As runs read it",
        `- Withdraws: \`${GREETING}\` by \`brain/learning/k/26/01/02/01/nodes/greeting.md\`.\n\n## As runs read it`,
      ),
  );
  fs.mkdirSync(path.join(withdrawn, "brain/learning/k/26/01/02/01/nodes"), { recursive: true });
  fs.writeFileSync(
    path.join(withdrawn, "brain/learning/k/26/01/02/01/nodes/greeting.md"),
    "---\nname: greeting\n---\n\nNo greeting any more.\n",
  );
  edited(withdrawn, "scripts/cases.test.ts", (t) =>
    t.replace(/\/\/ Why: brain\S+\ntest\("greets"[\s\S]*?\n\}\);\n\n/, ""),
  );
  const errors = judged(R1, withdrawn);
  assert.ok(
    errors.includes(
      `${GREETING}: inherited, and no acceptance record gives it up, but the candidate's regression no longer requires it`,
    ),
    errors.join("\n"),
  );
  assert.ok(
    errors.includes(
      'scripts/cases.test.ts: "greets": in the regression, and no acceptance record excludes it, but the candidate no longer has it',
    ),
  );
});

// Why: requirements/derived-regression/requirement.md
test("nothing enters the regression but what the candidate newly promises and demonstrates", () => {
  const R0 = r0();
  // A new promise whose case does not pass is not demonstrated, so it cannot enter, even named by the plan.
  const broken = succeeding(R0, "next-regression/waves", "next-regression/waves-broken");
  const derived = nextRegression(R0, broken);
  assert.deepEqual([derived.promises, derived.demonstrated], [[WAVES], []]);
  assert.ok(
    judged(R0, broken).includes(`${WAVES}: newly promised but not demonstrated, so it cannot enter the regression`),
  );
  // A Requirement recorded that no case proves and no plan names is promised, but never enters.
  const unproven = succeeding(R0);
  fs.cpSync(path.join(LAYERS, "waves/requirements"), path.join(unproven, "requirements"), { recursive: true });
  const quiet = nextRegression(R0, unproven);
  assert.deepEqual([quiet.promises, quiet.demonstrated, quiet.errors], [[WAVES], [], []]);
  assert.deepEqual(judged(R0, unproven), []);
  assert.ok(!quiet.protection.commitments.some((c) => c.place === WAVES));
  // A suite newly serving the plan, or a condition added, is not something newly promised.
  const served = succeeding(R0);
  fs.writeFileSync(path.join(served, "suites/extra.md"), "# Extra\n\nMore of it.\n\nServes: test/regression-plan.md\n");
  assert.deepEqual(judged(R0, served), [
    "suites/extra.md: serves the candidate's regression, but nothing newly promised brings it into the regression",
  ]);
  assert.match(
    judged(
      R0,
      edited(succeeding(R0), PLAN, (t) =>
        t.replace("  - { platform: win32 }\n", "  - { platform: win32 }\n  - { platform: darwin }\n"),
      ),
    ).join("\n"),
    /its conditions are .*darwin.*which nothing gives up or adds to/,
  );
});

// Why: requirements/derived-regression/requirement.md
// Why: brain/learning/genesis/26/09/28/06/nodes/testing.md
test("a regression is derived from the accepted one as it is now, and an old acceptance record gives up nothing again", () => {
  const R0 = r0();
  const R1 = succeeding(R0, "next-regression/waves");
  const R2 = succeeding(R1, "next-regression/fixture-given-up");
  // A candidate derived from an earlier regression than the accepted one names another.
  const stale = edited(succeeding(R2), PLAN, (t) => t.replace(regressionIdentity(R2), regressionIdentity(R1)));
  assert.deepEqual(judged(R2, stale), [
    `${PLAN}: derived from ${regressionIdentity(R1)}, not from the accepted regression ${regressionIdentity(R2)}`,
  ]);
  // The record R2 holds gave up a case of R1; it gives up nothing of R2, however its case is dropped again.
  const again = edited(succeeding(R2), "scripts/cases.test.ts", (t) =>
    t.replace(/\/\/ Why: src\/add.ts\n\/\/ Suite: suites\/plain.md\ntest\("adds"[\s\S]*?\n\}\);\n\n/, ""),
  );
  assert.ok(
    judged(R2, again).includes(
      'scripts/cases.test.ts: "adds": in the regression, and no acceptance record excludes it, but the candidate no longer has it',
    ),
  );
  edited(again, "acceptance/stop-adding-by-fixture.md", (t) =>
    t
      .replace("---\n", "---\n")
      .replace(
        /because: adding is shown well enough by its other case and the seal checks\n/,
        "$&  - case: scripts/cases.test.ts\n    title: adds\n    because: not needed\n",
      ),
  );
  assert.ok(
    judged(R2, again).includes(
      "acceptance/stop-adding-by-fixture.md: rewritten; an acceptance record is history, never rewritten",
    ),
  );
});

// Why: requirements/derived-regression/requirement.md
test("which suites serve the regression is part of it, so a change to them changes its identity", () => {
  const R0 = r0();
  const before = regressionIdentity(R0);
  edited(R0, "suites/plain.md", (t) => t.replace("Serves: test/regression-plan.md\n", ""));
  assert.notEqual(regressionIdentity(R0), before);
});
