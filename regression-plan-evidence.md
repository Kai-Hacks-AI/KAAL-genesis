# Regression Plan composition evidence

## 1) Cases that prove more than one commitment/Suite

- `scripts/brain-seals.test.ts:99-102` allows `diffData("new-learning")` and `diffData("outside-brain")` for `sealStateChanges(...)`.
- `scripts/brain-seals.test.ts:155-168` rejects those same diffs for `sealingOutputErrors(...)`.

Observation: the same concrete case data proves two distinct policies.

Interpretation: case-to-commitment mapping is already many-to-many.

## 2) Commitments/Suites that require several Cases

- `scripts/brain-seals.ts:153-156` defines `brainErrors` as `validate(...)` + `checkBrain(...)`.
- `.github/workflows/test.yml:39-41` requires `npm test`, `npm run typecheck`, and `npm run format:check`.

Observation: a single pass/fail commitment depends on multiple check families.

Interpretation: suite-level proof is aggregate, not one-case.

## 3) Cases reached by several Suites in the same Plan

- `scripts/brain-seals.test.ts:95-97` checks committed BRAIN validity + seal integrity in unit tests.
- `.github/workflows/seal.yml:63-68` runs `npm run seals:check` in workflow paths.
- `scripts/check-seals.ts:5-13` implements that check path.

Observation: seal-integrity conditions are reached through both tests and workflow checks.

Interpretation: plan execution can overlap case coverage unless deduplicated by run semantics.

## 4) Regression-Plan conditions that belong to Plan/Run

- `.github/workflows/test.yml:24-32` uses Linux/Windows matrix and sets `core.autocrlf true`.
- `.github/workflows/seal.yml:63-71` changes executed checks by trigger context (`push` vs `pull_request_target`).

Observation: environment/trigger choices change what is executed independent of case code.

Interpretation: those are run-level constraints, not intrinsic case definitions.

## 5) Regression proof mechanisms that are not Test Cases (especially seal checks)

- `scripts/seal-guard.ts:6-23` rejects PR diffs that touch seal state.
- `scripts/sealing-check.ts:5-20` rejects staged outputs sealing could not produce.
- `.github/workflows/seal.yml:41-43,72-73` publishes explicit `seal-linux` status.

Observation: enforcement includes operational guards and status gates, not only `node:test` cases.

Interpretation: runnable proof includes non-test mechanisms.

## 6) Where workflows/scripts currently approximate running a Regression Plan

- `.github/workflows/test.yml:1-3,39-41` full tests + typecheck + format check.
- `.github/workflows/seal.yml:3-4,63-71` seal integrity and seal-state guard.
- `.github/workflows/sealing.yml:3-6,49,69` auto-sealing path + sealing-output gate.
- `.github/workflows/dependency-review.yml:1-2,17` dependency vulnerability gate.

Observation: regression behavior is split across workflows and scripts.

Interpretation: “Regression Plan” currently exists as composed workflow behavior.

## 7) One Suite alone vs whole Regression Plan

- `test` suite path (`.github/workflows/test.yml:39-41`) does not run `seals:guard`.
- `seal`/`sealing` paths (`.github/workflows/seal.yml:63-71`, `.github/workflows/sealing.yml:49,69`) do not run broad test/typecheck/format suite.

Observation: different suites reach materially different checks.

Interpretation: runnable suite != regression-complete execution.

## 8) Evidence that “Suite = commitment its Cases prove together” becomes insufficient once runnable

- `.github/workflows/seal.yml:6-11,44-55,63-71` suite behavior depends on trusted checkout and event context.
- `.github/workflows/sealing.yml:69-76` suite pass criteria include staged-diff policy checks before commit/push.

Observation: suite execution semantics include orchestration, trust model, and runtime policy gates.

Interpretation: runnable suite definition needs more than just commitment + cases.

## Questions the evidence forces us to answer

1. Where should shared-case deduplication be defined: Case, Suite, or Plan/Run level?
2. Should trigger-dependent behavior belong inside Suite definitions or only Plan/Run orchestration?
3. Are guards like `seals:guard` and `seals:sealing-check` first-class proof units beside Test Cases?
4. Must Regression Plan explicitly encode OS/line-ending/trusted-checkout dimensions now in workflows?
5. What is the canonical source of “regression complete” across `test`, `seal`, `sealing`, and dependency-review?
