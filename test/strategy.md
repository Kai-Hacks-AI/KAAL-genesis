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

A Carrier is a `*.test.*` file. A traceable Test Case is one canonical declaration in it, a top-level `test("name", { tests: { requirement: ["<id>"], defect: ["<id>"] } }, fn)` through the Carrier's `import test from "node:test"`, identified by the Carrier's path and its string-literal name and listed as the one-line JSON array `[carrier, name]`. It is read from the source without running it, and it declares what the Test Case tests; it does not say that Node ran it, which a Run shows, carrier by carrier. Every other use of `node:test` is ordinary Node syntax that KAAL neither reads nor refuses. The declaration belongs to the Test Case: the Requirement or Defect it names is never changed, and later Test Cases may declare earlier sealed meaning. `npm run test-cases:check` refuses a declaration whose id names no Requirement or Defect in any Change, and `npm run test-cases:check -- requirement <id>` (or `defect <id>`) lists the Test Cases that declare one, computed from them. A Test Case tests only what it names: a Requirement that supersedes another is not tested by the Test Cases of the one it supersedes. A Test Case may supersede an earlier one with `supersedes: [carrier, name]` in the same declaration: its HOW is new, and the earlier Test Case is never edited, deleted or made unrunnable, so earlier material can still use it. KAAL accepts the relation across Changes, so `npm run test-cases:check` also refuses what Testing refuses of a supersession, with every Test Case of every Change as the material considered, and `npm run test-cases:check -- current requirement <id>` lists the Test Cases that are active for a Requirement: those that test it and that no later Test Case of their own lineage tests too. Activity is per `tests` edge, so a Test Case superseded for one Requirement stays active for another it alone tests. `npm run test-cases:check -- carriers requirement <id>...` (or `defect`) lists, from the same material, the Carriers that hold the Test Cases active for any of the ids: derived runnable scope, computed and never stored, so a Carrier whose Test Cases are all superseded for those ids is left out and one that still holds an active Test Case stays. Which ids are protected is the caller's to say.

## Test Plan

Regression is protected meaning, WHAT must hold; a Test Plan is the executable plan for a Change, HOW it demonstrates that. They are two concepts and neither is the other. A Suite collects whole Carriers, so once a Test Case's HOW is superseded, a Suite can neither leave out its stale Carrier nor be dropped without losing the unchanged ones. Testing's own Plans stay as they are, authored and stored. For a Change, KAAL composes the full Test Plan from its protected ids instead: `npm run test-cases:check -- plan <requirement|defect> <id>...` prints a Plan file whose `carriers` are the Carriers holding the Test Cases active for any of the ids, each once, and the Test Cases themselves are `testPlanProtecting`'s entries, each Test Case once however many ids select it, with the ids that did. Nothing is stored: the Plan file is a rendering that can be discarded and made again from the Test Cases, and it edits no Suite, Test Case or earlier Plan. KAAL has no Test Data of its own beyond fixtures that skills keep for their own tests, so the entries carry none. `npm run testing:run -- <plan>` runs it like any Plan, each Carrier once; Plans that collect only Suites are as they were.

## Instances

A Test Case carries no environment: its HOW is the same wherever it is executed. When a Requirement must be shown under more than one set of parameters, such as the execution conditions a Run observes, the Plan says so by collecting the Carrier that holds its HOW under each, one required instance per Test Case and parameters, named today by the Carrier because that is what a Run executes, and a Run performs the instances its own conditions provide and leaves the rest unrun, never as a skip and never as a pass. Which Requirements need which instances, and why, is KAAL's to say when it composes a Plan: Testing knows no platform and no Requirement, and the same instance selected for two Requirements is one. A Plan that requires instances under different parameters is shown by the Runs made under each, as `npm run testing:evidence -- <report>...` computes, and `npm run testing:run` exits 3, never 0, for a Run that left one unrun. KAAL does not yet compose Plans with parameters, and CI does not yet combine Runs: a Plan that requires one needs that before CI can be green.

## Where and when

CI runs the Regression Test Plan with `npm run testing:run -- <plan>` on Linux and Windows, checked out with `core.autocrlf=true`, on every push and pull request.

A skill's own tests stay with the skill, in `skills/<skill>/scripts/`, and run under `npm test` with KAAL's own tests in `scripts/`.
