---
name: testing
---

KAAL's Testing graph is born parent first. A Plan exists before the Suites that test it, a Suite before the Cases that test it, and a Requirement or Defect before any Case that tests it. Each child states its own edges to parents that already exist; a parent never lists its children, so nothing already born, and possibly sealed, is ever changed to admit a later one, however many children it gains. The reverse question, which Cases test a Requirement, is computed by reading what the children state, and KAAL keeps no registry of the graph. KAAL composes this across Changes: a Case in a later Change tests a Requirement born in an earlier one. What is earned is the direction and the edges FAR Genesis needed, a Case testing a Requirement or a Defect, and a Suite and a Case testing upward; how a Run binds what it tested is not.
