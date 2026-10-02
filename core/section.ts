import { appendSection, sectionOf } from "../helpers/markdown-sections.js";

/** The heading of the one section of a host's AGENTS.md that Core owns. */
const HEADING = "# KAAL";

/**
 * Core's section of the host root's AGENTS.md: one stable entry point into
 * the KAAL directory `kaal` (posix, relative to the root). It names the
 * registrations file and nothing a later install changes, so installing
 * or removing a capability never edits the host's AGENTS.md again.
 */
export function section(kaal: string): string {
  return `${HEADING}\n\nThis project uses KAAL, installed in \`${kaal}\`. Read \`${kaal}/core/registrations.md\` to find the Skills and Extensions KAAL has registered here.\n`;
}

/**
 * The host's AGENTS.md as it must be once KAAL is wired in at `kaal`, or
 * undefined when it already is. Content outside Core's section is carried
 * through byte for byte; a missing section is added at the end, in the file's
 * own line ending. A Core section that says anything else is not Core's to
 * replace silently, so it is refused.
 */
export function wire(existing: string | undefined, kaal: string): string | undefined {
  const wanted = section(kaal);
  if (!existing?.trim()) return wanted;
  const found = sectionOf(existing, HEADING);
  if (found === undefined) return appendSection(existing, wanted);
  if (found.replace(/\r\n/g, "\n").trimEnd() === wanted.trimEnd()) return undefined;
  throw new Error(
    `AGENTS.md: already has a "${HEADING}" section that is not the one Core writes for ${kaal}; refusing to replace it`,
  );
}

/** Whether the host's AGENTS.md has a Core section, whatever it says. */
export function wired(text: string | undefined): boolean {
  return text !== undefined && sectionOf(text, HEADING) !== undefined;
}
