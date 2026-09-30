---
name: managing-change
description: Birth and validate immutable Changes, each an occurrence of work beneath the lineage it contributes to, owning a sparse subtree no other Change overwrites.
---

# Managing Change

A Change is an immutable occurrence of work contributing to a named lineage and owning a sparse subtree. Changes live beneath a root, by default `change`:

`<root>/<lineage>/<YY>/<MM>/<DD>/<CC>/...`

The lineage names the larger work a Change contributes to. It is a path component, so it must be portable: lowercase kebab-case (`a-z`, `0-9`, single hyphens) and never a Windows reserved device name such as `con` or `nul`. The occurrence `YY/MM/DD/CC` is the Change's identity within its lineage: the calendar date it was born and a two-digit counter from `01` for Changes born the same day. Fixed-width digits keep the identity portable and make traversal deterministic: lineages by name, then each lineage's occurrences in sorted order. That order is only deterministic: Changes may be born and worked on in parallel, and whether the order means anything, such as when Changes were accepted or how they compose, is for whatever uses them to decide.

Everything beneath an occurrence is owned by that Change alone. The subtree is sparse: a Change holds only what arose from it, has no required children, and this skill never interprets it. Two Changes may own the same relative path with different bytes; neither overwrites the other. Whether a later Change's material supersedes, replaces, adds to or removes an earlier one's is not a Change's to know: that meaning belongs to whatever uses the material.

Birth with `scripts/birth.ts <lineage> <YY/MM/DD/CC>`: it creates the occurrence's directory, empty, and nothing inside it. Birth refuses an unportable lineage, a malformed occurrence and a path through a symlink before writing anything, and refuses an occurrence that already exists, so an earlier Change is never written over; if it fails partway, it removes the directories it created that are still empty, so it never removes a Change born beside it.

Validate with `scripts/validate.ts [root]`. It refuses anything at the levels this skill owns that is not a Change: a file or a malformed name where a lineage or an occurrence level belongs, and a level that leads to no Change. Beneath an occurrence it refuses only symlinks and special entries, since a Change owns its own files and directories and nothing else. A Change holding nothing is valid: it owns nothing yet. List a root's Changes with `scripts/list.ts [root]`, in traversal order; from code, `readChanges` in `scripts/changes.ts` returns them with the same errors.

Birth refuses to overwrite a Change, and validation reads the files as they are now. Neither can prove that a Change was never edited after it was born: that needs something kept beside the files, such as a seal over each occurrence. Nor can birth see Changes it is not shown, so Changes born apart with the same identity must be kept apart by whatever brings them together. Why Changes are kept, and what their contents mean, belong to the using system.
