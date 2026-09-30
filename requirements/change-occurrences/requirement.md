---
holds: KAAL births each Change once, as an immutable occurrence beneath its
  named lineage, identified from its files alone, owning only what is placed
  beneath it, and never changing a Change born before it
---

A Change is one individual change to KAAL. It contributes to a larger evolution, its lineage, and several Changes may contribute to one lineage. KAAL keeps its Changes in `change/`: each lineage is a directory `change/<lineage>/`, named portably, in lowercase letters, digits and single hyphens and never a name Windows reserves, and each Change is an occurrence beneath it, `change/<lineage>/<occurrence>/`, named by its place in its lineage's births, a positive integer without leading zeros. `<lineage>/<occurrence>` is the Change's identity. It is read from the tree's files alone, the same on every supported platform, and asks nothing of Git, a repository host, a branch, a commit or a pull request.

A Change is born as the occurrence after the latest one of its lineage: an empty directory and nothing inside it. Birth is refused, and changes nothing, for a name that is not portable, in a lineage that holds anything out of place, and for an occurrence already born or not later than the latest. So an occurrence is born once, and birthing a Change never changes one born before it.

A Change owns whatever is placed beneath it, and only that. It may be empty or hold one subtree; nothing requires it to hold anything. Two Changes may each own something at the same relative path, with different bytes: neither overwrites the other. Once born, an occurrence is history: a later change births a later occurrence rather than writing into an earlier one.

In a well formed tree, directly beneath `change/` stand only lineages, and `AGENTS.md`, guidance for working among them; directly beneath a lineage only occurrences, each a directory and not a link; anything else is refused when the tree is checked. Occurrences are listed in one order, from the files alone: lineages by name, in code-unit order, and each lineage's occurrences in the order they were born.

Where this ends: what a Change's material means, and whether it is valid, belong to whatever places it there; the Change tree neither reads nor judges it. Which occurrence is current, whether a later Change's material supersedes an earlier one's, how occurrences are composed, and which repository branch or pull request carries a Change are not part of this. Nothing yet seals an occurrence: until something does, an earlier occurrence is kept by never being written again.
