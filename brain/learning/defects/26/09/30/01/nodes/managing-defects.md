---
name: managing-defects
---

# Managing Defects

KAAL uses the **managing-defects** skill so that something KAAL intends to hold, once observed not to hold, is kept as a durable, readable observation rather than lost with the run, review or conversation that showed it. A Defect is an immutable observation, nothing more. It is a Markdown file with a portable id, and other material refers to it by that id.

KAAL composes the skill with Change; neither skill knows the other. A Defect is born inside the Change occurrence that discovered it, `change/<lineage>/YY/MM/DD/CC/defect/<id>.md`, beside whatever else that Change holds, and adds no occurrence identity of its own. Where it lies says where it was observed. `managing-change` does not interpret it and `managing-defects` does not know where it sits. `npm run defects:check` is that composition, and finds Defects by looking in every Change, not by a list: there is no registry of Defects.

A Defect carries no status. Open, fixed, blocking, legacy and accepted describe what a Defect means for some work, and that belongs to the work. The Change that discovered a Defect, or a later Change, decides whether it blocks that Change or is accepted as outside its responsibility, by referring to the Defect by its id; the decision belongs to the referrer, never the Defect. KAAL has not yet decided how a Change records that, and adds nothing for it until it needs to. A Defect is never rewritten.

The earlier managing-defects of Genesis kept a Defect as a directory with `defect.md`, holding what should hold, where it was observed not to, and what was observed. It recorded no state and named nothing that tested it, and this keeps both. It drops `observed` as a field: the Change occurrence that contains a Defect says where it was observed, and the body says how. It keeps no repair record, resolution, severity, owner or link to Testing or Requirements, since nothing KAAL has needed so far requires them.

The skill explains how to manage Defects. This node records why KAAL uses it.
