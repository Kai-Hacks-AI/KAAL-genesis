---
name: managing-defects
---

# Managing Defects

KAAL uses the **managing-defects** skill so that something KAAL intends to hold, once observed not to hold, is kept as a defect rather than lost with the run that showed it. A defect is a persistent record that something KAAL intends to hold was observed not to hold. The observation, the defect and any repair stay distinct.

KAAL keeps its defects in `defects/`. A defect's `holds` names what KAAL intends to hold, by the place it is stated where it has one; its `observed` names where it was observed not to hold: the check, the case and the conditions it ran under; and its `tested-by` names the cases that test whether it holds. KAAL names a case by its test file, in backticks, and the case's name, which is how KAAL addresses a case while it does not yet say what a case is.

A defect records no state of its own. A repair may intend to repair a defect, but only running the cases that test it shows whether it still fails; nothing written beside a defect says it is repaired.

KAAL keeps this capability minimal while its testing is still taking shape: it records defects and the cases that test them, and nothing decides their state, their order, who repairs them, or how they are found.

The skill explains how defects are recorded and checked. This node records why and how KAAL uses it.
