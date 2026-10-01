---
name: testing
---

# Testing

KAAL uses the **testing** skill so the protection a Change leaves behind is stated in a Plan and executed rather than remembered: a Plan names Suites of Cases, and a Run says whether the Plan holds for a candidate.

Protection belongs to the Changes that introduce it: each Change carries its own Suites and the Plans that say what it adds, what it explicitly authorises to leave protection and what must hold after it. The skill stays independent of Change; KAAL composes them.

KAAL understands that protection moves by three things: **Feature**, protected meaning newly introduced; **Authorise**, the explicit authority by which protected meaning may cease to be required; and **Regression**, the resulting protected meaning that must continue to hold, `Rₙ₊₁ = Rₙ − Aₙ₊₁ + Fₙ₊₁`. Omission has no authority: protected meaning stays in Regression unless a Change explicitly authorises its removal, so a Change that merely stops carrying protection weakens nothing.

This sharpens an earlier understanding, which called Authorise **Acceptance**. That understanding stands exactly as it was learned and as the material written under it says: the earlier learning, the Testing skill's and the Test Strategy's earlier wording, and the sealed FAR checkpoints keep the word Acceptance, and what they call Acceptance is what is now called Authorise. The transition's mathematics did not change, only the name for the authority in it.

This node does not place Feature, Authorise and Regression: the Testing skill currently computes Regression, which is only where that computation happens to live, not a decision about what owns the semantics of FAR.

How KAAL tests is KAAL's Test Strategy, in `test/`, KAAL's instance of Testing. This node records why KAAL uses it.
