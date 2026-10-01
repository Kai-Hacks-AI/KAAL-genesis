---
id: a-skill-is-independent-of-skills-extensions-and-providers
---

A Skill is an independent capability with its own semantics. It may depend on Core, and on nothing else that KAAL adds around it.

A Skill depends on no other Skill, on no Extension and on no concrete external provider such as Git or GitHub: it neither imports them nor needs one present for its own meaning. What it needs from them it receives as arguments from its caller, as Testing receives the Requirement and Defect ids it is told of and the conditions it is told to run under. That KAAL uses Skills together, and what their combination means, is never stated inside either Skill, so a Skill never acquires another Skill's model, or an Extension's composition, because KAAL uses them together. A Skill may depend on Core, the shared foundation, and stays reusable wherever Core is installed. A Skill may state what its own inputs must satisfy to stay portable across platforms, which is a property of its input and not a dependency on a provider. A Skill is what using-skills defines, a directory holding SKILL.md, whichever folder holds it.
