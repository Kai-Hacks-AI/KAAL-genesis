---
name: managing-change
---

# Managing Change

KAAL uses the **managing-change** skill to keep individual Changes as immutable occurrences beneath the evolution they contribute to, each owning only what arose from that Change. The Changes of `kaal/change` live in `change/change/`.

The skill does not seal, and cannot prove a Change was never edited. KAAL composes it with the **using-seals** skill instead, as it does for BRAIN: each Change lineage is a chain, each Change a unit, taken in the skill's traversal order, and a Change is closed when it is sealed. The chain heads are `seals.json` at the top of the repository rather than in `change/`, which holds nothing but Changes, and each Change's seal is its `seal.json`, so no Change owns material by that name.

Sealing follows acceptance, so a candidate is checked against the branch it targets: its Changes must be valid, every sealed Change intact, no seal state written, no Change the target already holds rewritten, sealed or not, and new Changes in a sealed lineage must follow its sealed history. Only sealing on `main` then seals what was accepted, and from then on the seals prove it. The chain's order is the order sealed history grows in; it is not the order Changes compose in.

Neither can tell two Changes born apart with one identity from one Change if both arrive before either reaches the target: keeping them apart belongs to whatever brings them together.
