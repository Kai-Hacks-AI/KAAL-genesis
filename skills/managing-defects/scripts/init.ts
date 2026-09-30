import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = fileURLToPath(new URL("../SKILL.md", import.meta.url));

/** This skill's SKILL.md. The skill is born from init: SKILL.md is generated from here, never edited by hand. */
export const SKILL_MD = `---
name: managing-defects
description: Create, read and validate Defects, durable Markdown observations that something intended to hold was observed not to hold, each with a portable id other material can reference.
---

# Managing Defects

A Defect is an immutable observation: something intended to hold was observed not to hold. It is a Markdown file. Its YAML frontmatter holds the two facts this skill owns, its \`id\` and \`holds\`, what was intended to hold; the body is what was observed, kept exactly as written: only the blank lines before it and the whitespace after it are framing, so the indentation of its first line is content. Other frontmatter may sit beside them: this skill does not read it, gives it no meaning and does not refuse it, so whatever owns it may interpret it. Defects live as files directly in a directory the caller supplies, \`<dir>/<id>.md\`; the \`*.md\` files directly in it are the Defects, and nothing else in or near it is this skill's:

\`\`\`
---
id: check-leaves-directory
holds: The check leaves nothing behind.
---

A second run of the check left a directory in the temporary directory.
\`\`\`

A Defect is only the observation. It records no state, such as open, fixed or blocking, no cause and no repair, and names nothing that tests, repairs or refers to it. What a Defect means for some work, whether that work must wait for it or may leave it be, is decided by that work, which refers to the Defect and never changes it. What was observed stays observed.

The \`id\` is the Defect's identity. It is portable: lowercase kebab-case (\`a-z\`, \`0-9\`, single hyphens), never a Windows reserved device name such as \`con\` or \`nul\`, at most 64 characters so that \`<id>.md\` is always a portable file name, and equal to the file's name without \`.md\`. It derives from no version control, hosting or location: moving the file, or the directory, or the repository, changes neither identity nor observation. An id is never reused for a different observation. A later observation of the same failure is a new Defect with a new id; this skill keeps no relation between them.

Other material references a Defect by its \`id\`: the reference belongs to the referrer, which may name any number of Defects, and any number of referrers may name the same one. A Defect never names what refers to it.

Create with \`scripts/create.ts <dir> <id> <holds> <observation>\`: it writes \`<dir>/<id>.md\`, refuses an unportable id, a blank \`holds\`, a blank observation and an existing file, so a Defect is never rewritten. Validate with \`scripts/validate.ts <dir>...\`: each \`*.md\` file directly in a directory must be a regular file with a valid \`id\` equal to its file name, a non-blank \`holds\` and a non-blank observation, and an id is defined once across all the directories given; other files and subdirectories are left alone. A missing directory holds no Defects. Read with \`scripts/read.ts --root <dir>... [id]...\`: it prints each id with what was intended to hold and what was observed, prints every id when none is named, and fails on an id that names no Defect. From code, \`readDefects\` and \`resolve\` in \`scripts/defects.ts\` return the same.

Validation reads the files as they are now and cannot prove a Defect was never edited. The skill knows where neither the directories nor the referrers are. Why Defects are kept, where they live, and what refers to them belong to the using system.
`;

/** Generates this skill's SKILL.md at \`target\` (by default, next to this skill's scripts). */
export function init(target = SKILL): string {
  fs.writeFileSync(target, SKILL_MD);
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) init();
