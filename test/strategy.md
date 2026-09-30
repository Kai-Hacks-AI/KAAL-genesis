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

## Conditions

A skipped test proves nothing, so a Plan that meets one does not hold, and the skip is investigated: a defect in what is tested, a defect in the Case, a genuine condition, or an infrastructure blocker. Skips are judged against the Requirements that say where KAAL is supported, `linux-support` and `windows-support`: a capability either Requirement covers stays required there even when one of its tests cannot run. Only a genuine condition is declared, as a Condition in the Suite that collects the Case, with the platforms the test does not apply on and a `because` saying why that claim, not the capability, does not apply there. The Condition is the Suite's, sealed with its Change, never the owner's skip: a skip no Suite declares is never accepted, and a test that could run portably is repaired at its owner rather than declared.

## Where and when

CI runs the Regression Test Plan with `npm run testing:run -- <plan>` on Linux and Windows, checked out with `core.autocrlf=true`, on every push and pull request.

A skill's own tests stay with the skill, in `skills/<skill>/scripts/`, and run under `npm test` with KAAL's own tests in `scripts/`.
