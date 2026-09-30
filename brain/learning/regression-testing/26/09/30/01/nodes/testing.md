---
name: testing
---

# Testing

KAAL uses the **testing** skill so the protection an evolution leaves behind is stated, collected and executed rather than remembered: a Plan collects Suites of Cases, and a Run says whether the Plan holds for a candidate.

KAAL composes it with **managing-change**, and neither skill knows the other. An individual Change owns its Test Suite: the `test/` beneath its occurrence, `change/<lineage>/YY/MM/DD/CC/test/`, holding `suite.json` and its Cases. The evolution `kaal/<lineage>` owns its Regression Test Plan, `test/regression/<lineage>.json`, which collects the Test Suite of every Change of that evolution, and nothing else. Global `test/` holds only these Plans: a Change's Cases stay with that Change, and a skill's own tests stay with the skill. KAAL's regression is every Plan there, run against the repository as candidate, and it refuses to run while a Plan does not collect exactly the Suites its Changes own.

Collection only adds. A Suite, once its Change is accepted, is sealed with that Change and projected into every later regression as it is: no Plan can drop it without the regression refusing, and nothing can yet remove, replace or relate one Case to another. A historical Case reaches what it tests through its working directory and the candidate's public entry points, never its own location, so it can judge candidates written after it. The Plan itself is not sealed, and the regression is run by the candidate's own code; both share every limit of KAAL's existing testing.
