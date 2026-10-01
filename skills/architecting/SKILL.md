---
name: architecting
description: Create, read and validate Architecture records, durable Markdown statements of where a responsibility or machinery belongs, each with a portable id other material can reference.
---

# Architecting

An Architecture record is durable meaning about placement: a Markdown file stating what owns a responsibility, what composes what, or whose machinery something is. It records where something belongs, not that it is currently so in any code. Its YAML frontmatter holds the one fact this skill owns, its `id`; the body is the placement, kept exactly as written: only the blank lines before it and the whitespace after it are framing, so the indentation of its first line is content. Other frontmatter may sit beside `id`: this skill does not read it, gives it no meaning and does not refuse it, so whatever owns it may interpret it. Architecture records live as files directly in a directory the caller supplies, `<dir>/<id>.md`; the `*.md` files directly in it are the records, and nothing else in or near it is this skill's:

```
---
id: parser-owns-syntax
---

A parser owns the syntax of its language; what a tool does with the parsed result belongs to the tool.
```

A record states placement only. It judges no work, records no state such as accepted or violated, and names nothing that is placed, composed or refers to it. Whether some work honours a placement is decided by whoever judges that work, who refers to the record and never changes it. This skill gives a record no rules and keeps no catalogue, diagram or graph of how things fit together: it knows what a record is, not what any system's architecture should be.

The `id` is the record's identity. It is portable: lowercase kebab-case (`a-z`, `0-9`, single hyphens), never a Windows reserved device name such as `con` or `nul`, at most 64 characters so that `<id>.md` is always a portable file name, and equal to the file's name without `.md`. It derives from no version control, hosting or location: moving the file, or the directory, or the repository, changes neither identity nor placement. An id is never reused for a different placement. A record that later replaces another is a new record with a new id; this skill keeps no relation between them.

Other material references a record by its `id`: the reference belongs to the referrer, which may name any number of records, and any number of referrers may name the same one. A record never names what refers to it.

Create with `scripts/create.ts <dir> <id> <placement>`: it writes `<dir>/<id>.md`, refuses an unportable id, a blank placement and an existing file, so a record is never rewritten. Validate with `scripts/validate.ts <dir>...`: each `*.md` file directly in a directory must be a regular file with a valid `id` equal to its file name and a non-blank placement, and an id is defined once across all the directories given; other files and subdirectories are left alone. A missing directory holds no records. Read with `scripts/read.ts --root <dir>... [id]...`: it prints each id's placement, prints every id when none is named, and fails on an id that names no record. From code, `readArchitecture` and `resolve` in `scripts/architecture.ts` return the same.

Validation reads the files as they are now and cannot prove a record was never edited. The skill knows where neither the directories nor the referrers are. Why records are kept, where they live, and what refers to them belong to the using system.
