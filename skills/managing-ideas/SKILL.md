---
name: managing-ideas
description: Create, read and validate Ideas, durable Markdown records of a possibility worth retaining without commitment, each with a portable id other material can reference.
---

# Managing Ideas

An Idea is a possibility worth retaining without commitment. Keep one when losing the possibility would lose something valuable, but treating it as a decision, current belief or work to pursue would claim too much. It is a Markdown file. Its YAML frontmatter holds the two facts this skill owns, its `id` and `idea`, a concise statement of the possibility; the body is the context needed to understand it, kept exactly as written: only the blank lines before it and the whitespace after it are framing, so the indentation of its first line is content. Other frontmatter may sit beside them: this skill does not read it, gives it no meaning and does not refuse it, so whatever owns it may interpret it. Ideas live as files directly in a directory the caller supplies, `<dir>/<id>.md`; the `*.md` files directly in it are the Ideas, and nothing else in or near it is this skill's:

```
---
id: shared-reading-list
idea: The team could keep one reading list.
---

What one member found worth reading would not be lost to the rest. Nothing is decided; it was only worth remembering.
```

An Idea is only the possibility and its context. It records no state such as accepted, rejected or planned, no priority, assignment or schedule, and names nothing that acts on or refers to it. Later interpretation, rejection, acceptance or action does not change it, and what any work does with an Idea is decided by that work, which refers to the Idea and never changes it. What was once worth retaining stays as it was.

The `id` is the Idea's identity. It is portable: lowercase kebab-case (`a-z`, `0-9`, single hyphens), never a Windows reserved device name such as `con` or `nul`, at most 64 characters so that `<id>.md` is always a portable file name, and equal to the file's name without `.md`. It derives from no version control, hosting or location: moving the file, or the directory, or the repository, changes neither identity nor possibility. An id is never reused for a different possibility.

Other material references an Idea by its `id`: the reference belongs to the referrer, which may name any number of Ideas, and any number of referrers may name the same one. An Idea never names what refers to it.

Create with `scripts/create.ts <dir> <id> <idea> <context>`: it writes `<dir>/<id>.md`, refuses an unportable id, a blank `idea`, a blank context and an existing file, so an Idea is never rewritten. Validate with `scripts/validate.ts <dir>...`: each `*.md` file directly in a directory must be a regular file with a valid `id` equal to its file name, a non-blank `idea` and a non-blank context, and an id is defined once across all the directories given; other files and subdirectories are left alone. A missing directory holds no Ideas. Read with `scripts/read.ts --root <dir>... [id]...`: it prints each id with its possibility and context, prints every id when none is named, and fails on an id that names no Idea. From code, `readIdeas` and `resolve` in `scripts/ideas.ts` return the same.

Validation reads the files as they are now and cannot prove an Idea was never edited. The skill knows where neither the directories nor the referrers are. Why Ideas are kept, where they live, and what refers to them belong to the using system.
