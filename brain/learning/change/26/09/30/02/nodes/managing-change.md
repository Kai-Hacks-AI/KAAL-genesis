---
name: managing-change
---

# Managing Change

KAAL uses the **managing-change** skill to keep individual Changes as immutable occurrences beneath the evolution they contribute to, each owning only what arose from that Change. The Changes of `kaal/change` live in `change/change/`.

The skill does not seal, and cannot prove a Change was never edited. KAAL seals its Changes with the **using-seals** skill exactly as it seals BRAIN, so a Change, once closed, cannot change unnoticed: each Change lineage is a chain, each Change a unit, taken in the skill's traversal order, and a Change is closed when it is sealed. The chain heads are `seals.json` at the top of the repository rather than in `change/`, which holds nothing but Changes, and each Change's seal is its `seal.json`, so no Change owns material by that name.

Sealing follows acceptance, in the same lifecycle as BRAIN: a candidate is checked against the sealed history of the branch it targets, and only sealing on `main` seals what was accepted. Changes share every limit of that sealing; strengthening it is sealing's own evolution. The chain's order is the order sealed history grows in; it is not the order Changes compose in.
