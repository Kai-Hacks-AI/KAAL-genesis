---
name: architecting
---

# Architecting

KAAL uses the **architecting** skill so that where a responsibility or machinery belongs, once settled, is durable, readable meaning that Humans and agents can understand and other material can refer to by a stable id, rather than being re-derived each time the question reappears in a review, a repair or a conversation.

The evidence is two review notebooks, not a doctrine. In #121 repeated findings led a repair deeper into JavaScript and TypeScript parsing, until an external parser was made the authority for syntax and KAAL's own part shrank to what it actually meant. In #124 repeated findings led a repair deeper into GitHub workflow and state machinery, until the responsibility was changed so that its truth rested on stable Change and head meaning rather than mutable infrastructure state. Both were questions of placement: what owns this, and what merely composes it. Neither was a question about reviewing, and both were being answered only inside review rounds, where the answer could not be kept.

An Architecture record states placement, for example that Testing owns the interpretation of Test Case trace metadata and a JavaScript parser owns JavaScript syntax, that a capability composes another and does not absorb its meaning, or that some machinery belongs to an external authority. It is immutable and has a portable id. It records no state, severity, rule or verdict, and it is not a registry, diagram, dependency graph or decision log.

KAAL composes the skill with Change; neither skill knows the other. A Change that settles a placement keeps it in its one occurrence, `change/<lineage>/YY/MM/DD/CC/architecture/<id>.md`, beside whatever else that Change holds, and adds no occurrence identity of its own. `npm run architecture:check` is that composition, and finds records by looking in every Change, not by a list.

Architecture is meaning other work may be judged against where it is relevant. It is not a service: no skill depends on Architecting, calls it or learns its records, and Reviewing in particular stays independent and judges findings against the responsibility under review, whichever statement of it that work refers to. Whoever refers to a record owns the reference and what it means for their work.

Each part owns a different thing, and none depends on another. Architecting owns what an Architecture record is: its identity, its form and how it is created, read and validated. The Change composition owns where the occurrence that settled a record retains it, which is the record's durable home and its provenance. BRAIN owns what KAAL has learned and currently understands about itself, and may express architectural meaning where that is the right home for it. A record does not project into BRAIN automatically, Architecting does not depend on BRAIN, and the skill works without it. Nothing here makes the Change the only place KAAL's architecture can be understood, or BRAIN the place records are kept.

KAAL accepts no Architecture record with this birth and retrofits none from history.

The skill explains how to manage Architecture records. This node records why KAAL uses it.
