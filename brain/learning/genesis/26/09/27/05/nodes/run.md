---
name: run
---

# Run

A test run is one occurrence of executing something testing can run, a case, a suite or a plan, against what it tests, under the conditions it was executed in, with what the execution reached and observed. What a test run is, is the testing skill's; this node records how KAAL carries runs out.

What KAAL runs today is cases: `scripts/run.ts` runs the cases a testing state selects, and the trusted regression runs the accepted regression's cases against a candidate. KAAL does not yet run a suite or a plan as such. Its runs of cases are how the cases a suite or a plan reaches are executed, and what they observe of each case is what a run of a suite or a plan observes of the cases it reaches.

The testing state supplies what is run, and the cases and test data it reaches; the tested state is what they test. They are often one state, as when a checkout's own cases run against it, and deliberately two in the trusted regression, where the accepted regression's cases judge a candidate. A run hands its cases the tested state: `scripts/run.ts` names it to them, and a case of KAAL's about KAAL itself takes it through `kaal()`, so it judges the state it is handed, never the copy or the directory it happens to be run in. A tested state named for the cases of another testing state is refused. In the trusted regression the tested state is the candidate itself, while the accepted cases run in a copy that holds them beside the candidate's code, which they reach through their imports.

A run observes each case it was to reach as passed, failed or not run, and says which case each observation is of by the case's address in the testing state it records, as KAAL reads its cases there, so it needs no identity for a case across states. A case skipped, or not reported, was not run and proves nothing. What the run's executor reports that none of those cases accounts for, such as a file that did not run as a whole, is kept apart: it observes none of them, and like a failed case it fails the run. Where the executor does not say whether a case's claim was exercised to a verdict, such as a case cancelled before it starts, or one whose hook failed, the case is observed as not run and what was reported is kept apart, so the run fails rather than passes.

A run records the conditions that can change what it observes: the platform and runtime it measures, and those whoever starts it gives, such as how the files were checked out. A case that passed proves its claim about the tested state, using the testing state, under those conditions, and nothing more; the same testing run on Linux and on Windows is two runs. Where the same testing, testing state, tested state and recorded conditions give different observations, a condition that matters is not yet recorded, or a case is not repeatable.

A refactored case is shown at least as strong as the cases it replaces by runs against known breaking states: every tested state that fails the old cases must fail it too.

KAAL keeps no record of its runs: a run is returned to whoever started it, who may keep or report it. What executes runs, such as a workflow that runs `npm test`, or the test runner that executes a case, is not what a run is.
