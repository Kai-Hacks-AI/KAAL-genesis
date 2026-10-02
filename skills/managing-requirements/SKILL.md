---
name: managing-requirements
description: Create, read, validate and collect Requirements, durable Markdown statements of what must hold, each with a portable id other material can reference.
---

# Managing Requirements

A Requirement is durable meaning: a Markdown file stating, for Humans and agents, something that must hold. Its YAML frontmatter holds the one fact this skill owns, its `id`; the body is the meaning, kept exactly as written: only the blank lines before it and the whitespace after it are framing, so the indentation of its first line is content. Other frontmatter may sit beside `id`: this skill does not read it, gives it no meaning and does not refuse it, so whatever owns it may interpret it. Requirements live as files directly in a directory the caller supplies, `<dir>/<id>.md`; the `*.md` files directly in it are the Requirements, and nothing else in or near it is this skill's:

```
---
id: works-offline
---

The system works without a network connection.
```

The `id` is the Requirement's identity. It is portable: lowercase kebab-case (`a-z`, `0-9`, single hyphens), never a Windows reserved device name such as `con` or `nul`, at most 64 characters so that `<id>.md` is always a portable file name, and equal to the file's name without `.md`. It derives from no version control, hosting or location: moving the file, or the directory, or the repository, changes neither identity nor meaning. An id is never reused for different meaning. A Requirement that later replaces another is a new Requirement with a new id; this skill keeps no relation between them.

Other material references a Requirement by its `id`: the reference belongs to the referrer, which may name any number of Requirements, and any number of referrers may name the same one. A Requirement never names what refers to it.

Create with `scripts/create.ts <dir> <id> <meaning>`: it writes `<dir>/<id>.md`, refuses an unportable id, a blank meaning and an existing file, so a Requirement is never rewritten. Validate with `scripts/validate.ts <dir>...`: each `*.md` file directly in a directory must be a regular file with a valid `id` equal to its file name and a non-blank meaning, and an id is defined once across all the directories given; other files and subdirectories are left alone. A missing directory holds no Requirements. Read with `scripts/read.ts --root <dir>... [id]...`: it prints each id's meaning, prints every id when none is named, and fails on an id that names no Requirement. From code, `readRequirements` and `resolve` in `scripts/requirements.ts` return the same.

Collect with `scripts/collect.ts <dir>...`: it prints, as a JSON array, the Requirements directly in the directories given, each with its `id`, `meaning` and `file`, or, when anything in a directory claims to be a Requirement and is not, says why and prints nothing else. A caller that needs the Requirements of a scope asks here and never learns how they are kept. Collection is local: only the Requirements directly in a directory supplied are collected, and it never descends into subdirectories, so a caller that wants Requirements from several places names each directory. What the collection means is the caller's: this skill assigns it no meaning beyond `Requirements found in this scope`. From code, `readRequirements` in `scripts/requirements.ts` returns the same.

Validation reads the files as they are now and cannot prove a Requirement was never edited. The skill knows where neither the directories nor the referrers are. Why Requirements are kept, where they live, and what refers to them belong to the using system.
