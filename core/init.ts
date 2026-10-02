import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** The installation boundary: the one path Core claims inside a directory. */
export const KAAL_DIR = ".kaal";

/**
 * The one file Core installs. The name is the Definition's own, as #175 found:
 * a Definition's file is `<name>.md`.
 */
export const KERNEL_FILE = "KAAL Kernel.md";

/**
 * KAAL Kernel, byte for byte as #175 found it sufficient. It is the only
 * material that lets an installed KAAL be read from where it stands: the
 * directory carries the meaning of the next Definition with it, so nothing
 * beside it, not even this repository, is needed to read it. Core holds it as
 * text, not as a parsed Node: Core only places it and recognizes it, never
 * interprets it, so interpretation stays with whatever reads Definitions.
 */
export const KERNEL = `---
name: KAAL Kernel
type: Definition
---

A Definition is a Markdown file that defines a thing. Its YAML frontmatter has a \`name\`, which identifies the Definition among those beside it and is the file's name before \`.md\`, and a \`type\`, which says what kind of thing the file is. A file of type \`Definition\` defines, in its Markdown body, the thing its \`name\` names.

KAAL Kernel is of type \`Definition\`: this body defines Definition itself, which is how every Definition after it is read.
`;

/**
 * Whether KAAL is initialized in `directory`: `.kaal` is a real directory
 * holding a real file of the KAAL Kernel, exactly. Anything else Core did not
 * install beside it does not matter to that, and nothing is repaired.
 */
export function initialized(directory: string): boolean {
  return problem(directory) === undefined;
}

/** Why `.kaal` in `directory` is not an initialized KAAL, or undefined when it is. */
function problem(directory: string): string | undefined {
  const kaal = path.join(directory, KAAL_DIR);
  const stat = fs.lstatSync(kaal, { throwIfNoEntry: false });
  if (!stat) return `${kaal} does not exist`;
  if (!stat.isDirectory()) return `${kaal} is not a directory`;
  const kernel = path.join(kaal, KERNEL_FILE);
  const file = fs.lstatSync(kernel, { throwIfNoEntry: false });
  if (!file?.isFile()) return `${kernel} is not a file`;
  if (fs.readFileSync(kernel, "utf8") !== KERNEL) return `${kernel} is not the KAAL Kernel`;
  return undefined;
}

/**
 * Initializes KAAL into `directory`: births `<directory>/.kaal/` holding the
 * KAAL Kernel and nothing else. `.kaal` is staged beside its place and
 * published by one rename, so it never exists partly born, and a failure
 * leaves `directory` as it was. A directory that already holds an initialized
 * KAAL is left untouched. Anything else at `.kaal` is refused and left
 * untouched: Core never overwrites an installation or material it does not
 * know. Nothing outside `.kaal` is written, and `directory` is never created.
 */
export function init(directory: string): { born: boolean } {
  const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) throw new Error(`${directory}: KAAL can only be initialized into an existing directory`);
  const kaal = path.join(directory, KAAL_DIR);
  if (fs.lstatSync(kaal, { throwIfNoEntry: false })) {
    const why = problem(directory);
    if (why)
      throw new Error(`${kaal}: already exists and is not the KAAL Core installs (${why}); refusing to touch it`);
    return { born: false };
  }
  const staged = path.join(directory, `${KAAL_DIR}.${randomUUID()}.tmp`);
  try {
    fs.mkdirSync(staged);
    fs.writeFileSync(path.join(staged, KERNEL_FILE), KERNEL, { flag: "wx" });
    fs.renameSync(staged, kaal);
  } catch (e) {
    fs.rmSync(staged, { recursive: true, force: true });
    throw e;
  }
  return { born: true };
}
