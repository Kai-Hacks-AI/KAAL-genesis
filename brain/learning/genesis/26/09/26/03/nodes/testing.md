---
name: testing
---

# Testing

KAAL uses the **testing** skill because Genesis showed that its testing had outgrown Bare. The skill has since grown backwards from KAAL's own tests, as the earlier `testing` node expected: it now also says how tests are grouped, run and planned. This node records how KAAL uses it, and supersedes the earlier one, which stated KAAL's regression through the operations of the system that happened to keep KAAL's files.

KAAL's testing has one anchor, `test/`, whose entry point the skill creates. Besides that entry point, `test/` holds only KAAL's Regression Plan; tests and their data stay with what they test.

KAAL works on files. The accepted regression is a state of KAAL's files whose commitments every later change must keep. A candidate is a state of KAAL's files proposed to succeed it. A candidate names the accepted regression it derives from by that regression's own content, never by where its files are kept or how they are versioned. The accepted regression's commitments stay authoritative until the candidate is accepted; the candidate then becomes the accepted regression, and the commitments it proved join what every later candidate must keep. Systems outside KAAL, such as a repository host, may keep the states, choose which one is accepted and arrange when a candidate is judged; they hand KAAL the states, and KAAL judges them from their files alone.

A commitment's meaning is stated once. A node never changes, so a commitment stated in BRAIN keeps one meaning in every generation, and a change that keeps its node retains it. Later understanding supersedes a node through a new node with the same name, and the old node stays as it was learned. Replacement and withdrawal supersede alike: a replacement's node states the commitment KAAL makes now; a withdrawal's node states that KAAL no longer makes the commitment, and why. A withdrawal succeeds the old meaning but establishes no commitment in its place. A commitment stated in code can change in place, so changing its statement changes the commitment. A candidate names every commitment of the accepted regression it replaces or withdraws, together with what supersedes it; whatever it does not name, it retains.

The skill explains how a test is written. This node records why and how KAAL uses it.
