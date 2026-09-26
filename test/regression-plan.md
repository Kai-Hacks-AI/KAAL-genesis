# KAAL Regression Plan

This is KAAL's regression plan, as the `testing` skill defines one (`skills/testing/SKILL.md`). It protects `main`: `main` accepts a change only when this plan has been shown for it.

## Commitments

Each commitment is owned by one capability of KAAL and stated in one place, where its meaning lives. That place is also its identity: its cases point to it. This plan names each commitment by that place and does not restate it.

1. Genesis's atomicity. Owned by Genesis; stated in `scripts/genesis.ts`.
2. Genesis's output. Owned by Genesis; stated in `scripts/genesis.test.ts`.
3. Closed learnings. Owned by KAAL's use of `using-seals`; stated in `brain/learning/genesis/26/09/25/01/nodes/using-seals.md`.
4. The skills' standard and birth. Owned by KAAL's use of `using-skills`; stated in `brain/learning/genesis/26/09/25/01/nodes/using-skills.md`.
5. The skills' independence. Owned by KAAL, for every skill it keeps; stated in `brain/learning/genesis/26/09/25/01/nodes/skill.md`.
6. KAAL's testing: its anchor and its regression. Owned by KAAL's use of `testing`; stated in `brain/learning/genesis/26/09/26/02/nodes/testing.md`.
7. The skills' scripts. Owned by each skill; stated in each `skills/*/SKILL.md`, as far as it says what the skill's scripts do; the guidance a `SKILL.md` gives agents is not a commitment here.
8. BRAIN's validity. Owned by KAAL's sealing policy; stated in `scripts/brain-seals.ts`.

## How this regression differs from the one it was derived from

Derived from: `main` at `f3596634e2ab78d6d2e70c561079a6bc82676dc7`. That commit is not an ancestor of this candidate: its one change, the TypeScript bump (#25), reached this candidate as #33.

This section names the regression a plan was derived from and what the plan does not retain of it, each with what supersedes it; every commitment of that regression it does not name is retained. On a candidate, the base must be `main` as it is now; once the candidate is merged, the section stays as the record of how this regression came to be, and the next candidate replaces it with its own. Changes made within a candidate before it is merged are not changes to the regression. How a commitment is replaced or withdrawn is stated in `brain/learning/genesis/26/09/26/02/nodes/testing.md`.

- Replaces: nothing.
- Withdraws: nothing.
- Adds: commitment 6, which `main` does not have. `main` has no regression plan: its cases already prove commitments 1 to 5, 7 and 8, which are named here for the first time, and every one of `main`'s cases passes on this candidate.

## How a commitment's cases are found

This plan names commitments, never cases. A case says which commitments it helps prove:

- A case KAAL keeps outside its skills has a `// Why: <place>` line directly above it for each commitment it helps prove, naming the place where that commitment is stated.
- A case a skill keeps helps prove that skill's `SKILL.md`, commitment 7, and never points at KAAL, so the skill stays independent of it.

Some commitments rest on others: Genesis (1, 2) composes skills whose own creation is all or nothing (7), and KAAL's sealing (3) uses the `using-seals` skill's mechanism (7). Such a commitment's own cases prove only what KAAL adds.

## What must be shown

- Every commitment above holds, shown by the cases that prove it; commitments 3 and 8 also by the seal checks.
- Every commitment of `main` holds against the change, shown by `main`'s cases, unless BRAIN shows it replaced or withdrawn.

## Conditions

- Every commitment is shown on Linux and on Windows, with Node 22, in a checkout made with `core.autocrlf=true`.
- The seal checks run on Linux.

## Which checks judge a change

- The change's own cases, for every commitment: they alone prove what the change adds and what replaces a commitment of `main`.
- From `main`, which the change cannot alter: `main`'s cases, chosen by `main`'s `Why:` lines and run against the change's code, for every commitment of `main` the change retains; and the seal checks, for commitments 3 and 8.

## Known gaps

- `regression-linux` judges a change only once its workflow is on `main`. Until this candidate is merged, `main` has neither the workflow nor a plan; the candidate is judged by its own cases, and by `main`'s cases only when run by hand.
- A commitment stated outside BRAIN (1, 2, 7 and 8) has no succession, so it can only be retained: changing what one promises needs its meaning born in BRAIN first. For commitment 7, that means a skill cannot yet change what its scripts do in a way `main`'s cases would notice.
- The change's code runs in the same process as `main`'s cases, so code written to subvert them could; review guards against that, not a check.
- Several open pull requests sharing one head commit share one `regression-linux` status, so none of them is given a success until each has a head of its own. Closing one of them does not judge the others again: they stay failed until they are run again. A pull request opened on a head that already has a success shows that success until its own run marks it pending, which a queued run may not do at once: a commit status belongs to a commit, not to a pull request, so no workflow can close that window. A merge queue, which judges each merge on its own, would; it is set in the repository's ruleset.
- When `main` moves, every open pull request whose `regression-linux` does not already name the new `main` is set to failure. A run that finishes against the new `main` between that check and the write is overwritten, and stays failed until it is run again.
- `main`'s cases are the `*.test.ts` files its `npm test` names, run with `main`'s test data: everything under a `test-data/` directory, every `test-data.ts`, and every file but code beside the cases. Data a case takes from any other module, such as a `.ts` file that is not a `test-data.ts`, is the change's own.
- `main`'s cases are run on Linux only, with Node 22, and so are the change's cases that prove a replacement: a case that skips itself on Windows, or under `npm test`'s own environment, proves the replacement there without anything noticing, since `test-linux` and `test-windows` count a skip as a pass. What a replacement is proven under is `main`'s replay: Linux, Node 22, and no npm environment.
- A case whose title is not a plain double-quoted string at the top of its file, such as one built in a loop, cannot be expected by its title. A change that would bring one into `main` is refused, but `main` today still has two such cases until this candidate is merged: if they fail they are held, but if they never run, nothing notices.
- Nothing checks that each `Why:` line names a commitment the plan states, or that every commitment has a case. A case of `main` that points at nothing is always held.
- Validity is not all that sealing requires: a learning holding a symlink or a special file is valid, and no check sees it before sealing on `main` refuses it.
- Commitment 7 is known to be proven only in part: the skills' command-line entry points, such as `create-node.ts`'s `--edge` parsing, have no cases. Their cases call the scripts' exported functions, not the command lines their `SKILL.md` promises.
- Some proofs are weaker than their claims. Commitment 5's case sees only `from "…"` imports, so a side-effect or dynamic import of another skill passes it. Some cases still hold data inline.
- `package.json` allows Node 22 and later, but only Node 22 is run, so no commitment is proven on a later Node.
- On Windows, two cases are not run (a named pipe, and symlinks kept verbatim), so their claims are proven on Linux only.
- Nothing checks that the workflows carry out what this plan names. Which checks `main` requires is set in the repository's ruleset, outside the repository. It should require what this plan names; the repository cannot show that it does. For `regression-linux` that means every branch a pull request can target requires it, with branches kept up to date before merging, since a moved base changes what is merged without re-running it. A commit status is also written by whatever workflow a branch runs on a push, so a required status can be forged from a branch's own workflow; that holds for `seal-linux` as much as for `regression-linux`.
- A run reports cases, not commitments, and each workflow runs on both a push and a pull request, so a change is often run twice.

## Carried out by

- `.github/workflows/test.yml`: `test-linux` and `test-windows`, one run each. `npm test` runs every case in the repository, which is how the commitments' cases are reached today.
- `.github/workflows/seal.yml`: `seal-linux`.
- `.github/workflows/regression.yml`: `regression-linux`, from `main`.

The same gate also runs typecheck, format check and `dependency-review-linux`, which are not part of this plan.
