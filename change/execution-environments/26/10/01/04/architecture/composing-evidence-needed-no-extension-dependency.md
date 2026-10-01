---
id: composing-evidence-needed-no-extension-dependency
---

Making the Run of the derived Plan on each environment, and presenting the Runs to Testing, needed no Extension to depend on another Extension. The Environment Extension makes the Run through an entry point that imports only the Skill it composes, and the derivation of the Plan stays in KAAL's Test composition: the two meet as a Plan file and as reports, which are what a caller hands between them, as a Skill's arguments always are. The earlier open question, an Extension depending on another Extension, is therefore still not decided and not exercised by code; the one place both are still read together is the Environment Extension's test, which reads the derived instances to name what a Run must perform.
