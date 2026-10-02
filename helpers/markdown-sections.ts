/**
 * Top-level sections of a Markdown document: a section runs from its
 * `# ` heading line to the next `# ` heading line, or the end of the text.
 * Lines inside code fences are never headings. Line endings are kept as they
 * are, so what is outside a section is carried through byte for byte.
 */

/** The lines of `text`, each with its own line ending. */
function lines(text: string): string[] {
  return text.split(/(?<=\n)/);
}

/** The first section headed `heading` as [start, end) line indices, outside code fences. */
function find(all: string[], heading: string): [number, number] | undefined {
  if (!/^# /.test(heading)) throw new Error(`${heading}: a top-level heading starts with "# "`);
  let fenced = false;
  let start = -1;
  for (const [i, line] of all.entries()) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    if (start < 0 && line.trimEnd() === heading) start = i;
    else if (start >= 0 && /^# /.test(line)) return [start, i];
  }
  return start < 0 ? undefined : [start, all.length];
}

/** The first section of `text` headed `heading`, as written, or undefined when there is none. */
export function sectionOf(text: string, heading: string): string | undefined {
  const all = lines(text);
  const found = find(all, heading);
  return found && all.slice(...found).join("");
}

/**
 * `text` with `section` (written with `\n`) added at its end, after one blank
 * line, in the line ending `text` uses; `\r\n` if it holds any, else `\n`.
 * Everything already in `text` is kept byte for byte.
 */
export function appendSection(text: string, section: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const gap = text.endsWith("\n") ? eol : eol + eol;
  return text + gap + section.replace(/\n/g, eol);
}
