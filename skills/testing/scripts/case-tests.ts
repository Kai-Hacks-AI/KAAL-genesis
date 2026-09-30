import fs from "node:fs";

/** One thing a Case tests: the `kind` of existing meaning, and its `id`. Testing knows neither what kinds exist nor whether an id names anything. */
export type Tests = { kind: string; id: string };

/** A Case, named by the caller (in KAAL, a posix path from the repository root), and what it tests, in the order it states it. */
export type CaseTests = { case: string; tests: Tests[] };

/** The marker of a reference, in a Case's header: `// @tests <kind> <id>`. */
const MARKER = /^\/\/[ \t]*@tests(?![^\s])/;

/** A reference is exactly a kind and an id: two tokens, each without whitespace. */
const REFERENCE = /^\/\/[ \t]*@tests[ \t]+(\S+)[ \t]+(\S+)[ \t]*$/;

/**
 * What the Case whose source is `text` tests. The Case states it in its
 * header, the lines before its first line of code: blank lines, a `#!` line
 * first of all, and `//` comment lines. Each header line `// @tests <kind> <id>`
 * is one reference. A reference is read from the source, never by executing the
 * Case, so it holds for every Case Testing runs. A `@tests` line after the
 * header is ordinary code or comment and states nothing. A Case that states
 * none tests nothing Testing knows of. `file` is only used to name errors.
 */
export function parseTests(text: string, file: string): { tests: Tests[]; errors: string[] } {
  const tests: Tests[] = [];
  const errors: string[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line || (index === 0 && line.startsWith("#!"))) continue;
    if (!line.startsWith("//")) break;
    if (!MARKER.test(line)) continue;
    const match = REFERENCE.exec(line);
    if (!match) {
      errors.push(`${file}:${index + 1}: a reference must be "// @tests <kind> <id>"`);
      continue;
    }
    const [, kind, id] = match;
    if (tests.some((t) => t.kind === kind && t.id === id))
      errors.push(`${file}:${index + 1}: tests ${kind} "${id}" twice`);
    else tests.push({ kind, id });
  }
  return { tests, errors };
}

/** What the Case at `file` tests, or why it cannot be read. Errors name it `name`, by default `file`. */
export function readCaseTests(file: string, name = file): { tests: Tests[]; errors: string[] } {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    return { tests: [], errors: [`${name}: unreadable case (${e instanceof Error ? e.message : String(e)})`] };
  }
  return parseTests(text, name);
}

/**
 * The Cases that test `id` of `kind`, in the order given, computed from what
 * the Cases themselves state. There is no other record of it, so it is never
 * stale, and a Case tests only what it names: nothing is inferred from what
 * the named meaning is related to.
 */
export function casesTesting(cases: CaseTests[], kind: string, id: string): string[] {
  return cases.filter((c) => c.tests.some((t) => t.kind === kind && t.id === id)).map((c) => c.case);
}
