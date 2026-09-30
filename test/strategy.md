# KAAL's Test Strategy

How KAAL uses the `testing` skill. Why KAAL uses it is in BRAIN.

## Protection is owned by Changes

Each Change carries its own protection transition, sparsely, beneath its occurrence's `test/`: `change/<lineage>/YY/MM/DD/CC/test/`.

- **Suites** it contributes, one directory per concern, such as `test/testing/`.
- **Feature Plan**, `test/feature.md`: the Suites the Change introduces.
- **Acceptance Plan**, `test/acceptance.md`: accepted Suites the Change gives up. Present only when it gives some up.
- **Regression Test Plan**, `test/regression.md`: every Suite that must hold after the Change lands.

Feature adds, Acceptance removes, Regression projects. Plans use the `testing` Plan format, Markdown whose body states the Plan's meaning for its reviewers and whose frontmatter lists its `suites` by path from the repository root, so a Plan can name a Suite of its own Change or of any earlier one. The Plan alone decides membership: where a Suite is stored implies nothing. Plans and Suites are the Change's own material and are sealed with it, so a sealed Suite a Plan names never changes beneath it.

## Supersession

A new Regression Test Plan supersedes the one before it, backward: its own frontmatter names the Plan it supersedes, `supersedes: change/<lineage>/YY/MM/DD/CC/test/regression.md`, and the old Plan is never edited. `supersedes` is KAAL's, not Testing's: Testing never reads it. The first Regression Test Plan supersedes nothing. KAAL's rules: no Plan may be superseded twice, and the current Regression Test Plan is the one Plan no other supersedes. KAAL does not yet derive it: until it does, CI names the Plan it runs.

Whether a Change's Regression Test Plan follows from the one it supersedes, with its Feature and Acceptance Plans, is for review to judge. Testing never decides that a Suite left out was given up.

## Cases

A Case reaches what it tests through its working directory, the candidate, and the candidate's public entry points, never through its own location, so a sealed Case can judge candidates written after it.

A Carrier is a `*.test.*` file; a Test Case is one top-level `node:test` call in it, identified by the Carrier's path and its literal name. A Test Case states the Requirements and Defects it tests in the literal `tests` option of its call, `{ tests: { requirement: ["<id>"], defect: ["<id>"] } }`, read from the source without running it. The reference belongs to the Test Case: the Requirement or Defect it names is never changed, and later Test Cases may reference earlier sealed meaning. `npm run test-cases:check` refuses a reference whose id names no Requirement or Defect in any Change, and `npm run test-cases:check -- requirement <id>` (or `defect <id>`) lists the Test Cases that test one, computed from them. A Test Case tests only what it names: a Requirement that supersedes another is not tested by the Test Cases of the one it supersedes. Runs still execute and report Carriers, not Test Cases.

## Where and when

CI runs the Regression Test Plan with `npm run testing:run -- <plan>` on Linux and Windows, checked out with `core.autocrlf=true`, on every push and pull request.

A skill's own tests stay with the skill, in `skills/<skill>/scripts/`, and run under `npm test` with KAAL's own tests in `scripts/`.
