import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kind as entry } from "../helpers/entry.js";

/** Where, inside the KAAL directory, Core keeps what this installation has registered. */
export const REGISTRATIONS = "core/registrations.md";

/** What a capability is: the two kinds Core composes. */
export type Kind = "skill" | "extension";

/** A capability KAAL can compose. Where it is installed is not part of it. */
export type Capability = { kind: Kind; name: string };

/** A capability this KAAL has registered, and where it is installed, relative to the host root. */
export type Registration = Capability & { location: string };

/** The catalogue file: Core's own list of what this KAAL distribution makes available. */
const CATALOGUE = fileURLToPath(new URL("./catalogue.md", import.meta.url));

/**
 * What this KAAL distribution makes available to install, read from Core's
 * catalogue file: nothing is scanned or inferred, and a capability carries
 * only its kind and name. Availability is not registration, and neither is
 * installation: reading the catalogue puts nothing on disk. A line that
 * claims to be an entry but is not one, or one that repeats an entry, is an
 * error rather than a guess.
 */
export function available(file = CATALOGUE): Capability[] {
  const entries: Capability[] = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.startsWith("- ")) continue;
    const m = /^- (skill|extension) ([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line);
    if (!m) throw new Error(`${file}: not a catalogue entry: ${line}`);
    if (entries.some((e) => e.kind === m[1] && e.name === m[2])) throw new Error(`${file}: listed twice: ${line}`);
    entries.push({ kind: m[1] as Kind, name: m[2] });
  }
  return entries;
}

/** The registrations file as born: it holds no registration, only what it is. */
export const REGISTRATIONS_HEADER = `# KAAL registrations

Skills and Extensions registered with this KAAL, one per line as \`- <kind> <name>: <location>\`. A location is where the capability is installed, relative to the project root. A registration points to a capability and never holds it.
`;

const LINE = /^- (skill|extension) (\S+): (.+)$/;

/** The registrations in the KAAL directory `kaalDir`, in the order registered. */
export function registered(kaalDir: string): Registration[] {
  const text = fs.readFileSync(path.join(kaalDir, ...REGISTRATIONS.split("/")), "utf8");
  return text.split(/\r?\n/).flatMap((line) => {
    const m = LINE.exec(line);
    return m ? [{ kind: m[1] as Kind, name: m[2], location: m[3] }] : [];
  });
}

/**
 * Registers an installed capability with the KAAL at `kaal` (posix, relative
 * to `root`). It must already be installed: `location` is an existing
 * directory in `root`, outside the KAAL directory, because capabilities live
 * where their own standard puts them, never inside `.kaal`. Registering the
 * same thing again changes nothing; the same name somewhere else is refused.
 * The host's AGENTS.md is never touched. Returns whether anything was added.
 */
export function register(root: string, kaal: string, capability: Registration): boolean {
  const { kind, name, location } = capability;
  if (kind !== "skill" && kind !== "extension") throw new Error(`${kind}: a capability is a skill or an extension`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new Error(`${name}: not a capability name`);
  const where = path.posix.normalize(location).replace(/(.)\/$/, "$1");
  if (
    where.startsWith("../") ||
    where === ".." ||
    where === "." ||
    path.posix.isAbsolute(where) ||
    path.isAbsolute(where)
  )
    throw new Error(`${location}: a capability must be installed in a directory inside ${root}`);
  if (where === kaal || where.startsWith(`${kaal}/`))
    throw new Error(`${location}: a capability is installed where its standard puts it, never inside ${kaal}`);
  if (entry(path.join(root, ...where.split("/"))) !== "directory")
    throw new Error(`${location}: nothing is installed there, so there is nothing to register`);
  const kaalDir = path.join(root, ...kaal.split("/"));
  const file = path.join(kaalDir, ...REGISTRATIONS.split("/"));
  if (entry(file) !== "file") throw new Error(`${kaalDir}: KAAL is not initialized here`);
  const same = registered(kaalDir).find((r) => r.kind === kind && r.name === name);
  if (same) {
    if (same.location === where) return false;
    throw new Error(`${kind} ${name}: already registered at ${same.location}; refusing to point it at ${where}`);
  }
  const text = fs.readFileSync(file, "utf8");
  fs.appendFileSync(file, `${text.endsWith("\n") ? "" : "\n"}- ${kind} ${name}: ${where}\n`);
  return true;
}

/**
 * What can be installed and what is registered, kept apart: each available
 * capability says whether this KAAL has registered it, and what is registered
 * is listed whether or not the distribution still makes it available.
 */
export function capabilities(
  kaalDir: string,
  list: readonly Capability[] = available(),
): { available: (Capability & { registered: boolean })[]; registered: Registration[] } {
  const have = registered(kaalDir);
  return {
    available: list.map((a) => ({ ...a, registered: have.some((r) => r.kind === a.kind && r.name === a.name) })),
    registered: have,
  };
}
