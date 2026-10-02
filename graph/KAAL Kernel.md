---
name: KAAL Kernel
type: Definition
---

A Definition is a Markdown file that defines a thing. Its YAML frontmatter has a `name`, which identifies the Definition among those beside it and is the file's name before `.md`, and a `type`, which says what kind of thing the file is. A file of type `Definition` defines, in its Markdown body, the thing its `name` names.

KAAL Kernel is of type `Definition`: this body defines Definition itself, which is how every Definition after it is read.
