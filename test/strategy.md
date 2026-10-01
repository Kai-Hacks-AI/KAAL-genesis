# KAAL's Test Strategy

How KAAL uses the `testing` skill. Why KAAL uses it is in BRAIN.

## Protection is owned by Changes

Each Change carries its own protection transition, sparsely, beneath its occurrence's `test/`: `change/<lineage>/YY/MM/DD/CC/test/`.

- **Suites** it contributes, one directory per concern, such as `test/testing/`.
- **Feature Plan**, `test/feature.md`: the Suites the Change introduces.
- **Authorise Plan**, `test/authorise.md`: the Suites the Change explicitly authorises to leave protection. Present only when it authorises some.
- **Regression Test Plan**, `test/regression.md`: every Suite that must hold after the Change lands.

Feature adds, Authorise removes, Regression projects. Omission has no authority: a Suite the Change leaves out stays in the Regression Test Plan unless its Authorise Plan authorises it. Plans use the `testing` Plan format, Markdown whose body states the Plan's meaning for its reviewers and whose frontmatter lists its `suites` by path from the repository root, so a Plan can name a Suite of its own Change or of any earlier one. The Plan alone decides membership: where a Suite is stored implies nothing. Plans and Suites are the Change's own material and are sealed with it, so a sealed Suite a Plan names never changes beneath it. Authorise was earlier called Acceptance: material written under that word, such as an `acceptance.md`, says Acceptance and is never renamed, and means Authorise.

## Supersession

A new Regression Test Plan supersedes the one before it, backward: its own frontmatter names the Plan it supersedes, `supersedes: change/<lineage>/YY/MM/DD/CC/test/regression.md`, and the old Plan is never edited. `supersedes` is KAAL's, not Testing's: Testing never reads it. The first Regression Test Plan supersedes nothing. KAAL's rules: no Plan may be superseded twice, and the current Regression Test Plan is the one Plan no other supersedes. KAAL does not yet derive it: until it does, CI names the Plan it runs.

Whether a Change's Regression Test Plan follows from the one it supersedes, with its Feature and Authorise Plans, is for review to judge. Testing never decides that a Suite left out was given up.

## Cases

A Case reaches what it tests through its working directory, the candidate, and the candidate's public entry points, never through its own location, so a sealed Case can judge candidates written after it.

A Carrier is a `*.test.*` file. A traceable Test Case is one canonical declaration in it, a top-level `test("name", { tests: { requirement: ["<id>"], defect: ["<id>"] } }, fn)` through the Carrier's `import test from "node:test"`, identified by the Carrier's path and its string-literal name and listed as the one-line JSON array `[carrier, name]`. It is read from the source without running it, and it declares what the Test Case tests; it does not say that Node ran it, which a Run shows, carrier by carrier. Every other use of `node:test` is ordinary Node syntax that KAAL neither reads nor refuses. The declaration belongs to the Test Case: the Requirement or Defect it names is never changed, and later Test Cases may declare earlier sealed meaning. `npm run test-cases:check` refuses a declaration whose id names no Requirement or Defect in any Change, and `npm run test-cases:check -- requirement <id>` (or `defect <id>`) lists the Test Cases that declare one, computed from them. A Test Case tests only what it names: a Requirement that supersedes another is not tested by the Test Cases of the one it supersedes. A Test Case may supersede an earlier one with `supersedes: [carrier, name]` in the same declaration: its HOW is new, and the earlier Test Case is never edited, deleted or made unrunnable, so earlier material can still use it. KAAL accepts the relation across Changes, so `npm run test-cases:check` also refuses what Testing refuses of a supersession, with every Test Case of every Change as the material considered, and `npm run test-cases:check -- current requirement <id>` lists the Test Cases that are active for a Requirement: those that test it and that no later Test Case of their own lineage tests too. Activity is per `tests` edge, so a Test Case superseded for one Requirement stays active for another it alone tests. `npm run test-cases:check -- carriers requirement <id>...` (or `defect`) lists, from the same material, the Carriers that hold the Test Cases active for any of the ids: derived runnable scope, computed and never stored, so a Carrier whose Test Cases are all superseded for those ids is left out and one that still holds an active Test Case stays. Which ids are protected is the caller's to say. It decides nothing about Plans: a Plan still collects whole Suites and a Run executes every Carrier of them.

## Where and when

CI runs the Regression Test Plan with `npm run testing:run -- <plan>` on Linux and Windows, checked out with `core.autocrlf=true`, on every push and pull request.

A skill's own tests stay with the skill, in `skills/<skill>/scripts/`, and run under `npm test` with KAAL's own tests in `scripts/`.
