---
suites: []
---

# Feature

This Change births Testing Conditions. A Suite may declare that one test of one of its Cases does not apply on some platforms, and why; where the Run's platform is among them, that test may be skipped and is reported as not applicable, never as proof. Every other skip still keeps its Case from passing, and a Condition whose test its Case no longer reports fails that Case.

It was earned by the named-pipe test of `skills/using-skills/scripts/skills.test.ts`, which guards a POSIX-only hazard and is skipped on Windows: Testing refused that skip, correctly, and had no way to say the test genuinely does not apply there.

The protection this introduces is the testing skill's own tests of Conditions, which stay with the skill in `skills/testing/scripts/testing.test.ts`. This Change adds no Suite to collect them and carries no Regression Test Plan: the Plan that must hold after it is whichever Regression Test Plan names the testing skill's tests.
