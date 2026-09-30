---
name: testing
---

# Testing

KAAL uses the **testing** skill so the protection a Change leaves behind is stated in a Plan and executed rather than remembered: a Plan names Suites of Cases, and a Run says whether the Plan holds for a candidate.

KAAL composes it with **managing-change**, and neither skill knows the other. A Change owns its protection transition, sparsely, beneath its occurrence's `test/`: its Suites, such as `test/testing/`; its Feature Plan, `test/feature.json`, naming the Suites it introduces; its Acceptance Plan, `test/acceptance.json`, naming accepted Suites it gives up, only when it gives any up; and its Regression Test Plan, `test/regression.json`, naming every Suite that must hold after it lands, its own or an earlier Change's, by path from the repository root. Feature adds, Acceptance removes, Regression projects. The Plan alone decides which Suites belong: where a Suite is stored implies nothing. Since the Plans are the Change's own material, they are sealed with it, and a sealed Suite a Plan names never changes beneath it.

KAAL names the Regression Test Plan it runs explicitly, where it invokes Testing, such as in CI. Testing never discovers a current Plan, and Change order is never used to infer one. Only the Regression Test Plan is executed; Feature and Acceptance Plans have their place and meaning but nothing interprets them yet. Whether a Change's Regression Test Plan follows from the previous one, with its Feature and Acceptance Plans, is for review to judge: nothing checks it, and Testing never decides that a Suite left out was given up.

A historical Case reaches what it tests through its working directory and the candidate's public entry points, never its own location, so it can judge candidates written after it.
