---
name: execution-environments
---

# Execution Environments

KAAL supports execution on Linux and on Windows, and records each as its own Requirement, **linux-support** and **windows-support**, introduced by the Change `requirements/26/09/30/02`. The obligation was implicit until Regression Testing exposed existing Test Cases that skip on Windows, which showed that KAAL deliberately executes on both but had never said so as a Requirement.

The two are separate because their evidence, applicable Cases and defects can differ, and neither should change because evidence for the other does. Neither says every Test Case runs identically on both platforms, and neither is CI configuration: a workflow that runs on both is evidence, not the Requirement. A Test Case that needs one platform does not make the capability it demonstrates platform-specific; whether a skip means a defective Case, missing evidence, a genuinely platform-specific capability or an infrastructure blocker is for Testing to judge against these Requirements.

They answer a different question from **git-independence** and **github-independence**, which say what must not become KAAL semantic authority; these say where KAAL is supported. No relationship between them is recorded.

The Requirement material stays in the Change, not in BRAIN. This node records what KAAL understands about its execution environments.
