# KAAL Regression Plan

This is KAAL's regression plan, as the `testing` skill defines one (`skills/testing/SKILL.md`). It protects the accepted regression, the state of KAAL's files whose commitments every later change must keep: a candidate, a state proposed to succeed it, is accepted only when this plan has been shown for it. What these states are, and how KAAL judges them from their files alone, is stated in `brain/learning/genesis/26/09/26/03/nodes/testing.md`.

## Commitments

Each commitment is owned by one capability of KAAL and stated in one place, where its meaning lives. That place is also its identity: its cases point to it. This plan names each commitment by that place and does not restate it, and says what shows it: its cases, the seal checks, or both. A commitment this plan says its cases show must have at least one; one shown only by another check needs none, and the plan says which check that is. A commitment the candidate retains keeps everything the accepted regression's plan said shows it: showing it by less weakens it, which only superseding it in BRAIN may do.

1. Genesis's atomicity. Owned by Genesis; stated in `scripts/genesis.ts`. Shown by its cases.
2. Genesis's output. Owned by Genesis; stated in `brain/learning/genesis/26/09/26/03/nodes/genesis.md`. Shown by its cases.
3. Closed learnings. Owned by KAAL's use of `using-seals`; stated in `brain/learning/genesis/26/09/26/03/nodes/using-seals.md`. Shown by its cases and the seal checks.
4. The skills' standard and birth. Owned by KAAL's use of `using-skills`; stated in `brain/learning/genesis/26/09/25/01/nodes/using-skills.md`. Shown by its cases.
5. The skills' independence. Owned by KAAL, for every skill it keeps; stated in `brain/learning/genesis/26/09/25/01/nodes/skill.md`. Shown by its cases.
6. KAAL's testing: its anchor and its regression. Owned by KAAL's use of `testing`; stated in `brain/learning/genesis/26/09/26/03/nodes/testing.md`. Shown by its cases.
7. The skills' scripts. Owned by each skill; stated in each `skills/*/SKILL.md`, as far as it says what the skill's scripts do; the guidance a `SKILL.md` gives agents is not a commitment here. Shown by its cases.
8. BRAIN's validity. Owned by KAAL's sealing policy; stated in `scripts/brain-seals.ts`. Shown by its cases and the seal checks.

## How this regression differs from the one it was derived from

Derived from: the accepted regression `3ca628aac5d6bd7a42ca596a7a8b18ff2d52ef125772d4c952c9e636a5dd121a`.

This section names the regression a plan was derived from and what the plan does not retain of it, each with what supersedes it; every commitment of that regression it does not name is retained. A regression is named by its identity, taken from its own content: its plan, the places its commitments are stated, its case files and its test data (`npm run regression:check -- --identity <accepted>` prints it). On a candidate, it must be the identity of the accepted regression as it is now; once the candidate is accepted, the section stays as the record of how this regression came to be, and the next candidate replaces it with its own. Changes made within a candidate before it is accepted are not changes to the regression. How a commitment is replaced or withdrawn is stated in `brain/learning/genesis/26/09/26/03/nodes/testing.md`.

- Replaces: nothing.
- Withdraws: nothing.
- Adds: commitment 6, which the accepted regression does not have. The accepted regression has no plan: its cases already prove commitments 1 to 5, 7 and 8, which are named here for the first time, and every one of its cases passes on this candidate.

## How a commitment's cases are found

This plan names commitments, never cases. A case says which commitments it helps prove:

- A case KAAL keeps outside its skills has a `// Why: <place>` line directly above it for each commitment it helps prove, naming the place where that commitment is stated.
- A case a skill keeps helps prove that skill's `SKILL.md`, commitment 7, and never points at KAAL, so the skill stays independent of it.

The case owns the link; a commitment never lists its cases. A case may point at several commitments, and several cases may point at one. The links hold from the repository's files alone, and `npm run links:check` checks them in any checkout, as one of KAAL's cases also does: every case KAAL keeps outside its skills points at least at one commitment, and only at places this plan states; every place this plan states exists inside the repository; every commitment this plan says its cases show has a case pointing at it, and for commitment 7, every skill has a case of its own; and no link is left belonging to no case, nor a case whose title cannot be read, since a link lost that way would go unnoticed when its case changes or moves. A candidate that would leave the next accepted regression with links that do not hold is refused before it is accepted.

Some commitments rest on others: Genesis (1, 2) composes skills whose own creation is all or nothing (7), and KAAL's sealing (3) uses the `using-seals` skill's mechanism (7). Such a commitment's own cases prove only what KAAL adds.

## What must be shown

- Every commitment above holds, shown as its entry says: by the cases that point at it, by the seal checks, or both.
- Every commitment of the accepted regression holds against the candidate, shown by the accepted regression's cases, unless BRAIN shows it replaced or withdrawn.

## Conditions

- Every commitment is shown on Linux and on Windows, with Node 22, in a checkout made with `core.autocrlf=true`.
- The seal checks run on Linux.

## Which checks judge a change

- The candidate's own cases, for every commitment: they alone prove what the candidate adds and what replaces a commitment of the accepted regression.
- From the accepted regression, which the candidate cannot alter: its cases, chosen by its `Why:` lines and run against the candidate's code, for every commitment it has that the candidate retains; and the seal checks, for commitments 3 and 8, including that the candidate writes no seal state.

## Known gaps

- The accepted regression has no plan and no links yet: until this candidate is accepted, each of its cases points at nothing, so each is always held.
- A commitment stated outside BRAIN (1, 7 and 8) has no succession, so it can only be retained: changing what one promises needs its meaning born in BRAIN first. For commitment 7, that means a skill cannot yet change what its scripts do in a way the accepted regression's cases would notice. Retaining one is judged by the accepted regression's cases alone, not by its text: the file that states it also holds code, or is generated, so it changes with every change to that code. A change to its text that those cases still hold, such as a new promise added beside the old ones, is accepted; the new promise is proven only by the candidate's own cases.
- The candidate's code runs in the same process as the accepted regression's cases, so code written to subvert them could; review guards against that, not a check.
- The accepted regression's cases are the `*.test.ts` files its `npm test` names, run with its test data: everything under a `test-data/` directory, every `test-data.ts`, and every file but code beside the cases. Data a case takes from any other module, such as a `.ts` file that is not a `test-data.ts`, is the candidate's own. The regression's identity covers the same files, so a change to such a module does not change it.
- The accepted regression's cases are run on Linux only, with Node 22, and so are the candidate's cases that prove a replacement: a case that skips itself on Windows, or under `npm test`'s own environment, proves the replacement there without anything noticing, since `test-linux` and `test-windows` count a skip as a pass. What a replacement is proven under is the accepted regression's replay: Linux, Node 22, and no npm environment.
- A case whose title is not a plain double-quoted string at the top of its file, such as one built in a loop, cannot be expected by its title. A candidate that would bring one into the accepted regression is refused, but the accepted regression today still has two such cases until this candidate is accepted: if they fail they are held, but if they never run, nothing notices.
- A link redirected from one commitment to another that this plan states is seen only when it leaves the first without a case: which commitment a case's claim is about is judged by review, not read from the files. The accepted regression's own links keep choosing which of its cases judge a candidate, so a redirect in the candidate cannot weaken that.
- A link says which commitment a case helps prove, not how much of it: a commitment with one case pointing at it passes the links check however little of it that case proves.
- Genesis still births the Genesis learning as it was first learned, including meaning KAAL has since superseded, such as sealing and its regression stated in Git's terms: a newly launched KAAL begins with that meaning and holds the current one only through nodes it does not have. The accepted regression's cases pin what Genesis births, byte for byte, and point at no commitment, so this generation keeps it. Genesis's output is now stated in BRAIN, commitment 2, and its cases point there, so once this candidate is accepted, a later candidate can let Genesis birth KAAL's current understanding by superseding that node.
- Two messages of the seal checks still speak of sealing on `main` and of what sealing commits: the accepted regression's cases pin their words and point at no commitment, so no succession can excuse a change to them. This candidate's cases link them to `brain/learning/genesis/26/09/26/03/nodes/using-seals.md`, so once it is accepted, a later candidate can reword them by superseding that node.
- Validity is not all that sealing requires: a learning holding a symlink or a special file is valid, and no check sees it before sealing the accepted state refuses it.
- Commitment 7 is known to be proven only in part: the skills' command-line entry points, such as `create-node.ts`'s `--edge` parsing, have no cases. Their cases call the scripts' exported functions, not the command lines their `SKILL.md` promises.
- Some proofs are weaker than their claims. Commitment 5's case sees only `from "…"` imports, so a side-effect or dynamic import of another skill passes it. Some cases still hold data inline.
- `package.json` allows Node 22 and later, but only Node 22 is run, so no commitment is proven on a later Node.
- On Windows, two cases are not run (a named pipe, and symlinks kept verbatim), so their claims are proven on Linux only.

## Carried out by

KAAL's own checks take states as directories and read only their files: `npm run regression:check -- <candidate> [accepted]`, `npm run links:check -- [state]`, `npm run seals:check`, `npm run seals:guard -- <accepted> [candidate]` and `npm test`. None of them needs Git, a branch, a commit or GitHub, and one of KAAL's cases runs them on a copy of KAAL with no Git at all.

On GitHub, workflows adapt those checks to the repository host: they check out the states, hand KAAL their paths, and report KAAL's answers as commit statuses that rulesets can require. There, the accepted regression is `main`'s latest commit, a candidate is a pull request's merge with its target, and accepting a candidate is merging it.

- `.github/workflows/test.yml`: `test-linux` and `test-windows`, one run each. `npm test` runs every case in the repository, which is how the commitments' cases are reached today, and one of them checks KAAL's own links.
- `.github/workflows/seal.yml`: `seal-linux`, the seal checks, with a pull request's target as the accepted state it is guarded against.
- `.github/workflows/sealing.yml`: seals `main` after each push, and refuses to commit anything but what sealing writes, comparing a copy of the state before sealing with the state after.
- `.github/workflows/regression.yml`: `regression-linux`, from `main`.

The same gate also runs typecheck, format check and `dependency-review-linux`, which are not part of this plan.

What the adapter adds, and cannot show from the files:

- Several open pull requests sharing one head commit share one `regression-linux` status, so none of them is given a success until each has a head of its own. Closing one of them does not judge the others again: they stay failed until they are run again. A pull request opened on a head that already has a success shows that success until its own run marks it pending, which a queued run may not do at once: a commit status belongs to a commit, not to a pull request, so no workflow can close that window. A merge queue, which judges each merge on its own, would; it is set in the repository's ruleset.
- When `main` moves, every open pull request whose `regression-linux` does not already name the new `main` is set to failure. A run that finishes against the new `main` between that check and the write is overwritten, and stays failed until it is run again.
- The links check knows the seal checks only by name: that they run, and hold, is shown by `seal-linux`, not by the links.
- Nothing checks that the workflows carry out what this plan names. Which checks `main` requires is set in the repository's ruleset, outside the repository. It should require what this plan names; the repository cannot show that it does. For `regression-linux` that means every branch a pull request can target requires it, with branches kept up to date before merging, since a moved base changes what is merged without re-running it. A commit status is also written by whatever workflow a branch runs on a push, so a required status can be forged from a branch's own workflow; that holds for `seal-linux` as much as for `regression-linux`.
- A run reports cases, not commitments, and each workflow runs on both a push and a pull request, so a change is often run twice.
