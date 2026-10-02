import fs from "node:fs";
import path from "node:path";
import { beneath } from "../helpers/beneath.js";
import { isRegularFile, kind } from "../helpers/entry.js";
import { publish } from "../helpers/publish.js";
import { REGISTRATIONS, REGISTRATIONS_HEADER } from "./registrations.js";
import { wire, wired } from "./section.js";

/** Where Core puts KAAL in a host root unless told otherwise. */
export const KAAL_DIR = ".kaal";

/** The host's agent entry point, of which Core owns one section and no more. */
export const HOST_AGENTS = "AGENTS.md";

/**
 * The Definition file Core installs. The name is the Definition's own, as
 * #175 found: a Definition's file is `<name>.md`.
 */
export const KERNEL_FILE = "KAAL Kernel.md";

/**
 * KAAL Kernel, byte for byte as #175 found it sufficient. Its one authority is
 * the Definition file `graph/KAAL Kernel.md`, which KAAL's graph also reads as
 * a Node; Core reads that file and holds no second copy. It is the material
 * that lets an installed KAAL be read from where it stands: the directory
 * carries the meaning of the next Definition with it, so nothing beside it,
 * not even this repository, is needed to read it. Core holds it as text, not
 * as a parsed Node: Core only places it and recognizes it, never interprets
 * it. Equal bytes say "this is the Kernel this Core recognizes"; they do not
 * say a different Kernel, older or newer, is not KAAL.
 */
export const KERNEL = fs.readFileSync(new URL(`../graph/${KERNEL_FILE}`, import.meta.url), "utf8");

/**
 * The KAAL directory `kaal` names inside `root`, as a posix path relative to
 * it, so the host's AGENTS.md can point at it wherever the project is. It must
 * lie strictly inside the root.
 */
function locate(root: string, kaal: string): string {
  const relative = beneath(root, kaal);
  if (relative === undefined) throw new Error(`${kaal}: the KAAL directory must be a directory inside ${root}`);
  return relative;
}

/**
 * What stands at the KAAL directory: nothing; an installation of this Core's
 * Kernel; an installation of some other Kernel, which this Core does not
 * recognize but does not call not-KAAL; or something that is no installation.
 */
function inspect(kaalDir: string): { state: "absent" | "recognized" | "unrecognized" | "broken"; why?: string } {
  const found = kind(kaalDir);
  if (found === "missing") return { state: "absent" };
  if (found !== "directory") return { state: "broken", why: "it is not a directory" };
  const kernel = path.join(kaalDir, KERNEL_FILE);
  if (!isRegularFile(kernel) || !fs.readFileSync(kernel, "utf8").trim())
    return { state: "broken", why: "it holds no KAAL Kernel" };
  const registrations = path.join(kaalDir, ...REGISTRATIONS.split("/"));
  if (!isRegularFile(registrations) || !fs.readFileSync(registrations, "utf8").startsWith(REGISTRATIONS_HEADER))
    return { state: "broken", why: `it holds no ${REGISTRATIONS}` };
  return fs.readFileSync(kernel, "utf8") === KERNEL ? { state: "recognized" } : { state: "unrecognized" };
}

/** The host's AGENTS.md text, or undefined when there is none; refuses what is not a file. */
function hostAgents(root: string): string | undefined {
  const file = path.join(root, HOST_AGENTS);
  const found = kind(file);
  if (found === "missing") return undefined;
  if (found !== "file") throw new Error(`${file}: not a regular file; refusing to touch it`);
  return fs.readFileSync(file, "utf8");
}

/**
 * Whether KAAL is initialized in `root`: its KAAL directory (`.kaal` unless
 * named) holds a Kernel and the registrations file, and the root's AGENTS.md
 * has Core's section. Which Kernel it is does not matter here: that a Core
 * recognizes it is `init`'s concern, never this definition.
 */
export function initialized(root: string, kaal = KAAL_DIR): boolean {
  const { state } = inspect(path.join(root, ...locate(root, kaal).split("/")));
  return (state === "recognized" || state === "unrecognized") && wired(hostAgents(root));
}

/**
 * Initializes KAAL into the host `root`: births the KAAL directory (`.kaal`
 * unless `options.kaal` names another inside the root) and wires it into the
 * root's AGENTS.md, once.
 *
 * The directory holds the KAAL Kernel and `core/registrations.md`, where later
 * installs register what they install; no Skill or Extension is ever placed in
 * it. The root's AGENTS.md gets Core's own `# KAAL` section, created or added
 * to the end; everything outside that section is preserved byte for byte, and
 * a later install never needs to edit the file again.
 *
 * Everything is checked before anything is written, so a refusal changes
 * nothing. A KAAL directory is staged beside its place and published by one
 * rename, and AGENTS.md is replaced by one rename, so neither exists partly
 * written; a failure rolls back what this call made. Whatever already stands
 * at the KAAL directory is never overwritten: an installation this Core
 * recognizes, with its section in place, is left untouched; anything else is
 * refused. The root is never created, nor the KAAL directory's parent.
 */
export function init(root: string, options: { kaal?: string } = {}): { born: boolean; wired: boolean } {
  if (kind(root) !== "directory") throw new Error(`${root}: KAAL can only be initialized into an existing directory`);
  const kaal = locate(root, options.kaal ?? KAAL_DIR);
  const kaalDir = path.join(root, ...kaal.split("/"));
  const parent = path.dirname(kaalDir);
  if (kind(parent) !== "directory")
    throw new Error(`${parent}: the KAAL directory's parent must be an existing directory`);

  const found = inspect(kaalDir);
  if (found.state === "broken")
    throw new Error(`${kaalDir}: already exists and is not a KAAL installation (${found.why}); refusing to touch it`);
  if (found.state === "unrecognized")
    throw new Error(`${kaalDir}: holds a KAAL Kernel this Core does not recognize; refusing to touch it`);
  const host = hostAgents(root);
  const text = wire(host, kaal);

  const born = found.state === "absent";
  publish({
    directory: born
      ? {
          to: kaalDir,
          populate(staging) {
            fs.mkdirSync(path.join(staging, "core"));
            fs.writeFileSync(path.join(staging, KERNEL_FILE), KERNEL, { flag: "wx" });
            fs.writeFileSync(path.join(staging, ...REGISTRATIONS.split("/")), REGISTRATIONS_HEADER, { flag: "wx" });
          },
        }
      : undefined,
    file: text !== undefined ? { to: path.join(root, HOST_AGENTS), content: text } : undefined,
  });
  return { born, wired: text !== undefined };
}
