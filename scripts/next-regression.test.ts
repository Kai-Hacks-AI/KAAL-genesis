import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PLAN } from "./links.js";
import { evolvedRegression, nextRegression, protectionOf, regressionErrors } from "./next-regression.js";
import { regressionIdentity } from "./regression.js";
import { layeredState, regressionCandidate, succeeding } from "./test-data.js";

/** The layers of test-data/next-regression, wherever the cases run. */
const LAYERS = fileURLToPath(new URL("../test-data/next-regression/", import.meta.url));
const WAVES = "requirements/waves/requirement.md";
const POLITE = "requirements/greets-politely/requirement.md";
const GREETING = "brain/learning/k/26/01/01/01/nodes/greeting.md";
/** A synthetic first regression, not KAAL's own: adding, greeting and greeting by name, on Linux and Windows, adding also shown by the seal checks, served by a suite one of its cases belongs to. */
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

// Why: requirements/next-regression/requirement.md
// Why: brain/learning/genesis/26/09/29/04/nodes/testing.md
test("the next regression is the accepted one, less what is given up, with what is newly promised and demonstrated: F only, A only, F and A, or neither", () => {
  const R0 = r0();
  const derived = (layer: string) => {
    const candidate = succeeding(R0, layer);
    assert.deepEqual(judged(R0, candidate), []);
    const next = nextRegression(R0, candidate);
    assert.deepEqual(next.errors, []);
    // The candidate's own regression is the one derived for it.
    assert.deepEqual(next.protection, protectionOf(candidate).protection);
    return next;
  };
  const inherited = protectionOf(R0).protection;
  // F only: a new promise, demonstrated, enters with its case; everything inherited stays.
  const f = derived("next-regression/waves");
  assert.deepEqual([f.promises, f.demonstrated], [[WAVES], [WAVES]]);
  assert.deepEqual(
    f.protection.commitments.map((c) => c.place),
    [...places(R0), WAVES].sort(),
  );
  // A only: exactly the case given up goes, and every commitment stays.
  const a = derived("next-regression/fixture-given-up");
  assert.deepEqual(a.promises, []);
  assert.deepEqual(
    a.protection.cases.map((c) => c.title),
    inherited.cases.map((c) => c.title).filter((t) => t !== "adds as its fixture says"),
  );
  assert.deepEqual(
    a.protection.commitments.map((c) => c.place),
    places(R0),
  );
  // F and A: a replacement is a new promise demonstrated and what it replaces given up, never anything else.
  const fa = derived("next-regression/polite");
  assert.deepEqual(fa.demonstrated, [POLITE]);
  assert.deepEqual(
    fa.protection.commitments.map((c) => c.place),
    [...places(R0).filter((p) => p !== GREETING), POLITE].sort(),
  );
  // Neither: code rearranged, nothing promised or given up, and the protection is the inherited one.
  assert.deepEqual(derived("next-regression/refactored").protection, inherited);
});

// Why: requirements/next-regression/requirement.md
// Why: brain/learning/genesis/26/09/29/04/nodes/testing.md
test("the derived regression is the accepted input of the same operation again", () => {
  const R0 = r0();
  const R1 = succeeding(R0, "next-regression/waves");
  assert.deepEqual(judged(R0, R1), []);
  // R1, read as an accepted regression, is exactly what was derived for it: nothing is restated by hand.
  assert.deepEqual(protectionOf(R1).protection, nextRegression(R0, R1).protection);
  const R2 = succeeding(R1, "next-regression/fixture-given-up");
  assert.deepEqual(judged(R1, R2), []);
  const second = nextRegression(R1, R2);
  assert.deepEqual([second.promises, second.errors], [[], []]);
  assert.deepEqual(second.protection, protectionOf(R2).protection);
  // What R1 newly brought in is inherited protection now: silence keeps it, and only what R2 gives up goes.
  assert.deepEqual(places(R2), places(R1));
  assert.ok(second.protection.cases.some((c) => c.places.includes(WAVES)));
  assert.ok(!second.protection.cases.some((c) => c.title === "adds as its fixture says"));
});

// Why: requirements/next-regression/requirement.md
// Why: brain/learning/genesis/26/09/29/04/nodes/testing.md
test("silence never gives up protection: an inherited case, suite, membership, link, condition or proof left out without a record is refused", () => {
  const R1 = succeeding(r0(), "next-regression/waves");
  const from = (change: (state: string) => string) => judged(R1, change(succeeding(R1)));
  // A case left out, as the record that would exclude it is not added, whose protection no other case keeps.
  assert.ok(
    from((s) =>
      edited(s, "scripts/cases.test.ts", (t) => t.replace(/\/\/ Why: brain\S+\ntest\("greets"[\s\S]*?\n\}\);\n\n/, "")),
    ).includes(
      'scripts/cases.test.ts: "greets": in the regression, and no acceptance record excludes it, but the candidate no longer has it',
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

// Why: requirements/next-regression/requirement.md
test("no commitment enters the regression but what the candidate newly promises and demonstrates; a suite or condition added strengthens it", () => {
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
  // A suite newly serving the plan, or a condition added, is not something newly promised, but more required of it.
  const served = succeeding(R0);
  fs.writeFileSync(path.join(served, "suites/extra.md"), "# Extra\n\nMore of it.\n\nServes: test/regression-plan.md\n");
  assert.deepEqual(judged(R0, served), []);
  assert.deepEqual(nextRegression(R0, served).promises, []);
  assert.deepEqual(
    judged(
      R0,
      edited(succeeding(R0), PLAN, (t) =>
        t.replace("  - { platform: win32 }\n", "  - { platform: win32 }\n  - { platform: darwin }\n"),
      ),
    ),
    [],
  );
});

// Why: requirements/next-regression/requirement.md
// Why: brain/learning/genesis/26/09/29/04/nodes/testing.md
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

// Why: requirements/next-regression/requirement.md
test("which suites serve the regression, and every Requirement and acceptance record it holds, are part of its identity, and no other suite", () => {
  const R0 = r0();
  const before = regressionIdentity(R0);
  // A suite serving no Regression Plan is none of the regression's, however it changes.
  fs.writeFileSync(path.join(R0, "suites/other.md"), "# Other\n\nSomething else.\n");
  assert.equal(regressionIdentity(R0), before);
  edited(R0, "suites/other.md", (t) => `${t}\nMore of something else.\n`);
  assert.equal(regressionIdentity(R0), before);
  // One that starts serving it, or stops, changes what it requires.
  const serving = regressionIdentity(edited(R0, "suites/other.md", (t) => `${t}\nServes: test/regression-plan.md\n`));
  assert.notEqual(serving, before);
  edited(R0, "suites/plain.md", (t) => t.replace("Serves: test/regression-plan.md\n", ""));
  const unserved = regressionIdentity(R0);
  assert.notEqual(unserved, serving);
  // A Requirement it records but its plan does not name decides what a candidate newly promises, so it is part of it.
  fs.cpSync(path.join(LAYERS, "waves/requirements/waves"), path.join(R0, "requirements/waves"), { recursive: true });
  const recorded = regressionIdentity(R0);
  assert.notEqual(recorded, unserved);
  // So is every acceptance record it holds: a candidate's record is new, and gives something up, only if it holds none.
  fs.cpSync(path.join(LAYERS, "fixture-given-up/acceptance"), path.join(R0, "acceptance"), { recursive: true });
  const accepted = regressionIdentity(R0);
  assert.notEqual(accepted, recorded);
  // Guidance beside the records is read as none of them, so it is none of the regression's.
  fs.writeFileSync(path.join(R0, "requirements/AGENTS.md"), "Guidance.\n");
  fs.writeFileSync(path.join(R0, "acceptance/AGENTS.md"), "Guidance.\n");
  assert.equal(regressionIdentity(R0), accepted);
});

// Why: requirements/next-regression/requirement.md
test("the regression's cases are carried one to one, and its sets of conditions as sets, in whatever order", () => {
  // Two inherited cases at one address are two cases: leaving either out is leaving one out, and the one left in
  // carries only what it carried itself.
  const twice = edited(
    r0(),
    "scripts/cases.test.ts",
    (t) =>
      `${t}\n// Why: brain/learning/k/26/01/01/01/nodes/greeting.md\n// Suite: suites/plain.md\ntest("greets", () => {\n  assert.equal(greet("x"), "hello x");\n});\n`,
  );
  const once = edited(
    succeeding(twice),
    "scripts/cases.test.ts",
    (t) => t.slice(0, t.lastIndexOf("\n// Why: brain/learning/k/26/01/01/01/nodes/greeting.md\n// Suite")) + "\n",
  );
  assert.match(
    judged(twice, once).join("\n"),
    /^scripts\/cases\.test\.ts: "greets": the candidate no longer has it, .*what now belongs to suites\/plain\.md no longer detects src\/greet\.ts:1 /m,
  );
  // The sets of conditions the plan requires are the same however they are listed.
  const R0 = r0();
  const reordered = edited(succeeding(R0), PLAN, (t) =>
    t.replace(
      "  - { platform: linux }\n  - { platform: win32 }\n",
      "  - { platform: win32 }\n  - { platform: linux }\n",
    ),
  );
  assert.deepEqual(judged(R0, reordered), []);
});

// Why: requirements/next-regression/requirement.md
test("only a case that demonstrates a new promise enters with it, and cases at one address are carried by any pairing that keeps them", () => {
  const R0 = r0();
  // A case beside the one demonstrating a new promise, at its very address, does not enter because its sibling does.
  const beside = edited(
    succeeding(R0, "next-regression/waves"),
    "scripts/waves.test.ts",
    (t) => `${t}\n// Why: src/add.ts\ntest("waves", () => {\n  assert.ok(true);\n});\n`,
  );
  assert.deepEqual(
    nextRegression(R0, beside)
      .protection.cases.filter((c) => c.file === "scripts/waves.test.ts")
      .map((c) => c.places),
    [[WAVES]],
  );
  // Two inherited cases at one address, one also in the suite, carried in the other order, still keep every relation.
  const both = edited(r0(), "scripts/cases.test.ts", (t) =>
    t.replace(
      "// Why: src/add.ts\n// Suite: suites/plain.md\n",
      '// Why: src/add.ts\ntest("adds", () => {\n  assert.equal(add(0, 0), 0);\n});\n\n// Why: src/add.ts\n// Suite: suites/plain.md\n',
    ),
  );
  const swapped = edited(succeeding(both), "scripts/cases.test.ts", (t) =>
    t.replace(
      '// Why: src/add.ts\ntest("adds", () => {\n  assert.equal(add(0, 0), 0);\n});\n\n// Why: src/add.ts\n// Suite: suites/plain.md\ntest("adds", () => {\n  assert.equal(add(1, 2), 3);\n});\n',
      '// Why: src/add.ts\n// Suite: suites/plain.md\ntest("adds", () => {\n  assert.equal(add(1, 2), 3);\n});\n\n// Why: src/add.ts\ntest("adds", () => {\n  assert.equal(add(0, 0), 0);\n});\n',
    ),
  );
  assert.notEqual(
    fs.readFileSync(path.join(swapped, "scripts/cases.test.ts"), "utf8"),
    fs.readFileSync(path.join(both, "scripts/cases.test.ts"), "utf8"),
  );
  assert.deepEqual(judged(both, swapped), []);
});

// Why: requirements/next-regression/requirement.md
test("an inherited case that comes to demonstrate a new promise is carried once, with both", () => {
  const R0 = r0();
  const linked = edited(succeeding(R0, "next-regression/waves"), "scripts/cases.test.ts", (t) =>
    t.replace(
      "// Why: src/add.ts\n// Suite: suites/plain.md\n",
      `// Why: src/add.ts\n// Why: ${WAVES}\n// Suite: suites/plain.md\n`,
    ),
  );
  assert.deepEqual(judged(R0, linked), []);
  assert.deepEqual(
    nextRegression(R0, linked).protection.cases.filter((c) => c.title === "adds"),
    [
      {
        file: "scripts/cases.test.ts",
        title: "adds",
        places: [WAVES, "src/add.ts"].sort(),
        suites: ["suites/plain.md"],
      },
    ],
  );
  // Beside another inherited case at its address, one outside the suite, it is carried as the case it is, not the other.
  const both = edited(r0(), "scripts/cases.test.ts", (t) =>
    t.replace(
      "// Why: src/add.ts\n// Suite: suites/plain.md\n",
      '// Why: src/add.ts\ntest("adds", () => {\n  assert.equal(add(0, 0), 0);\n});\n\n// Why: src/add.ts\n// Suite: suites/plain.md\n',
    ),
  );
  const second = edited(succeeding(both, "next-regression/waves"), "scripts/cases.test.ts", (t) =>
    t.replace(
      "// Why: src/add.ts\n// Suite: suites/plain.md\n",
      `// Why: src/add.ts\n// Why: ${WAVES}\n// Suite: suites/plain.md\n`,
    ),
  );
  assert.deepEqual(judged(both, second), []);
  // A duplicate added before the inherited case, demonstrating the promise, is its own case, not the inherited one:
  // the inherited case is carried by the case that still is it, and what the duplicate brings besides the promise
  // strengthens what is inherited, since it holds of the accepted state too.
  const added = edited(succeeding(R0, "next-regression/waves"), "scripts/cases.test.ts", (t) =>
    t.replace(
      "// Why: src/add.ts\n// Suite: suites/plain.md\n",
      `// Why: src/add.ts\n// Why: ${WAVES}\n// Suite: suites/plain.md\ntest("adds", () => {\n  assert.equal(add(2, 2), 4);\n});\n\n// Why: src/add.ts\n// Suite: suites/plain.md\n`,
    ),
  );
  assert.deepEqual(judged(R0, added), []);
});

// Why: requirements/next-regression/requirement.md
test("the cases demonstrating a new promise run in a copy of the candidate, never in the candidate judged", () => {
  const R0 = r0();
  const writing = edited(succeeding(R0, "next-regression/waves"), "scripts/waves.test.ts", (t) =>
    t
      .replace(
        'assert.equal(wave("x"), "~ x");',
        'assert.equal(wave("x"), "~ x");\n  fs.writeFileSync("written-by-a-case.txt", "");',
      )
      .replace('import test from "node:test";', 'import fs from "node:fs";\nimport test from "node:test";'),
  );
  assert.deepEqual(nextRegression(R0, writing).demonstrated, [WAVES]);
  assert.equal(fs.existsSync(path.join(writing, "written-by-a-case.txt")), false);
});

// Why: requirements/next-regression/requirement.md
// Why: brain/learning/genesis/26/09/29/04/nodes/testing.md
test("what enters with the candidate beyond what it newly promises strengthens what it inherits, and other data does not enter", () => {
  const R1 = succeeding(r0(), "next-regression/waves");
  // A case of the candidate's own for a commitment it inherits is inherited protection once it is accepted: more of it.
  const added = edited(
    succeeding(R1),
    "scripts/cases.test.ts",
    (t) => `${t}\n// Why: src/add.ts\ntest("adds once more", () => {\n  assert.equal(add(2, 2), 4);\n});\n`,
  );
  assert.deepEqual(judged(R1, added), []);
  assert.ok(evolvedRegression(R1, added).next!.cases.some((c) => c.title === "adds once more"));
  // So is a link or a membership an inherited case gains.
  const linked = edited(succeeding(R1), "scripts/cases.test.ts", (t) =>
    t.replace(
      "// Why: requirements/greets-by-name/requirement.md\n",
      "// Why: requirements/greets-by-name/requirement.md\n// Why: src/add.ts\n// Suite: suites/plain.md\n",
    ),
  );
  assert.deepEqual(judged(R1, linked), []);
  // The data the plan hands its cases is carried as it is, not only by where it is kept.
  const accepted = regressionCandidate("plan-data");
  const redata = edited(succeeding(accepted), "test-data/plan/greeting.txt", (t) => `${t}more\n`);
  assert.ok(
    judged(accepted, redata).includes(
      `${PLAN}: its data, test-data/plan, hold other than the regression's, which nothing gives up or adds to`,
    ),
  );
  assert.deepEqual(judged(accepted, succeeding(accepted)), []);
});

// Why: requirements/next-regression/requirement.md
// Why: brain/learning/genesis/26/09/29/04/nodes/testing.md
test("a case entering with a new promise brings more only where it holds of the accepted state, or back where a case was given up, with what that case had", () => {
  const R0 = r0();
  // A new case demonstrating the promise that also helps prove adding, or joins the suite, adds to protection no new
  // promise brought in, and cannot hold of the accepted state, which has no wave: nothing accepted authorizes it.
  const wider = edited(succeeding(R0, "next-regression/waves"), "scripts/waves.test.ts", (t) =>
    t.replace(`// Why: ${WAVES}\n`, `// Why: ${WAVES}\n// Why: src/add.ts\n// Suite: suites/plain.md\n`),
  );
  const errors = judged(R0, wider);
  assert.ok(errors.length === 1 && errors[0]!.includes("does not hold of the accepted state"), errors.join("\n"));
  // A case given up, and back at its address proving the promise too, keeps what it had and adds nothing to it.
  const back = edited(succeeding(R0, "next-regression/waves"), "scripts/cases.test.ts", (t) =>
    t.replace(
      "// Why: src/add.ts\n// Suite: suites/plain.md\n",
      `// Why: src/add.ts\n// Why: ${WAVES}\n// Suite: suites/plain.md\n`,
    ),
  );
  fs.mkdirSync(path.join(back, "acceptance"), { recursive: true });
  fs.writeFileSync(
    path.join(back, "acceptance/adds-again.md"),
    "---\nexcludes:\n  - case: scripts/cases.test.ts\n    title: adds\n    because: it comes back as a case of waving\n---\n",
  );
  assert.deepEqual(judged(R0, back), []);
  assert.deepEqual(
    nextRegression(R0, back).protection.cases.filter((c) => c.title === "adds"),
    [
      {
        file: "scripts/cases.test.ts",
        title: "adds",
        places: [WAVES, "src/add.ts"].sort(),
        suites: ["suites/plain.md"],
      },
    ],
  );
});
