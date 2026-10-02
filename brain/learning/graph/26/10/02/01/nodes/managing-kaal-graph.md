---
name: managing-kaal-graph
---

# Managing KAAL Graph

KAAL uses the **managing-kaal-graph** skill as a birth-test: to learn, in working KAAL rather than by reasoning alone, whether Node and Reference hold up as semantics, and what a graph that describes itself actually requires. It proves the Skill on the `kaal/graph` line. It does not yet prove that any of this belongs in the hardcore `kaal-core`: what the Skill teaches may later show what, if anything, must cross that bootstrap boundary.

A Node is a durable, immutable, addressable thing with a name that is its identity in the scope that owns it, and a type naming what it is. A Reference belongs to its referrer, names a relation and a target, changes nothing about the target, and requires the target to know nothing about its referrers. Five Skills already repeat that rule; this gives it one home.

The graph begins with **KAAL Kernel**, of type `Definition`, in `graph/`. Its body is only the contract needed to read the next Definition: what a Definition is, what `name` and `type` mean, and that the body carries the meaning of the named thing. It is named Kernel, not Core, because Core is an architectural layer and `kaal-core` is the bootstrap machinery, while the Kernel is the tiny semantic bootstrap. **Reference** is born from that contract alone and is the first proof it suffices, then **Node**. No Node is named `Definition`: the type is defined by the Kernel's body, not by a Node of its own.

What the minimum showed: Reference needed nothing beyond name, type and body. It did not need a relation or a target slot, so the Kernel defines none; Reference pointing at itself would force the Kernel to define one, and that is the next semantic to earn. The Skill reads the `type` slot and an optional `references` list as structure, but their meaning for KAAL is not licensed by the Kernel yet. KAAL, not the Skill, holds the graph to the Kernel (`scripts/graph.ts`).

What the experiment deliberately does not birth: supersession and a pinned or current definition, migration of existing records, resolution across scopes, ordering between births, traversal, queries, indexes, cardinalities, domain relations and a registry of types. The research's temporal-definition hole is real and is left open. Co-birth and parallel birth are real conditions, so nothing orders Nodes.

The skill knows no BRAIN, Testing, Requirements, Git or GitHub. Existing Skills keep their domain semantics, and where independent scopes are brought together is for an Extension, not decided here.

The skill explains how to manage Nodes and References. This node records why KAAL uses it, and that it is an experiment.
