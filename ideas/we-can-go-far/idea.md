---
idea: KAAL's forward planning and testing loop could connect with a backward
  loop of worked evidence, learning and refactoring, through which the Owner
  gets enhanced by holistic experience reviews, remembered provisionally as
  TOGETHER WE CAN GO FAR
---

The mnemonic and its current working expansion are:

- TOGETHER: The Owner Gets Enhanced Through Holistic Experience Reviews;
- WE: Worked Evidence;
- CAN: Changes Adaption Now;
- GO: Getting Optimized;
- FAR: Features Accepted Regression.

The wording is deliberately not final. "CAN" is grammatically awkward; an earlier formulation was "Change Adapts Now". None of TOGETHER, WE, CAN or GO is a KAAL capability or committed architecture, and the acronym should not be completed by inventing concepts to fit its letters. The slogan matters less than the possibility it names: connecting KAAL's forward planning and testing loop with a backward loop of evidence, learning and refactoring, so that the Owner gets enhanced by it.

The Idea emerged from work on `kaal/testing`, especially the repeated review and fix cycles around #53. The observed pattern was roughly: work produces evidence; failures and observations accumulate; repeated evidence reveals shared concerns; those concerns can be analyzed across capabilities; that analysis may expose duplicated mechanisms or poor module boundaries; refactoring can improve the structure; changes introduce or alter behavior; Feature, Acceptance and Regression can eventually determine what new behavior is demonstrated, deliberately accepted and inherited as regression; and subsequent work produces more evidence. That suggests a continuous loop rather than a one-way delivery pipeline.

TOGETHER is the part of the phrase that says for whom and how the loop is meant to matter: the Owner gets enhanced through reviews of experience taken holistically. It is remembered as the wording of the possibility, not as a definition. This record does not define the Owner, Experience or Review, and does not say what a holistic review would be, who performs it or when. It only retains that the possibility named the Owner as the one enhanced, through reviewing experience, and that WE CAN GO FAR was the way that enhancement was imagined to happen.

Worked Evidence is a description, not an artifact. KAAL already has Test Cases, Test Runs, observations, Defects, review findings and Regression evidence. The hypothesis is that evidence becomes especially valuable after the system has actually been exercised. The existing testing architecture remains authoritative.

CAN gestures at a theory emerging from #53: Now, Change, Next. #53 distinguishes accepted state from candidate state. On GitHub a pull request carries both: its target supplies the accepted state, Now, and its proposed merge the candidate, Next. So a pull request may be a carrier of a Change rather than the Change itself, and a Change may eventually be understood as a proposed transition relative to Now. KAAL should not define Change, or make it depend on Git, branches or pull requests, until FAR has provided more evidence. In the same discussion, Backlog (what?) and Roadmap (when?) appeared beside Change as possible planning vocabulary; they are named here only as context.

GO describes the possible backward learning and refactoring part of the loop. Findings repeated through #53 about links, unreadable filesystem state, escaping state, malformed structures and uncontrolled filesystem failures were not only isolated Plan bugs: similar concerns already appear independently in BRAIN, sealing, skills and Regression. That suggests a progression from individual failures, to Cases, to a recurring shared concern, to a Suite, to analysis across KAAL, to a possible architectural smell, to possible refactoring. Repeated behavioral evidence may reveal where KAAL's modular boundaries should improve, as structural pressure observed rather than architectural taste. "Getting Optimized" means continuous improvement, not that KAAL can determine or reach an optimum.

Requirements state what must hold. Suites group testing around a shared concern, functional or non-functional. Cases remain owned by the capabilities whose claims they prove while belonging to Suites that cut across those capabilities, so evidence can reveal recurring concerns without first imposing module boundaries. If Cases across independent capabilities cluster around one concern, KAAL can inspect whether their implementations share a responsibility, and only then might refactoring be warranted, while existing commitments remain protected. A shared Suite is evidence to investigate a common mechanism, not proof that one should be extracted.

FAR refers to the planned testing sequence of Feature Test Plan, Acceptance Test Plan and Regression Test Plan, which is not landed architecture. "Features Accepted Regression" captures the possibility that features which survive deliberate acceptance become future regression protection.

This record retains the possibility. It is not a Requirement, a Plan or a roadmap commitment, and it does not commit KAAL to the current expansions, to capabilities for the Owner, experience, review, evidence, changes, backlog, roadmap or optimization, to any FAR semantics, or to implementing this loop.
