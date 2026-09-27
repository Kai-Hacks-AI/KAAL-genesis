---
name: managing-defects
---

# Managing Defects

KAAL uses the **managing-defects** skill so that something KAAL intends to hold, once observed not to hold, is kept as a defect rather than lost with the run that showed it. A defect is a sealed record of an observed failure, related to the cases that test for it. Its current state is not stored. The observation, the defect and any repair stay distinct.

KAAL keeps its defects in `defects/`. A defect's `holds` names what KAAL intends to hold, by the place it is stated where it has one, and its `observed` names where it was observed not to hold: the check, the case and the conditions it ran under.

What was observed stays observed, so a defect is sealed: its record never changes once written. KAAL requires this of every defect, and does not yet seal defects with using-seals; until it does, a defect's record is kept by never being written again.

A case points at the defect it tests; a defect never names its cases, so a defect can be recorded before any case tests it. A case of KAAL's that tests a defect says so with a `// Tests: defects/<name>` line directly above it, beside its `// Why:` lines. A skill's case points at nothing outside its skill, so only KAAL's own cases point at KAAL's defects.

A defect records no state of its own. A repair may intend to repair a defect, but only running the cases that test it shows whether it still fails; nothing written beside a defect says it is repaired.

KAAL keeps this capability minimal while its testing is still taking shape: it records defects, and nothing decides their state, their order, who repairs them, or how they are found.

The skill explains how defects are recorded and checked. This node records why and how KAAL uses it.
