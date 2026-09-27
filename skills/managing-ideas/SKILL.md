---
name: managing-ideas
description: Record and check immutable Ideas, possibilities worth retaining without commitment. Use when a possibility should survive without implying it will be pursued.
---

# Managing Ideas

An Idea is a possibility worth retaining without commitment. Keep one when losing the possibility would lose something valuable, but treating it as a decision, current belief or work to pursue would claim too much.

An Idea records what the possibility was and enough context to understand it. Later interpretation, rejection, acceptance or action does not change that historical record. An Idea has no state, priority, assignment, schedule or lifecycle. Anything that later acts on an Idea owns that relationship.

Each Idea is a directory in an ideas directory the using system chooses, named for the Idea with lowercase letters, digits and single hyphens, never a name Windows reserves such as `con` or `nul`, and holds only `idea.md`. The record's frontmatter contains only `idea`, a concise statement of the possibility; its body is the context needed to understand it. Files beside the Ideas, such as guidance for working among them, are the using system's.

Record an Idea with `scripts/record.ts <dir> <name> --idea <possibility> <context-file>`. It refuses an Idea that is already recorded. Check an ideas directory with `scripts/check.ts <dir>`: it reports every record that is incomplete or out of place, and otherwise lists each Idea with its possibility.
