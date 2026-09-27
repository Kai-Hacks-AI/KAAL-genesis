---
name: case
---

# Case

A test case of KAAL's is its claim about its subject. What a case is, and when a changed case is still the same case, is the testing skill's; this node records how KAAL finds, relates and judges its cases.

KAAL has one reading of what its cases are: `scripts/links.ts` finds every case KAAL keeps, with the links stated directly above it, and whatever relates to a case reads it through that reading: the commitments it helps prove, the defects it tests, and the trusted regression that runs it and refuses a case that is named but does not run. KAAL addresses a case by the file it is kept in and its title. That address holds within one state of KAAL's files; it is how a case is found there, not what the case is.

KAAL never follows a case from one state to another by its address. Every relation a case has is stated beside it, so it moves and is retitled with the case, and nothing finds a case's relations by its address. Each state is judged by its own reading of its own cases: the accepted regression's cases, at their own addresses, judge a candidate. So KAAL keeps no identity for a case across states. Whether a changed case is the same case, the same claim about the same subject, is judged when the change is reviewed: a refactoring keeps every relation it states; a new claim, or the same claim about another subject, is a new case, whose relations are decided again rather than carried over.

A case of KAAL's that makes a claim about KAAL itself is given KAAL's own state as its subject, `kaal()` in `scripts/test-data.ts`: the state its case files are kept in. It never takes its subject from the directory it is run from, which belongs to the run's environment, and a subject that is not there fails the case rather than leaving it nothing to find wrong.

A case belongs to whoever keeps it, and its owner decides what it may point at. A skill's cases are about the skill and point at nothing outside it. A relation to what KAAL keeps, such as one of its defects, needs a case of KAAL's, about KAAL's own use of the skill: a different subject, and so a different case, even where the claim reads the same.
