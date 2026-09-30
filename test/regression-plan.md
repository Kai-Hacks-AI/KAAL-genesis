# KAAL Regression Plan

This is KAAL's regression plan, as the `testing` skill defines one (`skills/testing/SKILL.md`). It protects the accepted regression, the state of KAAL's files whose commitments every later change must keep: a candidate, a state proposed to succeed it, is accepted only when this plan has been shown for it. What these states are, and how KAAL judges them from their files alone, is stated in `brain/learning/genesis/26/09/26/03/nodes/testing.md`.

## Commitments

Each commitment is owned by one capability of KAAL and stated in one place, where its meaning lives. That place is also its identity: its cases point to it. This plan names each commitment by that place and does not restate it, and says what shows it: its cases, the seal checks, or both. Only cases say, in the files, which commitment they show, through their links, so every commitment here is shown by its cases and has at least one; another check, such as the seal checks, can add to them, but cannot stand in for them until it can say the same. A commitment the candidate retains keeps everything the accepted regression's plan said shows it: showing it by less weakens it, which nothing gives up.

1. Genesis's atomicity. Owned by Genesis; stated in `scripts/genesis.ts`. Shown by its cases.
2. Genesis's output. Owned by Genesis; stated in `brain/learning/genesis/26/09/28/06/nodes/genesis.md`. Shown by its cases.
3. Closed learnings. Owned by KAAL's use of `using-seals`; stated in `brain/learning/genesis/26/09/26/03/nodes/using-seals.md`. Shown by its cases and the seal checks.
4. The skills' standard and birth. Owned by KAAL's use of `using-skills`; stated in `brain/learning/genesis/26/09/25/01/nodes/using-skills.md`. Shown by its cases.
5. The skills' independence. Owned by KAAL, for every skill it keeps; stated in `brain/learning/genesis/26/09/25/01/nodes/skill.md`. Shown by its cases.
6. KAAL's testing: its anchor and its regression. Owned by KAAL's use of `testing`; stated in `brain/learning/genesis/26/09/28/06/nodes/testing.md`. Shown by its cases.
7. The skills' scripts. Owned by each skill; stated in each `skills/*/SKILL.md`, as far as it says what the skill's scripts do; the guidance a `SKILL.md` gives agents is not a commitment here. Shown by its cases.
8. BRAIN's validity. Owned by KAAL's sealing policy; stated in `scripts/brain-seals.ts`. Shown by its cases and the seal checks.
9. KAAL's defects. Owned by KAAL's use of `managing-defects`; stated in `brain/learning/genesis/26/09/27/02/nodes/managing-defects.md`. Shown by its cases.
10. KAAL's cases. Owned by KAAL's testing; stated in `brain/learning/genesis/26/09/27/03/nodes/case.md`. Shown by its cases.
11. KAAL's Ideas. Owned by KAAL's use of `managing-ideas`; stated in `brain/learning/genesis/26/09/27/04/nodes/managing-ideas.md`. Shown by its cases.
12. KAAL's test runs. Owned by KAAL's testing; stated in `brain/learning/genesis/26/09/27/05/nodes/run.md`. Shown by its cases.
13. KAAL's suites. Owned by KAAL's testing; stated in `brain/learning/genesis/26/09/27/06/nodes/suite.md`. Shown by its cases.
14. KAAL's Requirements. Owned by KAAL's use of `managing-requirements`; stated in `brain/learning/genesis/26/09/28/01/nodes/managing-requirements.md`. Shown by its cases.
15. KAAL's plans. Owned by KAAL's testing; stated in `brain/learning/genesis/26/09/27/07/nodes/plan.md`. Shown by its cases.
16. What a candidate newly promises. Owned by KAAL's testing; stated in `requirements/new-promises/requirement.md`. Shown by its cases.
17. What demonstrates a candidate's new promises. Owned by KAAL's testing; stated in `requirements/new-promises-demonstrated/requirement.md`. Shown by its cases.
18. Which inherited cases no longer hold against a candidate. Owned by KAAL's testing; stated in `requirements/inherited-reductions/requirement.md`. Shown by its cases.
19. What a candidate explicitly gives up of the accepted regression. Owned by KAAL's testing; stated in `requirements/accepted-reductions/requirement.md`. Shown by its cases.
20. The next regression, derived from the accepted one. Owned by KAAL's testing; stated in `requirements/derived-regression/requirement.md`. Shown by its cases.
21. KAAL's Change occurrences. Owned by KAAL's Change tree; stated in `requirements/change-occurrences/requirement.md`. Shown by its cases.

## How this regression differs from the one it was derived from

Derived from: the accepted regression `2126231163413570f44cc7355f0bd2008183ba6099c15925dc56980aecc9c404`.

This regression is derived from the accepted one, never restated: it is what the accepted regression protects, less exactly what the acceptance records this candidate adds give up, with each commitment this candidate newly promises and demonstrates by its own cases. `npm run regression:derive -- <accepted> [candidate]` derives it from the files, and says where the candidate's own regression does not carry it; how, is stated in `brain/learning/genesis/26/09/28/06/nodes/testing.md` and `requirements/derived-regression/requirement.md`.

The only line here a check reads is the one naming the regression this one was derived from, by its identity: it records which regression each generation succeeds, and must be the identity of the accepted regression as it is now. A regression is named by its identity, taken from its own content: its plan, the places its commitments are stated, the suites that serve its plan, every Requirement and acceptance record it holds, its case files, its test data, and what fixes how it judges: everything that decides what its install puts in place, how its TypeScript is compiled, and all of its checker's own code. The accepted regression's own checker prints it: `npm run regression:check -- --identity`, run in the accepted state. It is taken from the files byte for byte, so it is the same wherever the files are, as long as their bytes are: a checkout that rewrites line endings has another. Of a file's permissions it records only whether its owner may execute it, as a checkout does, and the replay gives the regression's cases no other permission, so none can depend on one. A regression is judged only from its own files, so one without a lockfile, or whose install takes packages from local files, whose inputs link outside its state, as the link reads wherever the state is kept, or have names or link targets that are not UTF-8, or whose cases or test data link to what its replay does not copy, or whose plan is a link or is reached through one, or whose checker is run by any other command line than `tsx scripts/check-regression.ts`, is reached through a link, imports code from outside it, or imports code it does not hold, is refused. The checker's code is found as its module loader finds it. A candidate must hold that checker, run by `regression:check` as `tsx scripts/check-regression.ts`, since once accepted it judges every later candidate. Once the candidate is accepted, the section stays as the record of how this regression came to be, and the next candidate replaces it with its own. Changes made within a candidate before it is accepted are not changes to the regression.

This candidate gives up nothing, so it adds no acceptance record, and newly promises one commitment, 21, that KAAL births each Change as an immutable occurrence beneath its lineage: `npm run feature -- <accepted>` names it, and its own cases demonstrate it.

## How a commitment's cases are found

This plan names commitments, never cases. A case says which commitments it helps prove:

- A case KAAL keeps outside its skills has a `// Why: <place>` line directly above it for each commitment it helps prove, naming the place where that commitment is stated.
- A case a skill keeps helps prove that skill's `SKILL.md`, commitment 7, and never points at KAAL, so the skill stays independent of it.

The case owns the link; a commitment never lists its cases. A case may point at several commitments, and several cases may point at one. The links hold from the repository's files alone, and `npm run links:check` checks them in any checkout, as one of KAAL's cases also does: every case KAAL keeps outside its skills points at least at one commitment, and only at places this plan states; every place this plan states exists inside the repository; every commitment this plan says its cases show has a case pointing at it, and for commitment 7, every skill has a case of its own; and no link is left belonging to no case, nor a case whose title cannot be read, since a link lost that way would go unnoticed when its case changes or moves. A candidate that would leave the next accepted regression with links that do not hold is refused before it is accepted.

A case may also say which of KAAL's suites it belongs to, with a `// Suite: <place>` line among its links. That is not a link to a commitment, and this plan names no suite: a suite groups cases around a shared testing concern, stated in its own place, as `brain/learning/genesis/26/09/27/06/nodes/suite.md` says, and a suite that serves this plan says so itself, as `brain/learning/genesis/26/09/27/07/nodes/plan.md` says. `npm run links:check` checks those lines as it checks links: each belongs to a case and names a suite stated in its own place, and no skill's case names one.

Some commitments rest on others: Genesis (1, 2) composes skills whose own creation is all or nothing (7), and KAAL's sealing (3) uses the `using-seals` skill's mechanism (7). Such a commitment's own cases prove only what KAAL adds.

## What must be shown

- Every commitment above holds, shown as its entry says: by the cases that point at it, by the seal checks, or both.
- The next regression, derived from the accepted one, holds for the candidate: every case of the accepted regression holds against it, unless an acceptance record the candidate adds excludes it; every commitment it newly promises is demonstrated by its own cases; and its own regression carries the derived one exactly.

## Conditions

- Every commitment is shown on Linux and on Windows, with Node 22, in a checkout made with `core.autocrlf=true`.
- The seal checks run on Linux.

## As runs read it

A run of this plan reads what it requires from its own files: the commitments above; the suites that say they serve it, which this plan does not list, such as `suites/without-git.md`, since its checks must need neither Git nor GitHub; and, from here, the conditions above as runs record them, and the seal checks, which must hold on Linux. How KAAL reads and runs a plan is stated in `brain/learning/genesis/26/09/27/07/nodes/plan.md`.

```yaml
conditions:
  - { platform: linux, runtime: node v22, checkout: core.autocrlf=true }
  - { platform: win32, runtime: node v22, checkout: core.autocrlf=true }
proof:
  the seal checks:
    - { platform: linux }
```

## Which checks judge a change

- The candidate's own cases, for every commitment: they alone prove what the candidate newly promises, and each must pass, since once accepted they judge the next candidate.
- From the accepted regression, which the candidate cannot alter: its cases, run against the candidate's code, each unless an acceptance record the candidate adds excludes it; the next regression it derives for the candidate, which the candidate's own regression must carry; and the seal checks, for commitments 3 and 8, including that the candidate writes no seal state.

## Known gaps

- A commitment stated outside BRAIN (1, 7 and 8) changes in place, so what it promises can change only as its cases are given up, one by one, in an acceptance record, and it is retained while any is kept. Retaining one is judged by the accepted regression's cases alone, not by its text: the file that states it also holds code, or is generated, so it changes with every change to that code. A change to its text that those cases still hold, such as a new promise added beside the old ones, is accepted, and the new promise has no place of its own that Feature could see.
- An accepted case that looks at the state as a whole, such as the check of the regression's own links, is replayed in a copy holding the candidate's code with the accepted regression's plan, cases, test data and selection of cases, and without what the candidate adds where a place of the plan reaches by a wildcard. The replay hands the accepted cases the candidate itself as the state they test, so a case about KAAL itself judges the candidate, not the copy, as `brain/learning/genesis/26/09/27/05/nodes/run.md` states; only a case that reads the state around it some other way reads the copy.
- The candidate's code runs in the same process as the accepted regression's cases, so code written to subvert them could; review guards against that, not a check.
- The accepted regression's cases are the `*.test.ts` files its `npm test` names, run with its test data: everything under a `test-data/` directory, every `test-data.ts`, and every file but code beside the cases, and with its own plan and its own selection of cases, and with none of the candidate's own cases nor anything the candidate adds where a place of its plan reaches by a wildcard, so a case that reads the plan, the cases or those places reads the state its links were written against, even when the candidate gives up or adds what they point at. What the candidate adds is proven by its own cases. Data a case takes from any other module, such as a `.ts` file that is not a `test-data.ts`, is the candidate's own. The regression's identity covers the same files, so a change to such a module does not change it.
- The accepted regression's cases are run on Linux only, with Node 22, and so is the Feature Plan's run of the candidate's own cases that demonstrates what it newly promises: a new promise enters the next regression once every case of it passed in that one run, although the Feature Plan requires it shown on Windows too, which `test-windows` runs but nothing judges together with it. A case that skips itself there, or under `npm test`'s own environment, is not run, so it demonstrates nothing.
- A link redirected from one commitment to another that this plan states is seen only when it leaves the first without a case: which commitment a case's claim is about is judged by review, not read from the files. The accepted regression's own links keep choosing which of its cases judge a candidate, so a redirect in the candidate cannot weaken that.
- Runs of a plan are judged together only when they name the same states, which KAAL names by where they are kept: runs of one state on Linux and on Windows are kept in different places, so nothing yet judges this plan across both, until states are named by what they hold.
- A suite serves this plan only as the accepted regression's suites did: one that stops serving it must be given up in an acceptance record, and one that starts has no way yet into the regression, since only a new promise brings anything in. A run of this plan does not reach the seal checks, which only `seal-linux` shows, and the accepted regression's checker, not a run of the plan, judges a candidate.
- A case the candidate adds enters the next regression only as a case of a commitment it newly promises and demonstrates, with only those links and no membership, unless it is back at the address of a case an acceptance record gives up, where it keeps the links and memberships that case had and the regression still holds, and adds nothing to them. A further case for a commitment, suite or condition already protected is refused, since nothing yet gives it a way in.
- An inherited case is kept by its address, the file and title it has, with its links and memberships, not by what it asserts: a candidate that weakens what a case asserts at the same address, or the test data it reads, carries that weakened case into the next regression, although the accepted case itself still judges this candidate. Moving or retitling a case changes its address, so it is an exclusion in an acceptance record and a case the candidate adds.
- Deriving the next regression is not accepting it: the derivation states the protection a candidate would carry, and the accepted regression that judges the candidate never changes. What of that protection must be fixed before it may judge the next candidate, such as what an inherited case asserts and the data it reads, how testing protection may evolve without silently losing any, and promoting it to `main`, are left to the work after this candidate, and are required before a `kaal/<name>` branch ships. Genesis is KAAL's first regression, and `kaal/testing` shipped is its next.
- Giving up a commitment stated in BRAIN, as when a later node supersedes it, means excluding every inherited case of it in an acceptance record, one entry each: this candidate's record gives up the cases of the two nodes it replaces that way.
- Conditions, proof other than cases and data can be neither given up nor added: the next regression keeps the accepted plan's as they were, byte for byte as read.
- Judging a candidate runs its own cases twice, for the case inventory and for the Feature Plan's run of what it newly promises, and the accepted regression's cases twice, once against the accepted state itself for its inventory and once against the candidate: nothing yet lets one run's observation of a case serve every reason it was run for.
- Replay is not hermetic: code the candidate or its cases reach outside the state, such as by an absolute import, runs in the replay, and a replay result is matched to a case only by its file and title, so accepted test code that registers another test under the same address depending on the state it tests could stand in for the case. Both are Testing's replay's to close.
- Genesis's accepted state is placed as KAAL's first regression, but a KAAL that Genesis births carries no Regression Plan, and a first regression has none before it to be derived from: what establishes it, the first plan's conditions, proof, data and suites included, is not decided here.
- The runs that showed a candidate held are not kept with the regression they made: only the regression it became, and the one it was derived from by identity, are.
- A link says which commitment a case helps prove, not how much of it: a commitment with one case pointing at it passes the links check however little of it that case proves.
- Two messages of the seal checks still speak of sealing on `main` and of what sealing commits: the accepted regression's cases pin their words and point at no commitment, so no succession can excuse a change to them. This candidate's cases link them to `brain/learning/genesis/26/09/26/03/nodes/using-seals.md`, so once it is accepted, a later candidate can reword them by superseding that node.
- Validity is not all that sealing requires: a learning holding a symlink or a special file is valid, and no check sees it before sealing the accepted state refuses it.
- Commitment 7 is known to be proven only in part: the skills' command-line entry points, such as `create-node.ts`'s `--edge` parsing, have no cases. Their cases call the scripts' exported functions, not the command lines their `SKILL.md` promises.
- Some proofs are weaker than their claims. Commitment 5's case sees only `from "…"` imports, so a side-effect or dynamic import of another skill passes it. Some cases still hold data inline.
- `package.json` allows Node 22 and later, but only Node 22 is run, so no commitment is proven on a later Node.
- On Windows, two cases are not run (a named pipe, and symlinks kept verbatim), so their claims are proven on Linux only.

## Carried out by

KAAL's own checks take states as directories and read only their files: `npm run regression:check -- <candidate>`, run in the accepted state so its own checker judges, `npm run regression:derive -- <accepted> [candidate]`, which derives the next regression and says where the candidate does not carry it, `npm run links:check -- [state]`, `npm run seals:check`, `npm run seals:guard -- <accepted> [candidate]` and `npm test`. None of them needs Git, a branch, a commit or GitHub, and one of KAAL's cases runs them on a copy of KAAL with no Git at all.

On GitHub, workflows adapt those checks to the repository host: they check out the states, hand KAAL their paths, and report KAAL's answers as commit statuses that rulesets can require. There, the accepted regression is `main`'s latest commit, a candidate is a pull request's merge with its target, and accepting a candidate is merging it.

- `.github/workflows/test.yml`: `test-linux` and `test-windows`, one run each. `npm test` runs every case in the repository, which is how the commitments' cases are reached today, and one of them checks KAAL's own links.
- `.github/workflows/seal.yml`: `seal-linux`, the seal checks, with a pull request's target as the accepted state it is guarded against.
- `.github/workflows/sealing.yml`: seals `main` after each push, and refuses to commit anything but what sealing writes, comparing a copy of the state before sealing with the state after.
- `.github/workflows/regression.yml`: `regression-linux`, from `main`.

The same gate also runs typecheck, format check and `dependency-review-linux`, which are not part of this plan.

What the adapter adds, and cannot show from the files:

- Several open pull requests sharing one head commit share one `regression-linux` status, so none of them is given a success until each has a head of its own. Closing one of them does not judge the others again: they stay failed until they are run again. A pull request opened on a head that already has a success shows that success until its own run marks it pending, which a queued run may not do at once: a commit status belongs to a commit, not to a pull request, so no workflow can close that window. A merge queue, which judges each merge on its own, would; it is set in the repository's ruleset.
- When `main` moves, every open pull request whose `regression-linux` does not already name the new `main` is set to failure. A run that finishes against the new `main` between that check and the write is overwritten, and stays failed until it is run again.
- A regression's identity names what a candidate derives from; it follows the checker's code only through the imports its module loader resolves and literal relative URLs, so code the checker loads some other way, such as through a package import alias or a computed specifier, is not part of it. The judgement does not rest on the identity: the checker that judges is always the accepted state's own.
- The links check knows the seal checks only by name: that they run, and hold, is shown by `seal-linux`, not by the links.
- Nothing checks that the workflows carry out what this plan names. Which checks `main` requires is set in the repository's ruleset, outside the repository. It should require what this plan names; the repository cannot show that it does. For `regression-linux` that means every branch a pull request can target requires it, with branches kept up to date before merging, since a moved base changes what is merged without re-running it. A commit status is also written by whatever workflow a branch runs on a push, so a required status can be forged from a branch's own workflow; that holds for `seal-linux` as much as for `regression-linux`.
- A run reports cases, not commitments, and each workflow runs on both a push and a pull request, so a change is often run twice.
