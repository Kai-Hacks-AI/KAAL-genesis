---
id: kaal-skill-semantics-in-references
idea: A KAAL Skill could expose KAAL-readable semantics about itself under
  references/kaal/, so using-skills drives required capability from declared
  semantics rather than from which scripts exist.
---

Evidence from the collect contract (#178): using-skills can enforce the structural collecting contract, but cannot know which Skills ought to declare it, because collect.ts is declared voluntarily and nothing machine-readable says a Skill manages a durable kind.

The Agent Skills specification permits any files and directories beyond SKILL.md; scripts/, references/ and assets/ are conventions, and references/ holds material loaded on demand. A one-level references/kaal/ namespace is compatible with it.

Prospective ownership: using-skills (possibly later named using-kaal-skills) owns the location and convention, since it owns what a KAAL Skill looks like; managing-kaal-graph owns the Node and Reference semantics of material placed there; each Skill owns what it says about itself. No SKILL.md field is added.

Not decided: any file under references/kaal/, any rename of using-skills, any graph representation. The graph work (#175) has not yet earned the relation semantics this would need.
