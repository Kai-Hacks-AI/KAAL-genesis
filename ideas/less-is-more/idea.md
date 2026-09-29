---
idea: "LESS IS MORE, remembered as a possible guiding principle: Let Experience
  Support Simple Implementations So More Optimization Reaches Enhancements"
---

The mnemonic and its ten parts, as recorded, are:

- L: Let;
- E: Experience;
- S: Support;
- S: Simple;
- I: Implementations;
- S: So;
- M: More;
- O: Optimization;
- R: Reaches;
- E: Enhancements.

Together: Let Experience Support Simple Implementations So More Optimization Reaches Enhancements. The wording is kept exactly as given. It is not improved, or completed with other words, to make the acronym more elegant.

The possibility is not that less code is better, nor that the smallest implementation should be designed first. It is closer to this: experience may reveal enough of the real responsibility that an implementation can become simpler, and once the implementation expresses that responsibility simply, later optimization has a clearer and more reliable target for enhancement. Experience comes before justified simplification, and complexity encountered while learning is not automatically failure. The hypothesis is that worked experience can reveal which responsibilities actually matter, which mechanisms were accidental, which complexity belongs to another owner, which distinctions survive repeated evidence and what can safely be removed, so that optimization operates on something whose responsibility is clearer rather than on accumulated accidental complexity. That interpretation is provisional.

The strongest current worked evidence is pull request #62, still in flight at the time of recording. Protection Evolution began with a legitimate problem: Testing's protection needed to survive changes between Regression generations without silently weakening inherited protection. Repeated implementation and adversarial review then accumulated machinery around source interpretation, executable Case equivalence, imports and exports, module loading, TypeScript and JavaScript carrier semantics, compiler configuration, package resolution and witnesses meant to certify a replacement. That experience eventually exposed a simpler governing structure: Feature adds, Acceptance removes, Regression projects. Under it much of the machinery appears unnecessary, because Regression can project accepted evidence instead of requiring the candidate to reproduce an equivalent proof. The evidence for this Idea is that the larger implementation was useful experience that helped expose the smaller responsibility, not that #62 was too much code. The reset of #62 has not yet succeeded, so #62 motivates the Idea and does not validate it.

KAAL's BRAIN shows the same shape on a smaller scale. In `brain/learning/genesis/26/09/28/05/nodes/coding.md`, line endings were normalised with one more exception per finding until the normalisation was removed, and a second reader written beside an owner that already stated the meaning was found, in Markdown sections, case titles and a state's entries, until one reader remained. In `brain/learning/genesis/26/09/28/04/nodes/architecting.md`, the Acceptance work passed through a model of protection of its own, then a reuse of what plans require, before finding that the accepted regression already is the protection and that Acceptance owns only what a candidate deliberately excludes: implementation pressure showed duplication, and the responsibility already had an owner. That same node records that the many review findings that hardened how plans are read moved no owner, so not every accumulation of machinery is evidence for this Idea. These examples are reported as recorded, not as a story built to fit.

It relates to existing records without changing them. Coding owns turning red evidence into green through the responsible implementation, including repairing the whole class; this Idea is a broader possibility about experience, simplification, optimization and enhancement, and is not part of Coding. Architecting helps decide where a responsibility belongs, and may show that one implementation absorbed responsibilities belonging elsewhere; that does not make this an architectural rule. `ideas/addiction/idea.md` retains a progression whose later parts are Improve and Optimize, which this Idea may eventually relate to; neither is merged with or reinterpreted through the other. `ideas/we-can-go-far/idea.md` retains a broader loop of worked evidence, learning, optimization and Regression; this Idea may describe one dynamic inside it, and neither depends on the other or completes the other's mnemonic.

This record keeps the possibility only, as a possible guiding principle the Human proposed and KAAL's worked experience suggests provisionally. It is not BRAIN learning and not a KAAL principle. Further evidence should decide whether KAAL learns it, changes it or leaves it as an Idea. It births no skill, capability, Requirement or BRAIN node, and defines no metric for simplicity, code-size threshold, architectural lint, optimization machinery or workflow. It changes nothing in #62, coding, architecting, testing, ADDICTION, TOGETHER WE CAN GO FAR, Regression, seals, releases, Genesis or BRAIN.
