---
name: managing-defects
---

# Managing Defects

KAAL uses the **managing-defects** skill so that something KAAL intends to hold, once observed not to hold, is kept as a defect until it is repaired, rather than lost with the run that showed it. A defect is a persistent record that something KAAL intends to hold was observed not to hold. The observation, the defect and its repair stay distinct.

KAAL keeps its defects in `defects/`. A defect's `holds` names what KAAL intends to hold, by the place it is stated where it has one, and its `observed` names where it was observed not to hold: the check, the case and the conditions it ran under. What repaired a defect is recorded beside it, and resolves it.

KAAL keeps this capability minimal while its testing is still taking shape: it records defects and their repairs, and nothing decides their order, who repairs them, or how they are found.

The skill explains how defects are recorded, resolved and checked. This node records why and how KAAL uses it.
