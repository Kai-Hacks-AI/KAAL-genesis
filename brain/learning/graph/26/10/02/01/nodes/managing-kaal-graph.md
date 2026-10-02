---
name: managing-kaal-graph
---

# Managing KAAL Graph

KAAL uses the **managing-kaal-graph** skill as a birth-test: to learn, in working KAAL rather than by reasoning alone, whether two primitives, Node and Reference, are real Core semantics, before any more of a graph is imagined.

A Node is a durable, immutable, addressable thing with an identity in the scope that owns it. A Reference belongs to its referrer, names a relation and a target, changes nothing about the target, and requires the target to know nothing about its referrers. Five Skills already repeat that rule; this gives it one home. Node Node and Node Reference are the first two Nodes, in `graph/`. Node Reference is a Node, so there is one representation, not two.

What the experiment deliberately does not birth: supersession and a pinned or current definition, migration of existing records, resolution across scopes, ordering between births, traversal, queries, indexes, cardinalities, domain relations and a registry of types. The research's temporal-definition hole is real and is left open. Co-birth and parallel birth are real conditions, so nothing orders Nodes: a Reference may name a target that does not exist yet, or ever, or that is not a Node.

KAAL composes the skill with nothing. The skill knows no BRAIN, Testing, Requirements, Git or GitHub; `scripts/graph.ts` only says which directory is KAAL's own scope. Existing Skills keep their domain semantics, and where independent scopes are brought together is for an Extension, not decided here.

The skill explains how to manage Nodes and References. This node records why KAAL uses it, and that it is an experiment.
