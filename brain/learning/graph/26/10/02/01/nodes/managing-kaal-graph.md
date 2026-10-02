---
name: managing-kaal-graph
---

# Managing KAAL Graph

KAAL uses the **managing-kaal-graph** skill as a birth-test: to learn, in working KAAL rather than by reasoning alone, whether Node and Reference hold up as semantics, and what a graph that describes itself actually requires. It proves the Skill on the `kaal/graph` line. It does not yet prove that any of this belongs in a hardcore `kaal-core`: what the Skill teaches us may later show what, if anything, must cross that bootstrap boundary.

A Node is a durable, immutable, addressable thing with an identity in the scope that owns it, and a type naming what it is. A Reference belongs to its referrer, names a relation and a target, changes nothing about the target, and requires the target to know nothing about its referrers. Five Skills already repeat that rule; this gives it one home.

The graph describes itself with three Nodes in `graph/`, each of type `definition`: Definition, which is its own type, so there is no typeless root; Reference, which uses the Reference mechanism on itself (Reference → Reference); and Node. The Skill's irreducible part is structural only: it reads the `type` slot and the Reference representation. Their meaning is present as Nodes, and KAAL, not the Skill, holds that vocabulary closed (`scripts/graph.ts`): every type and relation stated names a Definition. A relation the graph does not define, such as the first draft's `defined-using`, is refused rather than kept as an opaque label.

What the experiment deliberately does not birth: supersession and a pinned or current definition, migration of existing records, resolution across scopes, ordering between births, traversal, queries, indexes, cardinalities, domain relations and a registry of types. The research's temporal-definition hole is real and is left open. Co-birth and parallel birth are real conditions, so nothing orders Nodes.

The skill knows no BRAIN, Testing, Requirements, Git or GitHub. Existing Skills keep their domain semantics, and where independent scopes are brought together is for an Extension, not decided here.

The skill explains how to manage Nodes and References. This node records why KAAL uses it, and that it is an experiment.
