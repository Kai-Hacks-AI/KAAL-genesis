import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = fileURLToPath(new URL("../SKILL.md", import.meta.url));

/** This skill's SKILL.md. The skill is born from init: SKILL.md is generated from here, never edited by hand. */
export const SKILL_MD = `---
name: managing-kaal-graph
description: Birth, read and check Nodes, durable Markdown records with an identity in the scope that holds them, and the References a Node states to other names.
---

# Managing KAAL Graph

A Node is a durable, immutable, addressable thing with an identity in the scope that owns it. Here a scope is a directory the caller supplies and a Node is a Markdown file directly in it, \`<dir>/<id>.md\`. Its YAML frontmatter holds its \`id\` and its \`type\`, a name for what it is; the body is what it means, kept as written. Other frontmatter is not read, given no meaning and not refused.

\`\`\`
---
id: reference
type: definition
references:
  - relation: reference
    target: reference
---

A Reference belongs to its referrer. It names a relation and a target.
\`\`\`

The \`id\` is portable: lowercase kebab-case, never a Windows reserved device name, at most 64 characters, and equal to the file's name without \`.md\`. It is the identity of Nodes held in a scope by this skill, and the scope alone owns it: the same id in another scope is another Node, and nothing here compares scopes. KAAL's other identities, such as an occurrence or a number, are not asked to take this form.

A Reference belongs to its referrer. It names a relation and a target, changes nothing about the target, and requires the target to know nothing about its referrers. A Node states the References it has when it is born, in \`references\`, each a \`relation\` and a \`target\`, and since a Node never changes it states no others later. A relation and a target are non-blank names. Neither is interpreted: relations that mean different things coexist, and a target need not be a Node here, held here or an id of this form, because it may name an identity this skill knows nothing of. A \`type\` is read the same way: a non-blank name, owed no format and no resolution. Nothing here knows what a type means or that any Node is the definition of one, so a using system that defines its own vocabulary as Nodes owns that closure. A reverse relationship is never written; it is derived by reading the referrers.

Birth with \`scripts/birth.ts <dir> <id> <type> <meaning> [--reference <relation>=<target>]...\`: it writes \`<dir>/<id>.md\`, refuses an unportable id, a blank type, a blank meaning, a Reference without a relation or a target, and an existing file, so a Node is never rewritten. Check with \`scripts/validate.ts <dir>\`: each \`*.md\` file directly in the directory must be a regular file with a valid \`id\` equal to its file name, a type, a meaning, and well-formed References; other files and subdirectories are left alone. A missing directory holds no Nodes. Read with \`scripts/read.ts <dir> [id]...\`: it prints each named Node with its meaning and References, or every id when none is named, and fails on an id that names no Node; \`scripts/read.ts <dir> --to <target>\` prints each referrer in the scope and the relation it states to that target. From code, \`readNodes\` and \`referrersOf\` in \`scripts/graph.ts\` return the same.

Checking reads the files as they are now and cannot prove a Node was never edited. This skill does not resolve targets, walk References, order Nodes, or know of any other scope. Which scopes there are, what relations mean, and how scopes are brought together belong to the using system.
`;

/** Generates this skill's SKILL.md at \`target\` (by default, next to this skill's scripts). */
export function init(target = SKILL): string {
  fs.writeFileSync(target, SKILL_MD);
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) init();
