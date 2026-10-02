import fs from "node:fs";
import path from "node:path";

/** Where, inside the KAAL directory, Core keeps what this installation has registered. */
export const REGISTRATIONS = "core/registrations.md";

/** What a capability is: the two kinds Core composes. */
export type Kind = "skill" | "extension";

/** A capability KAAL can compose. Where it is installed is not part of it. */
export type Capability = { kind: Kind; name: string };

/** A capability this KAAL has registered, and where it is installed, relative to the host root. */
export type Registration = Capability & { location: string };

/**
 * What this KAAL distribution makes available to install. Availability is not
 * registration, and neither is installation: knowing a capability here puts
 * nothing on disk. The distribution owns this list; none is claimed yet.
 */
export const AVAILABLE: readonly Capability[] = [];

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
  const installed = fs.lstatSync(path.join(root, ...where.split("/")), { throwIfNoEntry: false });
  if (!installed?.isDirectory())
    throw new Error(`${location}: nothing is installed there, so there is nothing to register`);
  const kaalDir = path.join(root, ...kaal.split("/"));
  const file = path.join(kaalDir, ...REGISTRATIONS.split("/"));
  if (!fs.lstatSync(file, { throwIfNoEntry: false })?.isFile())
    throw new Error(`${kaalDir}: KAAL is not initialized here`);
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
  available: readonly Capability[] = AVAILABLE,
): { available: (Capability & { registered: boolean })[]; registered: Registration[] } {
  const have = registered(kaalDir);
  return {
    available: available.map((a) => ({ ...a, registered: have.some((r) => r.kind === a.kind && r.name === a.name) })),
    registered: have,
  };
}
