---
name: managing-requirements
description: Record and check immutable Requirements, durable statements of what the using system commits to hold. Use when a commitment needs a home of its own that cases can point at.
---

# Managing Requirements

A Requirement is a durable statement of something the using system commits to hold. The Requirement is the record; the commitment is what it means. Keep one when a commitment should be stated once, in a place of its own, so whatever proves it, or observes it not holding, can name that place.

A Requirement records the commitment as it was made. Its record never changes once written: a different commitment is a different Requirement, and how one Requirement succeeds another is not decided here. A Requirement says what must hold, not how to prove it. It names nothing that proves it and records no state, status, priority, owner or lifecycle; what proves a Requirement points at it, as the using system decides.

Each Requirement is a directory in a requirements directory the using system chooses, named for the Requirement with lowercase letters, digits and single hyphens, never a name Windows reserves such as `con` or `nul`, and holds only `requirement.md`. The record's frontmatter contains only `holds`, concisely what the using system commits to hold; its body states the commitment in full: what holding it means and where it ends. Files beside the Requirements, such as guidance for working among them, are the using system's.

Record a Requirement with `scripts/record.ts <dir> <name> --holds <what is committed to hold> <statement-file>`. It refuses a Requirement that is already recorded. Check a requirements directory with `scripts/check.ts <dir>`: it reports every record that is incomplete or out of place, and otherwise lists each Requirement with what it holds.
