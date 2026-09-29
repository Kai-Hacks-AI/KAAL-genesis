import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { nextRegression, projection, regressionErrors, writeProjection } from "./next-regression.js";
import { heldSkips, projectedCases, sources } from "./projection.js";
import { regressionIdentity } from "./regression.js";
import { layeredState, succeeding } from "./test-data.js";

/**
 * A synthetic regression, not KAAL's own, before it held any evidence: adding,
 * greeting, greeting by name and saying goodbye, shown by the cases of two
 * files, some of them sharing one.
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
/** A state with `file` written as `text`. */
const written = (state: string, file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(state, file)), { recursive: true });
  fs.writeFileSync(path.join(state, file), text);
  return state;
};
/** `candidate`'s evidence derived from `accepted`, admitting its own to `change`, written as npm run regression:derive writes it. */
const derived = (accepted: string, candidate: string, change?: string) => {
  const next = nextRegression(accepted, candidate);
  assert.deepEqual(next.errors, []);
  const projected = projection(accepted, candidate, next.demonstrated, change);
  assert.deepEqual(projected.errors, []);
  writeProjection(candidate, projected.held);
  return { ...projected, candidate };
};
/** A regression holding its evidence: the base regression's own testing, held as `genesis`. */
const holding = () => {
  const r0 = base();
  return derived(r0, succeeding(r0)).candidate;
};
/** What `state` holds of `change` at `file`. */
const held = (state: string, change: string, file: string) =>
  fs.readFileSync(path.join(state, "change", change, "test", file), "utf8");
/** Every case `state` projects, as `change: file: title`, sorted. */
const projecting = (state: string) =>
  projectedCases(state)
    .flatMap(({ source, cases }) => cases.map((c) => `${source.change}: ${c.file}: ${c.title}`))
    .sort();
/** Whether `errors` holds `error`, said with every error where it does not. */
const holds = (errors: string[], error: string) => assert.ok(errors.includes(error), errors.join("\n"));
const CASES = "scripts/cases.test.ts";
const BYE = "scripts/bye.test.ts";
const GENESIS_CASES = [
  `genesis: ${BYE}: greets nobody as its golden file says`,
  `genesis: ${BYE}: says goodbye to each name its fixture lists`,
  `genesis: ${CASES}: adds`,
  `genesis: ${CASES}: adds as its fixture says`,
  `genesis: ${CASES}: greets`,
  `genesis: ${CASES}: greets by name`,
];
/** An acceptance record excluding `cases`, each `[file, title]`. */
const excluding = (...cases: [string, string][]) =>
  [
    "---",
    "excludes:",
    ...cases.flatMap(([file, title]) => [
      `  - case: ${file}`,
      `    title: ${title}`,
      "    because: no longer promised",
    ]),
    "---",
    "",
  ].join("\n");
/** The adding the accepted cases protect, broken. */
const misadding = (state: string) => edited(state, "src/add.ts", (t) => t.replace("a + b", "a + b + 1"));

// Why: requirements/protection-evolution/requirement.md
test("a regression's evidence is held apart from its testing, and a candidate carrying it unchanged is judged by it and projects it as it is", () => {
  const r0 = base();
  const r1 = derived(r0, succeeding(r0)).candidate;
  // The evidence a regression had before it held any, its own testing, is held as genesis, byte for byte.
  assert.deepEqual(projecting(r1), GENESIS_CASES);
  for (const file of [CASES, BYE, "scripts/fixtures/sum.txt"])
    assert.equal(held(r1, "genesis", file), fs.readFileSync(path.join(r0, file), "utf8"));
  const r2 = succeeding(r1);
  assert.deepEqual(judged(r1, r2), []);
  assert.deepEqual(projecting(r2), GENESIS_CASES);
});

// Why: requirements/protection-evolution/requirement.md
test("a candidate rewriting an inherited case replaces nothing: the accepted case still judges it and every later candidate", () => {
  const r1 = holding();
  const weakened = (state: string) =>
    edited(state, CASES, (t) => t.replace("assert.equal(add(1, 2), 3);", "assert.ok(add(1, 2) > 0);"));
  // Weakened in its own testing and broken in its code, it is judged by the accepted case, which it cannot reach.
  holds(
    judged(r1, misadding(weakened(succeeding(r1)))),
    `inherited case not excluded: change/genesis/test/${CASES}: "adds" failed`,
  );
  // Weakened alone, it is accepted, and what it projects is still the accepted case, byte for byte: its own enters
  // beside it, as evidence of its own, never in its place.
  const r2 = derived(r1, weakened(succeeding(r1)), "rewrite").candidate;
  assert.deepEqual(judged(r1, r2), []);
  assert.equal(held(r2, "genesis", CASES), held(r1, "genesis", CASES));
  assert.match(held(r2, "rewrite", CASES), /assert\.ok\(add\(1, 2\) > 0\)/);
  // The next candidate, breaking what the accepted case protects, is still judged by it.
  holds(
    judged(r2, misadding(succeeding(r2))),
    `inherited case not excluded: change/genesis/test/${CASES}: "adds" failed`,
  );
});

// Why: requirements/protection-evolution/requirement.md
test("a candidate removing an inherited case from its own testing gives nothing up: without an acceptance record it is still judged and projected", () => {
  const r1 = holding();
  const without = succeeding(r1);
  fs.rmSync(path.join(without, BYE));
  // Nothing it does not carry is lost: it is accepted, projecting what it no longer runs itself.
  assert.deepEqual(judged(r1, without), []);
  assert.deepEqual(projecting(without), GENESIS_CASES);
  // And what it no longer carries still judges it.
  holds(
    judged(
      r1,
      edited(succeeding(without), "src/bye.ts", (t) => t.replace("goodbye", "farewell")),
    ),
    `inherited case not excluded: change/genesis/test/${BYE}: "says goodbye to each name its fixture lists" failed`,
  );
});

// Why: requirements/protection-evolution/requirement.md
test("evidence of a candidate's own for what is already promised enters beside the accepted evidence only where the accepted code holds it", () => {
  const r1 = holding();
  const more = written(
    succeeding(r1),
    "scripts/more.test.ts",
    [
      'import assert from "node:assert/strict";',
      'import test from "node:test";',
      'import { add } from "../src/add.js";',
      "",
      "// Why: src/add.ts",
      'test("adds zero", () => {',
      "  assert.equal(add(2, 0), 2);",
      "});",
      "",
      "// Why: src/add.ts",
      'test("adds to five", () => {',
      "  assert.equal(add(2, 2), 5);",
      "});",
      "",
    ].join("\n"),
  );
  // Its own code made to agree with what it now expects: only its own output judges "adds to five".
  edited(more, "src/add.ts", (t) => t.replace("a + b", "a === 2 && b === 2 ? 5 : a + b"));
  const { held: evidence } = derived(r1, more, "more");
  assert.deepEqual(
    evidence.find((h) => h.change === "more")!.skips.map((s) => `${s.file}: ${s.title}`),
    ["scripts/more.test.ts: adds to five"],
  );
  assert.deepEqual(judged(r1, more), []);
  assert.deepEqual(projecting(more), [...GENESIS_CASES, "more: scripts/more.test.ts: adds zero"].sort());
});

// Why: requirements/protection-evolution/requirement.md
test("acceptance gives up one case of a file whose others it keeps, and the file is still projected as it was held, without it", () => {
  const r1 = holding();
  // Greeting someone by name comes to say hi: the case of it is given up, while the others of its file still judge.
  const plainer = succeeding(r1);
  edited(
    plainer,
    "src/greet.ts",
    () => 'export const greet = (name: string): string => (name ? `hi ${name}` : "hello ");\n',
  );
  edited(plainer, CASES, (t) => t.replace('"hello x"', '"hi x"'));
  written(plainer, "acceptance/greets-plainly.md", excluding([CASES, "greets"]));
  const genesis = derived(r1, plainer).held.find((h) => h.change === "genesis")!;
  assert.deepEqual(
    genesis.skips.map((s) => `${s.file}: ${s.title}: ${s.because}`),
    [`${CASES}: greets: given up by acceptance/greets-plainly.md`],
  );
  // Only the case given up is passed over: every other of its file, and of every file, still judges it.
  assert.deepEqual(judged(r1, plainer), []);
  // The shared file is held as it was accepted, byte for byte, never rewritten without the case given up.
  assert.equal(held(plainer, "genesis", CASES), held(r1, "genesis", CASES));
  assert.deepEqual(
    projecting(plainer),
    GENESIS_CASES.filter((c) => c !== `genesis: ${CASES}: greets`),
  );
  // The next candidate is judged by what is still projected, and by nothing given up.
  const next = succeeding(plainer);
  assert.deepEqual(judged(plainer, next), []);
  assert.equal(heldSkips(sources(next)[0]!).length, 1);
  // Without the record, the case not given up judges the same candidate.
  const unrecorded = succeeding(r1);
  edited(
    unrecorded,
    "src/greet.ts",
    () => 'export const greet = (name: string): string => (name ? `hi ${name}` : "hello ");\n',
  );
  edited(unrecorded, CASES, (t) => t.replace('"hello x"', '"hi x"'));
  holds(judged(r1, unrecorded), `inherited case not excluded: change/genesis/test/${CASES}: "greets" failed`);
});

// Why: requirements/protection-evolution/requirement.md
test("once every case a held file projects is given up, the file is no longer held, and once a change holds none, neither is its evidence", () => {
  const r1 = holding();
  const farewell = edited(succeeding(r1), "test/regression-plan.md", (t) =>
    t.replace("4. Saying goodbye. Stated in `requirements/says-goodbye/requirement.md`. Shown by its cases.\n", ""),
  );
  fs.rmSync(path.join(farewell, BYE));
  written(
    farewell,
    "acceptance/no-goodbyes.md",
    excluding([BYE, "says goodbye to each name its fixture lists"], [BYE, "greets nobody as its golden file says"]),
  );
  derived(r1, farewell);
  assert.equal(fs.existsSync(path.join(farewell, "change", "genesis", "test", BYE)), false);
  assert.deepEqual(
    projecting(farewell),
    GENESIS_CASES.filter((c) => !c.startsWith(`genesis: ${BYE}`)),
  );
  assert.deepEqual(judged(r1, farewell), []);
  // Given up whole, a change's evidence is not held at all.
  const none = written(
    succeeding(r1),
    "acceptance/everything.md",
    excluding(...GENESIS_CASES.map((c) => c.slice("genesis: ".length).split(": ") as [string, string])),
  );
  assert.deepEqual(
    projection(r1, none, []).held.map((h) => h.change),
    [],
  );
});

// Why: requirements/protection-evolution/requirement.md
test("a new promise enters with the evidence that demonstrates it, beside every inherited case, and never without it", () => {
  const r1 = holding();
  const waving = succeeding(r1);
  written(waving, "src/wave.ts", "export const wave = (name: string): string => `~ ${name}`;\n");
  written(
    waving,
    "requirements/waves/requirement.md",
    "---\nholds: a wave is returned for every greeting\n---\n\nWhoever is greeted is waved at.\n",
  );
  written(
    waving,
    "scripts/waves.test.ts",
    'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { wave } from "../src/wave.js";\n\n// Why: requirements/waves/requirement.md\ntest("waves", () => {\n  assert.equal(wave("x"), "~ x");\n});\n',
  );
  edited(waving, "test/regression-plan.md", (t) =>
    t.replace(
      "4. Saying goodbye. Stated in `requirements/says-goodbye/requirement.md`. Shown by its cases.",
      "4. Saying goodbye. Stated in `requirements/says-goodbye/requirement.md`. Shown by its cases.\n5. Waving. Stated in `requirements/waves/requirement.md`. Shown by its cases.",
    ),
  );
  // Demonstrated, but held nowhere: refused, since once accepted nothing would show it.
  const unheld = judged(r1, waving);
  assert.ok(
    unheld.some((e) =>
      e.startsWith("requirements/waves/requirement.md: newly promised and demonstrated, but no evidence"),
    ),
    unheld.join("\n"),
  );
  // Held by the change bringing it, beside everything inherited.
  derived(r1, waving, "waving");
  assert.deepEqual(judged(r1, waving), []);
  assert.deepEqual(projecting(waving), [...GENESIS_CASES, "waving: scripts/waves.test.ts: waves"].sort());
});

// Why: requirements/protection-evolution/requirement.md
test("a case expecting what the accepted code did not do enters only as the test of a defect the candidate records", () => {
  const r1 = holding();
  const TRIMMED = "repair: scripts/trimmed.test.ts: greets a name given with space around it by the name alone";
  // It fails against the accepted code, and is admitted all the same, as the defect it tests is recorded.
  const repaired = succeeding(r1, "protection-evolution/repaired");
  assert.deepEqual(derived(r1, repaired, "repair").held.find((h) => h.change === "repair")?.skips, []);
  assert.ok(projecting(repaired).includes(TRIMMED));
  // Without the defect recorded, nothing but the candidate's own output judges it: it is not held at all.
  const unrecorded = succeeding(r1, "protection-evolution/repaired");
  fs.rmSync(path.join(unrecorded, "defects"), { recursive: true });
  const { held: without, notes } = derived(r1, unrecorded, "repair");
  assert.equal(
    without.find((h) => h.change === "repair"),
    undefined,
  );
  holds(notes, "scripts/trimmed.test.ts: none of its cases is admitted, so it is not held");
});

// Why: requirements/protection-evolution/requirement.md
test("the same case at the same path is held apart by the change holding it: each is projected and replayed on its own", () => {
  const r1 = holding();
  const more = edited(succeeding(r1), CASES, (t) =>
    t.replace("assert.equal(add(1, 2), 3);", "assert.equal(add(1, 2), 3);\n  assert.equal(add(0, 0), 0);"),
  );
  derived(r1, more, "more");
  assert.deepEqual(
    projecting(more),
    [
      ...GENESIS_CASES,
      `more: ${CASES}: adds`,
      `more: ${CASES}: adds as its fixture says`,
      `more: ${CASES}: greets`,
      `more: ${CASES}: greets by name`,
    ].sort(),
  );
  assert.notEqual(held(more, "more", CASES), held(more, "genesis", CASES));
  // A next candidate breaking what only the stronger case sees is judged by it, held where it was admitted.
  holds(
    judged(
      more,
      edited(succeeding(more), "src/add.ts", (t) => t.replace("a + b", "a === 0 ? 1 : a + b")),
    ),
    `inherited case not excluded: change/more/test/${CASES}: "adds" failed`,
  );
  // Given up at its address, the case is given up in every change holding it.
  const plain = written(succeeding(more), "acceptance/adds-plainly.md", excluding([CASES, "adds"]));
  assert.deepEqual(
    derived(more, plain).held.map((h) => `${h.change}: ${h.skips.map((s) => s.title).join(", ")}`),
    ["genesis: adds", "more: adds"],
  );
});

// Why: requirements/protection-evolution/requirement.md
test("a candidate holds exactly the evidence projected for it: a held case weakened or dropped by hand is refused", () => {
  const r1 = holding();
  const tampered = edited(succeeding(r1), `change/genesis/test/${CASES}`, (t) =>
    t.replace("assert.equal(add(1, 2), 3);", "assert.ok(true);"),
  );
  const weakened = judged(r1, tampered);
  assert.ok(
    weakened.some((e) => e.startsWith("change/genesis/test: not the evidence the regression projects, byte for byte")),
    weakened.join("\n"),
  );
  const dropped = succeeding(r1);
  fs.rmSync(path.join(dropped, "change"), { recursive: true });
  holds(judged(r1, dropped), "change/genesis/test: the regression projects it, but the candidate does not hold it");
});
