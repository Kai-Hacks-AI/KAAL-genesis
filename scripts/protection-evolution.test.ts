import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { type Change, definitions, evolution, moduleImports, redefined, witnesses } from "./evolution.js";
import { interpolations, stringValue, templatePrefix, tokens } from "./source.js";
import { PLAN } from "./links.js";
import { evolvedRegression, nextRegression, protectionOf, regressionErrors } from "./next-regression.js";
import { regressionIdentity } from "./regression.js";
import { layeredState, succeeding } from "./test-data.js";

/**
 * A synthetic accepted regression, not KAAL's own: adding, greeting, greeting
 * by name and saying goodbye, the goodbye shown by a case reading a fixture,
 * greeting also by a case reading a golden file.
 */
const base = () =>
  layeredState(
    "feature/planned",
    "feature/promised",
    "acceptance/protected",
    "next-regression/r0",
    "protection-evolution/base",
  );
/** Why `candidate` is refused over `accepted`, by the accepted regression's own judgement, as the checker judges it. */
const judged = (accepted: string, candidate: string) =>
  regressionErrors(accepted, candidate, regressionIdentity(accepted));
/** A state changed by `change` to one of its files. */
const edited = (state: string, file: string, change: (text: string) => string) => {
  const before = fs.readFileSync(path.join(state, file), "utf8");
  const after = change(before);
  assert.notEqual(after, before, `${file} was not changed`);
  fs.writeFileSync(path.join(state, file), after);
  return state;
};
/** The changes to the protection definition, as `verdict what`, sorted. */
const verdicts = (accepted: string, candidate: string) =>
  evolvedRegression(accepted, candidate)
    .changes.map((c: Change) => `${c.verdict} ${c.what}`)
    .sort();
const CASES = "scripts/cases.test.ts";
const GREETING_LINK = "// Why: brain/learning/k/26/01/01/01/nodes/greeting.md";
const GREETS = 'test("greets", () => {\n  assert.equal(greet("x"), "hello x");\n});';
const greetsAs = (body: string) => (t: string) => t.replace(GREETS, `test("greets", () => {\n${body}\n});`);

// Why: requirements/protection-evolution/requirement.md
test("a case rewritten to claim the same keeps what it protected, with no record and no new promise; weakened, it is reduced", () => {
  const R0 = base();
  const BYE = 'scripts/bye.test.ts: "says goodbye to each name its fixture lists"';
  const byeAs = (body: string) => (t: string) =>
    t.replace(
      '  for (const [name, says] of lines("./fixtures/goodbyes.txt")) assert.ok(bye(name).includes(says));',
      body,
    );
  const rewritten = edited(
    succeeding(R0),
    "scripts/bye.test.ts",
    byeAs(
      '  for (const [name, says] of lines("./fixtures/goodbyes.txt")) {\n    const said = bye(name);\n    assert.equal(said.includes(says), true, said);\n  }',
    ),
  );
  assert.deepEqual(judged(R0, rewritten), []);
  const next = evolvedRegression(R0, rewritten);
  assert.deepEqual([next.derived.promises, fs.existsSync(path.join(rewritten, "acceptance"))], [[], false]);
  assert.deepEqual(verdicts(R0, rewritten), [`preserved ${BYE}`, `strengthened ${BYE}`]);
  // The candidate's own regression is the next one: the rewritten case is what the next candidate is judged by.
  assert.deepEqual(next.next, protectionOf(rewritten).protection);
  // The same case at the same address, now claiming less: a farewell that forgets to say goodbye would pass it.
  for (const weaker of [
    '  for (const [name] of lines("./fixtures/goodbyes.txt")) assert.ok(bye(name).includes(name));',
    '  for (const [name] of lines("./fixtures/goodbyes.txt")) assert.ok(bye(name));',
  ]) {
    const weakened = edited(succeeding(R0), "scripts/bye.test.ts", byeAs(weaker));
    const errors = judged(R0, weakened);
    assert.equal(errors.length, 1, errors.join("\n"));
    assert.match(
      errors[0]!,
      /^scripts\/bye\.test\.ts: "says goodbye to each name its fixture lists": redefined: its claim is another, .*no longer detects src\/bye\.ts:1 /,
    );
    assert.deepEqual(verdicts(R0, weakened), [`reduced ${BYE}`, `strengthened ${BYE}`]);
    assert.equal(evolvedRegression(R0, weakened).next, undefined);
  }
  // Weakening a case is judged by what its commitment keeps, over every case carrying it, not by the case alone:
  // greeting's golden case still detects every change to greeting its case detected, so greeting keeps its protection.
  const weakerGreets = edited(succeeding(R0), CASES, greetsAs('  assert.match(greet("x"), /x/);'));
  assert.deepEqual(judged(R0, weakerGreets), []);
  assert.deepEqual(verdicts(R0, weakerGreets), [`preserved ${CASES}: "greets"`, `strengthened ${CASES}: "greets"`]);
});

// Why: requirements/protection-evolution/requirement.md
// Why: requirements/next-regression/requirement.md
test("a further case for a commitment already protected strengthens it, with neither a new promise nor a record, and is inherited next", () => {
  const R0 = base();
  const R1 = edited(
    succeeding(R0),
    CASES,
    (t) => `${t}\n// Why: src/add.ts\ntest("adds negatives", () => {\n  assert.equal(add(-1, 1), 0);\n});\n`,
  );
  assert.deepEqual(judged(R0, R1), []);
  assert.deepEqual(nextRegression(R0, R1).promises, []);
  assert.deepEqual(verdicts(R0, R1), [`strengthened ${CASES}: "adds negatives"`]);
  const next = evolvedRegression(R0, R1).next!;
  assert.deepEqual(
    next.cases.find((c) => c.title === "adds negatives"),
    { file: CASES, title: "adds negatives", places: ["src/add.ts"], suites: [] },
  );
  // Once accepted, it is inherited protection like any other: the next candidate carries it, or is held to it.
  const R2 = succeeding(R1);
  assert.deepEqual(judged(R1, R2), []);
  assert.ok(nextRegression(R1, R2).protection.cases.some((c) => c.title === "adds negatives"));
  // A stronger assertion at the same address keeps what the case detected, and holds of the accepted state too.
  const stronger = edited(
    succeeding(R0),
    CASES,
    greetsAs('  assert.equal(greet("x"), "hello x");\n  assert.equal(greet("y"), "hello y");'),
  );
  assert.deepEqual(judged(R0, stronger), []);
  assert.deepEqual(verdicts(R0, stronger), [`preserved ${CASES}: "greets"`, `strengthened ${CASES}: "greets"`]);
});

// Why: requirements/protection-evolution/requirement.md
test("a case replaced by one accounting for all it carried retires without a record; one accounting for part of it leaves the rest reduced", () => {
  const R0 = base();
  // Greeting's case moves to a file of its own, retitled and claiming more: greeting is neither withdrawn nor re-added.
  const moved = edited(succeeding(R0, "protection-evolution/moved"), CASES, (t) =>
    t.replace(`// Why: brain/learning/k/26/01/01/01/nodes/greeting.md\n${GREETS}\n\n`, ""),
  );
  assert.deepEqual(judged(R0, moved), []);
  assert.deepEqual(verdicts(R0, moved), [
    `preserved ${CASES}: "greets"`,
    'strengthened scripts/greeting.test.ts: "greets whoever it is given"',
  ]);
  assert.deepEqual(
    evolvedRegression(R0, moved).next!.commitments.map((c) => c.place),
    protectionOf(R0).protection.commitments.map((c) => c.place),
  );
  // Adding's case carried adding and the suite serving the plan; its replacement carries adding alone.
  const half = edited(succeeding(R0, "protection-evolution/half-moved"), CASES, (t) =>
    t.replace(
      '// Why: src/add.ts\n// Suite: suites/plain.md\ntest("adds", () => {\n  assert.equal(add(1, 2), 3);\n});\n\n',
      "",
    ),
  );
  assert.deepEqual(judged(R0, half), [
    `${CASES}: "adds": in the regression, and no acceptance record excludes it, but the candidate no longer has it`,
  ]);
  assert.deepEqual(verdicts(R0, half), [
    `preserved ${CASES}: "adds"`,
    `reduced ${CASES}: "adds"`,
    'strengthened scripts/sums.test.ts: "adds any two numbers"',
  ]);
});

// Why: requirements/protection-evolution/requirement.md
test("test data changed at its path changes the case that reads it: kept where its witnesses show it, reduced where it detects less", () => {
  const R0 = base();
  const FIXTURE = "scripts/fixtures/goodbyes.txt";
  const BYE = 'scripts/bye.test.ts: "says goodbye to each name its fixture lists"';
  const reordered = edited(succeeding(R0), FIXTURE, () => "y|goodbye y\nx|goodbye x\n");
  assert.deepEqual(judged(R0, reordered), []);
  const kept = evolvedRegression(R0, reordered).changes.find((c) => c.what === BYE && c.verdict !== "strengthened")!;
  assert.equal(kept.verdict, "preserved");
  assert.match(kept.why, /its data scripts\/fixtures\/goodbyes\.txt holds other than it did/);
  // The same path, the same claim, less data: a farewell that forgets to say goodbye would pass.
  const thinner = edited(succeeding(R0), FIXTURE, () => "x|x\ny|y\n");
  const errors = judged(R0, thinner);
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.match(
    errors[0]!,
    /^scripts\/bye\.test\.ts: "says goodbye to each name its fixture lists": redefined: its data .*no longer detects src\/bye\.ts:1 /,
  );
});

// Why: requirements/protection-evolution/requirement.md
test("a golden file brought to what the candidate produces is no authority: the accepted case judges it, and once given up, what replaces it is unresolved", () => {
  const R0 = base();
  const golden = succeeding(R0, "protection-evolution/golden");
  const GOLDEN = 'scripts/bye.test.ts: "greets nobody as its golden file says"';
  const unrecorded = succeeding(R0, "protection-evolution/golden");
  fs.rmSync(path.join(unrecorded, "acceptance"), { recursive: true });
  assert.ok(judged(R0, unrecorded).includes(`inherited case not excluded: ${GOLDEN} failed`));
  const errors = judged(R0, golden);
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.match(
    errors[0]!,
    new RegExp(
      `^${GOLDEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: unresolved: added: .*does not hold of the accepted state`,
    ),
  );
});

// Why: requirements/protection-evolution/requirement.md
test("a case expecting what the accepted state did not do enters only as the test of a recorded defect", () => {
  const R0 = base();
  const repaired = succeeding(R0, "protection-evolution/repaired");
  assert.deepEqual(judged(R0, repaired), []);
  const entered = evolvedRegression(R0, repaired).changes.find((c) => c.what.startsWith("scripts/trimmed.test.ts"))!;
  assert.equal(entered.verdict, "strengthened");
  assert.match(entered.why, /tests defects\/greets-untrimmed, recorded/);
  // Without the defect it tests, nothing accepted says the accepted state was wrong.
  fs.rmSync(path.join(repaired, "defects"), { recursive: true });
  assert.match(
    judged(R0, repaired).join("\n"),
    /scripts\/trimmed\.test\.ts: .*: unresolved: .*does not hold of the accepted state/,
  );
});

// Why: requirements/protection-evolution/requirement.md
test("suites, links and conditions: more is strengthened; a suite left, a link taken from a commitment's only case, or a condition dropped is reduced", () => {
  const R0 = base();
  const suited = succeeding(R0);
  // A second concern serving the plan, which adding's case joins as well.
  fs.writeFileSync(
    path.join(suited, "suites/sums.md"),
    "# Sums\n\nSums, whatever their terms.\n\nServes: test/regression-plan.md\n",
  );
  edited(suited, CASES, (t) =>
    t.replace("// Suite: suites/plain.md\n", "// Suite: suites/plain.md\n// Suite: suites/sums.md\n"),
  );
  assert.deepEqual(judged(R0, suited), []);
  assert.deepEqual(verdicts(R0, suited), [`strengthened ${CASES}: "adds"`, "strengthened suites/sums.md"]);
  // "I only reorganized the suites": the only case of the suite serving the plan moved out of it.
  const reorganized = edited(succeeding(R0), CASES, (t) =>
    t.replace("// Suite: suites/plain.md\n", "// Suite: suites/sums.md\n"),
  );
  fs.writeFileSync(
    path.join(reorganized, "suites/sums.md"),
    "# Sums\n\nSums, whatever their terms.\n\nServes: test/regression-plan.md\n",
  );
  assert.deepEqual(judged(R0, reorganized), [
    `${CASES}: "adds": belongs to suites/plain.md in the regression, but no longer does in the candidate's`,
  ]);
  // Greeting's case pointed elsewhere: greeting is still detected by its golden case, so only the new link is more.
  const relinked = edited(succeeding(R0), CASES, (t) =>
    t.replace(
      `// Why: brain/learning/k/26/01/01/01/nodes/greeting.md\n${GREETS}`,
      `// Why: requirements/greets-by-name/requirement.md\n${GREETS}`,
    ),
  );
  assert.deepEqual(judged(R0, relinked), []);
  assert.deepEqual(verdicts(R0, relinked), [`preserved ${CASES}: "greets"`, `strengthened ${CASES}: "greets"`]);
  // Saying goodbye's only case pointed elsewhere leaves nothing proving it.
  const unlinked = edited(succeeding(R0), "scripts/bye.test.ts", (t) =>
    t.replace(
      "// Why: requirements/says-goodbye/requirement.md\n",
      "// Why: requirements/greets-by-name/requirement.md\n",
    ),
  );
  assert.ok(
    judged(R0, unlinked).includes(
      'scripts/bye.test.ts: "says goodbye to each name its fixture lists": helps prove requirements/says-goodbye/requirement.md in the regression, but no longer does in the candidate\'s',
    ),
  );
  // Another platform is more; one traded for another is one dropped, however the plan explains it.
  const more = edited(succeeding(R0), PLAN, (t) =>
    t.replace("  - { platform: win32 }\n", "  - { platform: win32 }\n  - { platform: darwin }\n"),
  );
  assert.deepEqual(judged(R0, more), []);
  const traded = edited(succeeding(R0), PLAN, (t) =>
    t.replace("  - { platform: win32 }\n", "  - { platform: darwin }\n"),
  );
  assert.match(judged(R0, traded).join("\n"), /its conditions are .*darwin.*which nothing gives up or adds to/);
});

// Why: requirements/protection-evolution/requirement.md
test("what cannot be shown kept stays unresolved: a case detecting none of its witnesses cannot be shown replaced by any rewrite", () => {
  const R0 = base();
  const rewritten = edited(succeeding(R0), CASES, (t) =>
    t.replace('assert.match(greet("x"), /x/);', 'assert.ok(/x/.test(greet("x")));'),
  );
  const errors = judged(R0, rewritten);
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.match(
    errors[0]!,
    /"greets by name": unresolved: redefined: its claim is another; it detects none of the \d+ witnesses/,
  );
});

// Why: requirements/protection-evolution/requirement.md
test("a case is defined by its claim, what its file states around its cases, the loaders it reaches and the data they name; what is only added beside them, or only laid out otherwise, leaves it as it was", () => {
  const R0 = base();
  // A loader the goodbye cases reach, in the accepted state.
  fs.writeFileSync(path.join(R0, "scripts/test-data.ts"), 'export const WHO = "x";\n');
  // And one kept as JavaScript, which its runner reads as JavaScript.
  fs.mkdirSync(path.join(R0, "scripts/test-data"));
  fs.writeFileSync(path.join(R0, "scripts/test-data/check.mjs"), "export const ok = true;\n");
  fs.writeFileSync(
    path.join(R0, "scripts/test-data/disable.mjs"),
    "globalThis.disabled = true;\nexport const unused = 1;\n",
  );
  edited(R0, "scripts/bye.test.ts", (t) =>
    t.replace(
      'import { greet } from "../src/greet.js";\n',
      'import { greet } from "../src/greet.js";\nimport { WHO } from "./test-data.js";\nimport { ok } from "./test-data/check.mjs";\n\n// Used, so they load: an import TypeScript sees used for nothing is compiled away.\nvoid [WHO, ok];\n',
    ),
  );
  const before = new Map(definitions(R0).map((d) => [`${d.file}: ${d.title}`, d]));
  const changes = (candidate: string) =>
    definitions(candidate).flatMap((d) => {
      const was = before.get(`${d.file}: ${d.title}`);
      const why = was && redefined(was, d, candidate);
      return why ? [`${d.title}: ${why}`] : [];
    });
  assert.deepEqual(changes(succeeding(R0)), []);
  // Another import, a helper, a comment, a case and another layout: nothing an inherited case does is different.
  const added = edited(succeeding(R0), CASES, (t) =>
    t
      .replace('import test from "node:test";\n', 'import os from "node:os";\nimport test from "node:test";\n')
      .replace(
        `${GREETING_LINK}\n${GREETS}`,
        `/** Greeted. */\nconst greeted = (name: string) => greet(name);\n\nconst named = function (name: string) {\n  return greet(name);\n};\n\n${GREETING_LINK}\n${GREETS.replace('"hello x"', '  "hello x" // as it always was\n  ')}`,
      )
      .concat(
        '\n// Why: src/add.ts\ntest("adds nothing", () => {\n  assert.equal(add(0, 0), 0 * os.cpus().length);\n});\n',
      ),
  );
  assert.deepEqual(changes(added), []);
  assert.equal(definitions(added).length, definitions(R0).length + 1);
  // A line break is layout, except where it ends a statement: after `return`, the assertion no longer runs.
  const returning = succeeding(
    edited(succeeding(R0), CASES, greetsAs('  return assert.equal(greet("x"), "hello x");')),
  );
  const since = new Map(definitions(returning).map((d) => [d.title, d]));
  const redefinedFrom = (candidate: string) =>
    definitions(candidate).flatMap((d) => {
      const why = since.has(d.title) && redefined(since.get(d.title)!, d, candidate);
      return why ? [`${d.title}: ${why}`] : [];
    });
  assert.deepEqual(
    redefinedFrom(edited(succeeding(returning), CASES, (t) => t.replace("return assert", "return assert\n    "))),
    [],
  );
  assert.deepEqual(
    redefinedFrom(edited(succeeding(returning), CASES, (t) => t.replace("return assert", "return\n    assert"))),
    ["greets: its claim is another"],
  );
  // What every case of a file shares, changed: each of them is another case now.
  assert.deepEqual(
    changes(
      edited(succeeding(R0), "scripts/bye.test.ts", (t) =>
        t.replace(".filter(Boolean)", ".filter((line) => line.length > 1)"),
      ),
    ),
    [
      "says goodbye to each name its fixture lists: scripts/bye.test.ts no longer states what it did around its cases",
      "greets nobody as its golden file says: scripts/bye.test.ts no longer states what it did around its cases",
    ],
  );
  // A loader it reaches, changed rather than added to.
  assert.deepEqual(changes(edited(succeeding(R0), "scripts/test-data.ts", (t) => t.replace('"x"', '"y"'))), [
    "says goodbye to each name its fixture lists: scripts/test-data.ts, which it reaches, no longer states what it did",
    "greets nobody as its golden file says: scripts/test-data.ts, which it reaches, no longer states what it did",
  ]);
  // A value a loader comes to export is seen by a case importing its namespace, however inert; a type is not.
  for (const added of [
    "export const bypass = () => {};",
    "const bypass = () => {};\nexport { bypass };",
    'export * from "./test-data/check.mjs";',
  ])
    assert.deepEqual(
      changes(edited(succeeding(R0), "scripts/test-data.ts", (t) => `${t}${added}\n`)),
      [
        "says goodbye to each name its fixture lists: scripts/test-data.ts, which it reaches, no longer states what it did",
        "greets nobody as its golden file says: scripts/test-data.ts, which it reaches, no longer states what it did",
      ],
      added,
    );
  for (const added of [
    "export type Who = string;",
    "export interface Whom {\n  name: string;\n}",
    "type Where = string;\nexport type { Where };",
  ])
    assert.deepEqual(changes(edited(succeeding(R0), "scripts/test-data.ts", (t) => `${t}${added}\n`)), [], added);
  // In JavaScript, an import loads its module even where what it binds is used for nothing.
  assert.deepEqual(
    changes(
      edited(succeeding(R0), "scripts/test-data/check.mjs", (t) => `import { unused } from "./disable.mjs";\n${t}`),
    ),
    [
      "says goodbye to each name its fixture lists: scripts/test-data/check.mjs, which it reaches, no longer states what it did",
      "greets nobody as its golden file says: scripts/test-data/check.mjs, which it reaches, no longer states what it did",
    ],
  );
  // Data named by the case alone changes that case alone.
  assert.deepEqual(changes(edited(succeeding(R0), "scripts/fixtures/greeting.golden", () => "hello|")), [
    "greets nobody as its golden file says: its data scripts/fixtures/greeting.golden holds other than it did",
  ]);
  // Added beside the cases, but not inert: each can change what every case of the file does, however they read.
  const cases = (candidate: string) =>
    changes(candidate).filter((c) => !c.startsWith("says goodbye") && !c.startsWith("greets nobody"));
  const redefinedAll = definitions(R0)
    .filter((d) => d.file === CASES)
    .map((d) => `${d.title}: ${CASES} no longer states what it did around its cases`);
  const withVerify = succeeding(
    edited(R0, CASES, (t) =>
      t.replace(
        'import { greet } from "../src/greet.js";\n',
        'import { greet } from "../src/greet.js";\n\nlet verify = (n: number) => assert.equal(n, 3);\n',
      ),
    ),
  );
  for (const [added, why] of [
    ["verify = () => {};", "an assignment disabling what the frame asserts"],
    ["function Number(text: string) {\n  return 3;\n}", "a declaration taking a name the cases use"],
    ["const { Number } = { Number: () => 3 };", "a destructuring taking a name the cases use"],
    ["const fresh = 1,\n  Number = () => 3;", "a second declaration taking a name the cases use"],
    [
      "const fresh = 1; function Number() {\n  return 3;\n}",
      "a second statement on its line taking a name the cases use",
    ],
    ["const helper = verify(3);", "a value computed as the module loads"],
    ["const fresh = function () {\n  verify = () => {};\n}();", "a function called where it is written"],
    ["const fresh = (function () {\n  verify = () => {};\n})();", "a wrapped function called where it is written"],
    ["const fresh = (() => {\n  verify = () => {};\n})();", "an arrow called where it is written"],
    ["const fresh = /* @__PURE__ */ verify(3);", "a call annotated as pure, which still runs"],
    ["class Fresh {\n  static {\n    verify = () => {};\n  }\n}", "a class whose static block runs as it is declared"],
    ["namespace Fresh {\n  verify = () => {};\n}", "a namespace, whose body runs as it is declared"],
  ] as const)
    assert.deepEqual(
      cases(
        edited(succeeding(withVerify), CASES, (t) =>
          t.replace("// Why: src/add.ts\n// Suite", `${added}\n\n// Why: src/add.ts\n// Suite`),
        ),
      ),
      redefinedAll,
      why,
    );
  // Where one top-level statement ends and the next begins is the transformer's to say, never the layout's: every
  // reading of the frame (its imports, its statements, what is added and whether that is inert, and what trails a
  // case on its line) takes its statements as the transformer prints them.
  const spaced = succeeding(
    edited(succeeding(R0), CASES, (t) =>
      t.replace(
        'import { greet } from "../src/greet.js";\n',
        'import { greet } from "../src/greet.js";\n\nconst one = 1;\nconst two = 2;\n',
      ),
    ),
  );
  const was = new Map(definitions(spaced).map((d) => [`${d.file}: ${d.title}`, d]));
  const against = (candidate: string) =>
    definitions(candidate).flatMap((d) => {
      const at = was.get(`${d.file}: ${d.title}`);
      const why = at && redefined(at, d, candidate);
      return why && d.file === CASES ? [`${d.title}: ${why}`] : [];
    });
  const everyCase = definitions(spaced)
    .filter((d) => d.file === CASES)
    .map((d) => `${d.title}: ${CASES} no longer states what it did around its cases`);
  const laid = (from: string, to: string) => against(edited(succeeding(spaced), CASES, (t) => t.replace(from, to)));
  // Laid out otherwise, the same statements: on one line, or one broken across lines.
  assert.deepEqual(laid("const one = 1;\nconst two = 2;", "const one = 1; const two = 2;"), []);
  assert.deepEqual(laid("const one = 1;", "const one =\n1;"), []);
  for (const [from, to, why] of [
    [
      "const two = 2;",
      "const two = 2; function Number() {\n  return 3;\n}",
      "a declaration beside another, taking a name",
    ],
    ["const two = 2;", "const two = 2; globalThis.skipped = true;", "an assignment beside a declaration"],
    [
      'import { greet } from "../src/greet.js";',
      'import { greet } from "../src/greet.js"; globalThis.skipped = true;',
      "an assignment beside an import",
    ],
    [GREETS, `${GREETS} globalThis.skipped = true;`, "an assignment trailing a case on its line"],
  ] as const)
    assert.deepEqual(laid(from, to), everyCase, why);
  // How a module is compiled is the state's to say, as tsx reads it: its tsconfig, and what that extends, decide
  // whether an import used for nothing is kept, and so loads; and every kind of module tsx runs is code, a loader
  // with JSX too, whose own imports are followed.
  const judging = (accepted: string) => {
    const at = new Map(definitions(accepted).map((d) => [`${d.file}: ${d.title}`, d]));
    return (candidate: string) =>
      definitions(candidate).flatMap((d) => {
        const was = at.get(`${d.file}: ${d.title}`);
        const why = was && redefined(was, d, candidate);
        return why && d.file === CASES ? [`${d.title}: ${why}`] : [];
      });
  };
  const all = (state: string, why: string) =>
    definitions(state)
      .filter((d) => d.file === CASES)
      .map((d) => `${d.title}: ${why}`);
  const configured = succeeding(R0);
  fs.writeFileSync(
    path.join(configured, "base.json"),
    '{\n  // Kept as written.\n  "compilerOptions": { "verbatimModuleSyntax": true },\n}\n',
  );
  fs.writeFileSync(path.join(configured, "tsconfig.json"), '{ "extends": "./base.json" }\n');
  const unusedImport = (state: string) =>
    edited(succeeding(state), CASES, (t) =>
      t.replace(
        'import test from "node:test";\n',
        'import test from "node:test";\nimport { bye } from "../src/bye.js";\n',
      ),
    );
  assert.deepEqual(
    judging(configured)(unusedImport(configured)),
    all(configured, `${CASES} no longer states what it did around its cases`),
  );
  // The settings themselves are what every case is compiled with: kept, nothing changes; changed, as a factory JSX is
  // compiled to, the same code can run otherwise, so every case is another.
  assert.deepEqual(judging(configured)(succeeding(configured)), []);
  assert.deepEqual(
    judging(configured)(
      edited(succeeding(configured), "base.json", (t) =>
        t.replace('"verbatimModuleSyntax": true', '"verbatimModuleSyntax": true, "jsxFactory": "h"'),
      ),
    ),
    all(configured, "the settings its code is compiled with are others"),
  );
  // A module named by an alias the tsconfig maps into the state is the module tsx loads, and is followed.
  const aliasing = succeeding(R0);
  fs.writeFileSync(
    path.join(aliasing, "tsconfig.json"),
    '{ "compilerOptions": { "baseUrl": ".", "paths": { "@data/*": ["scripts/test-data/*"] } } }\n',
  );
  fs.writeFileSync(path.join(aliasing, "scripts/test-data/limit.ts"), "export const limit = 3;\n");
  edited(aliasing, CASES, (t) =>
    t.replace(
      'import test from "node:test";\n',
      'import test from "node:test";\nimport { limit } from "@data/limit.js";\n\nvoid limit;\n',
    ),
  );
  const aliased = succeeding(aliasing);
  assert.deepEqual(
    judging(aliased)(edited(succeeding(aliased), "scripts/test-data/limit.ts", () => "export const limit = 4;\n")),
    all(aliased, "scripts/test-data/limit.ts, which it reaches, no longer states what it did"),
  );
  const viewing = succeeding(R0);
  fs.writeFileSync(path.join(viewing, "scripts/test-data/limit.ts"), "export const limit = 3;\n");
  fs.writeFileSync(
    path.join(viewing, "scripts/test-data/view.tsx"),
    'import { limit } from "./limit.js";\nexport const view = () => <b>{limit}</b>;\n',
  );
  edited(viewing, CASES, (t) =>
    t.replace(
      'import test from "node:test";\n',
      'import test from "node:test";\nimport { view } from "./test-data/view.js";\n\nvoid view;\n',
    ),
  );
  const viewed = succeeding(viewing);
  assert.deepEqual(
    judging(viewed)(edited(succeeding(viewed), "scripts/test-data/limit.ts", () => "export const limit = 4;\n")),
    all(viewed, "scripts/test-data/limit.ts, which it reaches, no longer states what it did"),
  );
  // The same modules loaded in another order: they are evaluated in the order they are first imported.
  assert.deepEqual(
    cases(
      edited(succeeding(withVerify), CASES, (t) =>
        t.replace(
          'import { add } from "../src/add.js";\nimport { greet } from "../src/greet.js";\n',
          'import { greet } from "../src/greet.js";\nimport { add } from "../src/add.js";\n',
        ),
      ),
    ),
    redefinedAll,
  );
  // A module the file did not load, loaded now: its code runs beside the cases. An import of it used for nothing, or
  // only as a type, loads nothing, as the module is compiled.
  const importing = (line: string) =>
    cases(
      edited(succeeding(withVerify), CASES, (t) =>
        t.replace('import test from "node:test";\n', `import test from "node:test";\n${line}\n`),
      ),
    );
  assert.deepEqual(importing('import "../src/bye.js";'), redefinedAll);
  assert.deepEqual(importing('import { bye } from "../src/bye.js";'), []);
  // Imported only as a type in the accepted file, the module was never loaded there: loading it now is loading anew.
  const typed = succeeding(
    edited(withVerify, CASES, (t) =>
      t.replace(
        'import test from "node:test";\n',
        'import test from "node:test";\nimport type { bye } from "../src/bye.js";\n',
      ),
    ),
  );
  const wasTyped = new Map(definitions(typed).map((d) => [`${d.file}: ${d.title}`, d]));
  const againstTyped = (candidate: string) =>
    definitions(candidate).flatMap((d) => {
      const was = wasTyped.get(`${d.file}: ${d.title}`);
      const why = d.file === CASES && was && redefined(was, d, candidate);
      return why ? [`${d.title}: ${why}`] : [];
    });
  assert.deepEqual(
    againstTyped(
      edited(succeeding(typed), CASES, (t) =>
        t.replace(
          'import type { bye } from "../src/bye.js";\n',
          'import type { bye } from "../src/bye.js";\nimport "../src/bye.js";\n',
        ),
      ),
    ),
    redefinedAll,
  );
});

// Why: requirements/protection-evolution/requirement.md
test("the reader of a case's source tells code from strings, templates, regular expressions and comments, and says where it cannot know", () => {
  const kinds = (text: string) => tokens(text).map((t) => `${t.kind} ${t.text}`);
  // A slash after a statement's parenthesis or a block begins a regular expression; after a value, it divides.
  assert.deepEqual(kinds("if (a) /x\\/)/.test(b);").slice(4, 5), ["regex /x\\/)/"]);
  assert.deepEqual(kinds("f(a) / 2 / g;").slice(4, 7), ["punct /", "number 2", "punct /"]);
  assert.deepEqual(kinds("{ go(); } /re/.test(x);").slice(6, 7), ["regex /re/"]);
  assert.deepEqual(kinds("x = {} / 2;").slice(3, 5), ["punct }", "punct /"]);
  // Nothing inside a string, template or comment is code, however it reads.
  const hidden = tokens('const s = "test(\\"x\\", () => {});"; // test("y")\nconst t = `}); ${"}"} ${`${a}`}`;');
  assert.deepEqual(
    hidden.filter((t) => t.kind === "name").map((t) => t.text),
    ["const", "s", "const", "t"],
  );
  const template = hidden.find((t) => t.kind === "template")!;
  assert.deepEqual(interpolations(template), ['${"}"}', "${`${a}`}"]);
  assert.deepEqual(templatePrefix(template), { text: "}); ", computed: true });
  assert.equal(stringValue(tokens(`'it\\'s \\"q\\" \\x41\\u{1F600}'`)[0]!), `it's "q" A\u{1F600}`);

  const state = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-reader-"));
  fs.mkdirSync(path.join(state, "scripts/fixtures"), { recursive: true });
  fs.mkdirSync(path.join(state, "src"));
  fs.writeFileSync(path.join(state, "package.json"), '{ "scripts": { "test": "tsx --test scripts/*.test.ts" } }\n');
  fs.writeFileSync(path.join(state, "scripts/fixtures/a.txt"), "a\n");
  fs.writeFileSync(
    path.join(state, "src/shout.ts"),
    [
      'import type { X } from "./types.js"; // a + b',
      "export const shout = (s: string, n: number): string =>",
      '  n > 0 ? `${s.toUpperCase()}${"!".repeat(n)} ${`x${s}`}` : s + "";',
    ].join("\n") + "\n",
  );
  const cases = [
    'import assert from "node:assert/strict";',
    'import fs from "node:fs";',
    'import test from "node:test";',
    'import { shout } from "../src/shout.js";',
    "",
    "// Why: a.md",
    'test("reads its data by a computed name", () => {',
    '  const name = "a";',
    '  assert.ok(fs.readFileSync(new URL(`./fixtures/${name}.txt`, import.meta.url), "utf8"));',
    '  assert.match("});", /\\)/);',
    "});",
    "",
    "// Why: a.md",
    'test("shouts", () => {',
    '  assert.equal(shout("a", 1), "A! xa");',
    "});",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(state, "scripts/x.test.ts"), cases);
  const [computed, shouts] = definitions(state);
  // Each case is its whole statement, whatever its strings and patterns hold, and nothing of the other.
  assert.match(computed!.claim, /assert\.match\("\}\);",\/\\\)\/\)\}\);$/);
  assert.ok(!computed!.claim.includes("shout"));
  assert.equal(shouts!.claim, 'test("shouts",()=>{assert.equal(shout("a",1),"A! xa")});');
  assert.deepEqual(computed!.frame.statements, []);
  // Data named by a template: the directory its certain part names.
  assert.deepEqual(Object.keys(computed!.data).sort(), ["scripts/fixtures/a.txt"]);
  assert.deepEqual(shouts!.subjects, ["src/shout.ts"]);
  // Witnesses change code only: not a specifier, a type or a comment, and a template keeps what it interpolates.
  assert.deepEqual(
    witnesses(state, ["src/shout.ts"]).map((w) => `${w.line}: ${w.from} → ${w.to}`),
    [
      "3: > → <=",
      "3: 0 → 1",
      '3: `${s.toUpperCase()}${"!".repeat(n)} ${`x${s}`}` → `${s.toUpperCase()}${"!".repeat(n)}${`x${s}`}`',
      '3: "!" → ""',
      "3: `x${s}` → `${s}`",
      "3: + → -",
      '3: "" → "x"',
    ],
  );
  // A module imported by a name computed as it runs: what defines the cases reaching it cannot be compared.
  fs.writeFileSync(path.join(state, "src/loader.ts"), "export const load = (m: string) => import(`./${m}.js`);\n");
  fs.writeFileSync(
    path.join(state, "scripts/x.test.ts"),
    cases.replace(
      'import { shout } from "../src/shout.js";',
      'import { shout } from "../src/shout.js";\nimport { load } from "../src/loader.js";\n\nvoid load;',
    ),
  );
  const unknown = definitions(state)[1]!;
  assert.deepEqual(unknown.computed, ["src/loader.ts"]);
  assert.match(redefined(unknown, unknown, state) ?? "", /src\/loader\.ts reaches what is named only as it runs/);
  // Which modules code loads is the transformer's to say: compiled as tsx runs it, then every module the bundler finds
  // named in it. However a literal is wrapped, it names its module; what only a type names loads nothing.
  const named = (file: string, text: string) => {
    const read = moduleImports(state, file, text);
    return read.computed ? [...read.specifiers, "computed"] : read.specifiers;
  };
  assert.deepEqual(
    named(
      "x.mjs",
      [
        'import a from "./a.js";',
        'export * from "./b.js";',
        'import "./c.js";',
        'await import(("./d.js"));',
        'await import(((`./e.js`)), { with: { type: "json" } });',
        'require(("./f.js"));',
        'x.require("./not-a-module.js");',
        "import.meta.url;",
      ].join("\n"),
    ),
    ["./a.js", "./b.js", "./c.js", "./d.js", "./e.js", "./f.js"],
  );
  assert.deepEqual(
    named(
      "x.ts",
      'import type { T } from "./t.js";\nimport { unused } from "./u.js";\nlet y: typeof import("./y.js");\nimport "./z.js";',
    ),
    ["./z.js"],
  );
  // Whatever the bundler cannot name is computed as it runs: a name, a pattern, a loader reached other than by
  // calling it where it is named, and code evaluated from text, which sees every binding beside it.
  for (const text of [
    "await import((m));",
    'await import(("./" + m));',
    "require((`./${m}`));",
    'await import(("./a.js") + m);',
    'require?.("./a.js");',
    "const load = require;",
    'eval("typeof bypass");',
  ])
    assert.ok(named("x.ts", text).includes("computed"), text);
  assert.deepEqual(named("x.ts", 'obj.eval("x");\nobj?.require("./b.js");\nobj.import;'), []);
  // Code a template interpolates is code: a module it names is followed, and data it names is bound.
  fs.writeFileSync(path.join(state, "scripts/fixtures/b.txt"), "b\n");
  fs.writeFileSync(
    path.join(state, "src/loader.ts"),
    'export const load = () => `${require("./shout.js")} ${require("../scripts/fixtures/b.txt")}`;\n',
  );
  const interpolated = definitions(state)[1]!;
  assert.deepEqual([interpolated.subjects, interpolated.computed], [["src/loader.ts", "src/shout.ts"], []]);
  fs.writeFileSync(path.join(state, "src/loader.ts"), "export const load = (m: string) => `${require(m)}`;\n");
  assert.deepEqual(definitions(state)[1]!.computed, ["src/loader.ts"]);
  // So is one named by a literal with anything joined to it: the literal is not the module's name.
  for (const call of ['import("./" + m + ".js")', 'require("./" + m)'])
    (fs.writeFileSync(path.join(state, "src/loader.ts"), `export const load = (m: string) => ${call};\n`),
      assert.deepEqual(definitions(state)[1]!.computed, ["src/loader.ts"], call));
});

// Why: requirements/protection-evolution/requirement.md
test("each retirement is judged by the witnesses of the code its own cases reach, however many other retirements reach", () => {
  const R0 = base();
  // Adding's case and goodbye's case, each rewritten to claim the same: each reaches two witnesses, three between them.
  const both = edited(
    edited(succeeding(R0), CASES, (t) =>
      t.replace("  assert.equal(add(1, 2), 3);", "  const sum = add(1, 2);\n  assert.equal(sum, 3);"),
    ),
    "scripts/bye.test.ts",
    (t) => t.replace("assert.ok(bye(name).includes(says));", "assert.ok(bye(name).includes(says), name);"),
  );
  const derived = nextRegression(R0, both);
  const judge = (max: number) =>
    evolution(
      R0,
      both,
      derived.protection,
      protectionOf(both).protection,
      derived.inherited,
      derived.promises,
      new Set(),
      max,
    )
      .changes.filter((c) => c.verdict !== "strengthened")
      .map((c) => `${c.verdict} ${c.what}`)
      // Adding's case carries adding and the suite serving the plan: each retires, judged alike.
      .filter((c, i, all) => all.indexOf(c) === i)
      .sort();
  assert.deepEqual(judge(2), [
    'preserved scripts/bye.test.ts: "says goodbye to each name its fixture lists"',
    `preserved ${CASES}: "adds"`,
  ]);
  assert.deepEqual(judge(1), [
    'unresolved scripts/bye.test.ts: "says goodbye to each name its fixture lists"',
    `unresolved ${CASES}: "adds"`,
  ]);
  // Judging leaves nothing behind: every copy made to run a witness, or the cases against it, is removed.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-scratch-"));
  const was = process.env.TMPDIR;
  process.env.TMPDIR = scratch;
  try {
    judge(2);
  } finally {
    // Unset stays unset: an environment variable given undefined would hold the text "undefined".
    if (was === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = was;
  }
  // Only the test runner's own compile cache stays: it is tsx's, kept for any later run.
  assert.deepEqual(
    fs.readdirSync(scratch).filter((entry) => !entry.startsWith("tsx-")),
    [],
  );
});

// Why: requirements/protection-evolution/requirement.md
test("a case entering at an inherited case's address is judged by its own result, never by the inherited case's", () => {
  const R0 = base();
  // A second "adds", expecting what only the candidate does, beside the inherited "adds" that holds of both states.
  const duplicate = edited(
    edited(
      succeeding(R0),
      "src/add.ts",
      () => "export const add = (a: number, b: number): number => (a === 2 && b === 2 ? 5 : a + b);\n",
    ),
    CASES,
    (t) => `${t}\n// Why: src/add.ts\ntest("adds", () => {\n  assert.equal(add(2, 2), 5);\n});\n`,
  );
  const errors = judged(R0, duplicate);
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.match(
    errors[0]!,
    /^scripts\/cases\.test\.ts: "adds": unresolved: added: .*does not hold of the accepted state/,
  );
  // The same duplicate expecting what both states do enters as more protection.
  const agreeing = edited(
    succeeding(R0),
    CASES,
    (t) => `${t}\n// Why: src/add.ts\ntest("adds", () => {\n  assert.equal(add(2, 2), 4);\n});\n`,
  );
  assert.deepEqual(judged(R0, agreeing), []);
  assert.deepEqual(verdicts(R0, agreeing), [`strengthened ${CASES}: "adds"`]);
});

// Why: requirements/protection-evolution/requirement.md
test("a case entering is judged by its own occurrence throughout: its own result, its own defects, whatever its title holds", () => {
  const R0 = base();
  // The inherited "greets" tests a recorded defect; a second "greets", expecting what only the candidate does, tests none.
  fs.cpSync(
    path.join(fileURLToPath(new URL("../test-data/protection-evolution/repaired/defects", import.meta.url))),
    path.join(R0, "defects"),
    { recursive: true },
  );
  edited(R0, CASES, (t) =>
    t.replace(`${GREETING_LINK}\n${GREETS}`, `${GREETING_LINK}\n// Tests: defects/greets-untrimmed\n${GREETS}`),
  );
  const borrowing = edited(
    edited(
      succeeding(R0),
      "src/greet.ts",
      () => 'export const greet = (name: string): string => (name === "y" ? "hey y" : `hello ${name}`);\n',
    ),
    CASES,
    (t) => `${t}\n${GREETING_LINK}\ntest("greets", () => {\n  assert.equal(greet("y"), "hey y");\n});\n`,
  );
  const errors = judged(R0, borrowing);
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.match(
    errors[0]!,
    /^scripts\/cases\.test\.ts: "greets": unresolved: added: .*does not hold of the accepted state/,
  );
  // A title holding a NUL is a title like any other.
  const nul = edited(
    succeeding(R0),
    CASES,
    (t) => `${t}\n// Why: src/add.ts\ntest("adds\\u0000nothing", () => {\n  assert.equal(add(0, 0), 0);\n});\n`,
  );
  assert.deepEqual(judged(R0, nul), []);
  assert.deepEqual(verdicts(R0, nul), [`strengthened ${CASES}: "adds\\u0000nothing"`]);
});
