---
name: testing
---

# Testing

KAAL understands that a Requirement is tested by evidence that is sufficient for it, and that a `tests` relation is that claim: the Test Case or Test Suite that declares it asserts it is sufficient evidence for what it names. One Case can be sufficient. When sufficiency depends on several Cases together, the Suite carries the claim and its Cases realize it collectively; they do not each claim the whole of it. The rule is about what each claim asserts, not about how many claims there are, so independent Cases or Suites may each be sufficient for the same Requirement.

This sharpens an earlier understanding that a Suite collects the Cases that serve a concern. That stands: the concern is now also where a Suite states what it is sufficient evidence for and how its Cases together suffice.

The Testing skill states this as meaning first. No tool yet reads a Suite's claim as it reads a Test Case's `tests`, and a `suite.json` still holds only `concern`; whether tooling is earned is for the first Suite that has to be built this way to show.
