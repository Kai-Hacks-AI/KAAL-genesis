---
name: managing-requirements
---

# Managing Requirements

KAAL uses the **managing-requirements** skill so that something KAAL commits to hold can be stated once, in a place of its own, rather than only in passing inside testing or BRAIN. A Requirement is that durable statement; the commitment is what it means: that KAAL holds what the Requirement states. KAAL already identifies a commitment by the one place where it is stated, and its cases point at that place. A Requirement is a place made only for that.

It is not the only such place. KAAL's existing commitments are stated in BRAIN nodes, in code and in each skill's `SKILL.md`, and they stay there: moving one would replace or withdraw a commitment of the accepted regression, which is testing's succession to decide. KAAL keeps its Requirements in `requirements/` and records none yet.

A Requirement says what must hold, not how it is proven. Testing owns the evidence: a case of KAAL's that helps prove a Requirement's commitment points at it with `// Why: requirements/<name>/requirement.md`, as it points at any place a commitment is stated, and only once a plan names that place. A Requirement never names its cases, suites, plans or runs, and records no state, owner or priority. A defect that observes a Requirement not holding can name it by that place in its `holds`, and stays a defect. An Idea may lead to a Requirement, and a Requirement may have no Idea before it; neither names the other.

A Requirement records a commitment as it was made, so it is immutable: changing what KAAL commits to is a new Requirement, never a rewritten one, since a case's link would otherwise come to mean something it was never written against. KAAL requires this of every Requirement and does not yet seal Requirements with using-seals; until it does, a Requirement's record is kept by never being written again. Sealing a Requirement would not seal what points at it: a case that begins or stops pointing at one changes the evidence for its commitment without changing the Requirement. How one Requirement succeeds another, and how Requirements become what a Feature Test Plan promises, what acceptance keeps and what regression inherits, are not decided here.

The skill explains how Requirements are recorded and checked. This node records why and how KAAL uses it; the Requirements themselves are not BRAIN meaning.
