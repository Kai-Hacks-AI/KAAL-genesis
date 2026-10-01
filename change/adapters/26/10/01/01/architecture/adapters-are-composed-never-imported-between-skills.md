---
id: adapters-are-composed-never-imported-between-skills
---

An adapter is supplied to a skill by KAAL's composition, never imported from another skill.

Skills stay independently installable and none imports another's machinery. That does not forbid a shared external abstraction: an adapter may be owned at KAAL's composition layer, supplied from outside, or used where present, and it reaches a skill as something the caller passes in, as KAAL already passes the known Requirement and Defect ids to Testing. A skill neither imports an adapter nor needs one present for its own meaning.
