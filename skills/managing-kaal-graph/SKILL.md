---
name: managing-kaal-graph
description: Birth, read and check Nodes, durable Markdown records with a name and a type in the scope that holds them.
---

# Managing KAAL Graph

A Node is a durable, immutable, addressable thing with an identity in the scope that owns it. Here a scope is a directory the caller supplies and a Node is a Markdown file directly in it, `<dir>/<name>.md`. Its YAML frontmatter holds its `name`, its identity, and its `type`, a name for what it is; the body is what it means, kept as written. Other frontmatter is not read, given no meaning and not refused.

```
---
name: Reference
type: Definition
---

A Reference belongs to its referrer. It names a relation and a target.
```

The `name` is words of letters and digits in any script, in Unicode normal form C, with single spaces between, at most 64 characters, never a Windows reserved device name, and equal to the file's name without `.md`. Names that differ only in case are one name. It is the identity of Nodes held in a scope by this skill, and the scope alone owns it: the same name in another scope is another Node, and nothing here compares scopes. KAAL's other identities, such as an occurrence or a number, are not asked to take this form.

A `type` is a non-blank name, owed no format and no resolution: it need not name a Node. Nothing here knows what a type means, so a using system that defines its own types owns that, and the closure of its vocabulary.

Birth with `scripts/birth.ts <dir> <name> <type> <meaning>`: it writes `<dir>/<name>.md`, refuses an unportable name, a blank type, a blank meaning, and an existing file, so a Node is never rewritten. Check with `scripts/validate.ts <dir>`: each `*.md` file directly in the directory must be a regular file with a valid `name` equal to its file name, a type, a meaning, and no two names may differ only in case; other files and subdirectories are left alone. A missing directory holds no Nodes. Read with `scripts/read.ts <dir> [name]...`: it prints each named Node with its type and meaning, or every name when none is named, and fails on a name that names no Node. From code, `readNodes` in `scripts/graph.ts` returns the same.

Checking reads the files as they are now and cannot prove a Node was never edited. This skill does not resolve types, order Nodes, or know of any other scope. Which scopes there are, what types mean, how a Node states a Reference, and how scopes are brought together belong to the using system.
