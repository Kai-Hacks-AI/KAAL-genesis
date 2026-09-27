---
name: testing
---

# Testing

KAAL uses the **testing** skill because Genesis showed that its testing had outgrown Bare. The skill has since grown backwards from KAAL's own tests, as the earlier `testing` node expected: it now also says how tests are grouped, run and planned. This node records how KAAL uses it.

KAAL's testing has one anchor, `test/`, whose entry point the skill creates. Besides that entry point, `test/` holds only KAAL's Regression Plan; tests and their data stay with what they test.

`main` is KAAL's regression: the commitments it has accepted are what every later change must keep. A `kaal/<name>` branch is a candidate for the next regression, and `main`'s commitments stay authoritative until the candidate is merged; then the commitments the candidate proved join the regression.

A commitment's meaning is stated once. A node never changes, so a commitment stated in BRAIN keeps one meaning in every generation, and a change that keeps its node retains it. Later understanding supersedes a node through a new node with the same name, and the old node stays as it was learned. Replacement and withdrawal supersede alike: a replacement's node states the commitment KAAL makes now; a withdrawal's node states that KAAL no longer makes the commitment, and why. A withdrawal succeeds the old meaning but establishes no commitment in its place. A commitment stated in code can change in place, so changing its statement changes the commitment. A candidate names every commitment of `main` it replaces or withdraws, together with what supersedes it; whatever it does not name, it retains.

The skill explains how a test is written. This node records why and how KAAL uses it.
