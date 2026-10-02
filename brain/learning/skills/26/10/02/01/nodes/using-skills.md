---
name: using-skills
---

# Using Skills

KAAL's **using-skills** skill now also owns the one shape KAAL's Skills share where it is earned: a Skill that manages durable things lets a caller collect them from a scope through the Skill, never through knowledge of how they are kept.

FAR-15 (#171) exposed the pressure. A Change births Requirements, and what the Change then means by them is the Change's to decide, but it should not have to learn how managing-requirements stores, recognizes or reads them. The Skill that owns a thing owns how it is recognized, read, validated and collected. The caller owns why it asks. The same Requirements collector can serve a caller that wants the Requirements born here and a caller that wants the Requirements to protect, each giving the result its own meaning.

The shape already existed in the record-managing Skills (managing-requirements, managing-defects, managing-ideas, architecting): files directly in a directory the caller supplies, and `create`, `validate` and `read` scripts that take that directory. What differed was accidental: the name and the result's field (`requirements`, `defects`, `ideas`, `records`). The contract fixes only what a caller needs, `scripts/collect.ts <scope>...` printing a JSON array and exiting 0, or exiting 1 with the reason and nothing on stdout, and checks only what no Skill's semantics can change: an empty scope yields `[]`. A Skill declares it by having the script. Skills that judge or run, such as reviewing, testing and managing-change, manage no such things and are not asked for one.

Collection is local. Recursive traversal is not offered because the Requirements rule (every `*.md` directly in a directory is a Requirement) cannot hold across a tree, where Defects, Ideas and Architecture records sit as siblings. A caller that wants several places names each directory. No caller has yet needed more.

Only managing-requirements gains `collect.ts`. The other record-managing Skills fit the shape and gain it when a caller needs it, not for symmetry.

The skill explains the contract. This node records why KAAL holds it.
