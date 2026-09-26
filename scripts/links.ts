import fs from "node:fs";
import path from "node:path";

/**
 * KAAL's testing links, read from the repository's files alone: which
 * commitments a plan states and where, which cases a checkout keeps, and
 * which commitments each case says it helps prove. A case owns its link, a
 * `// Why: <place>` line directly above it; a commitment never lists its
 * cases. Nothing here runs a case or asks anything of Git or GitHub: what
 * runs these checks, and what accepts a change because of them, acts on
 * these files and does not define them.
 */

export const PLAN = "test/regression-plan.md";
/** Where each skill's cases are kept; they prove its SKILL.md, commitment 7's place. */
export const SKILL_CASES = "skills/*/SKILL.md";
/** What a plan may say shows a commitment: its cases, found by their links, or the seal checks. */
const SHOWN_BY = ["its cases", "the seal checks"];

/** The section of a plan under `heading`, up to the next `## ` heading. */
export function section(plan: string, heading: string): string {
  const start = plan.indexOf(`\n## ${heading}`);
  if (start < 0) return "";
  const rest = plan.slice(start + 1);
  const end = rest.indexOf("\n## ", 1);
  return end < 0 ? rest : rest.slice(0, end);
}

/** The place each commitment of a plan is stated in, in the plan's order. */
export function planCommitments(plan: string): string[] {
  return [...section(plan, "Commitments").matchAll(/^\d+\. .*?[Ss]tated in (?:each )?`([^`]+)`/gm)].map((m) => m[1]!);
}

export type Commitment = { place?: string; shownBy?: string[]; line: string };

/** Each commitment a plan states: where, and what its entry says shows it, if it says. */
export function planEntries(plan: string): Commitment[] {
  return [...section(plan, "Commitments").matchAll(/^\d+\. .*$/gm)].map(([line]) => ({
    line,
    place: /[Ss]tated in (?:each )?`([^`]+)`/.exec(line)?.[1],
    shownBy: /Shown by ([^.]+)\.\s*$/.exec(line)?.[1]!.split(/, | and /),
  }));
}

export type Case = { file: string; title: string; places: string[] };

/** A line meant as a link, strictly written or not: any line comment that starts with "Why". */
const LINK_LIKE = /^\s*\/\/\s*why\b/i;
const LINK = /^\/\/ Why: (\S+)$/;

/**
 * The cases a test file states, each with the places of the commitments it
 * points at through `// Why:` lines directly above it, and every line that
 * looks like a link but belongs to no case. Only cases whose title is a
 * plain string literal are found.
 */
function scan(file: string, source: string): { cases: Case[]; stray: number[] } {
  const cases: Case[] = [];
  const owned = new Set<number>();
  const lines = source.split(/\r?\n/);
  const text = lines.join("\n");
  for (const m of text.matchAll(/^test\(\s*"((?:[^"\\]|\\.)*)"/gm)) {
    let title: string;
    try {
      title = JSON.parse(`"${m[1]}"`) as string;
    } catch {
      continue; // an escape JSON does not know: a title that cannot be read, like one built at run time
    }
    const places: string[] = [];
    let line = text.slice(0, m.index).split("\n").length - 2;
    for (; line >= 0; line--) {
      const why = LINK.exec(lines[line]!);
      if (!why) break;
      places.unshift(why[1]!);
      owned.add(line);
    }
    cases.push({ file, title, places });
  }
  const stray = lines.flatMap((line, i) => (LINK_LIKE.test(line) && !owned.has(i) ? [i + 1] : []));
  return { cases, stray };
}

/** The cases a test file states, each with the places it points at. */
export function fileCases(file: string, source: string): Case[] {
  return scan(file, source).cases;
}

/** The arguments of a repository's own `npm test` script, unquoted. */
export function testArgs(repo: string): string[] {
  const script = (
    JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")) as { scripts?: { test?: string } }
  ).scripts?.test;
  return (script?.split(/\s+/) ?? []).filter(Boolean).map((arg) => arg.replace(/^(["'])(.*)\1$/, "$2"));
}

/**
 * The case files a repository's own `npm test` runs, by posix path relative to
 * it. KAAL names every case file `*.test.ts`, so only such arguments count:
 * anything else the script names, such as a module it preloads, is not a case.
 */
export function caseFiles(repo: string): string[] {
  const globs = testArgs(repo).filter((arg) => arg.endsWith(".test.ts"));
  return [...new Set(globs.flatMap((glob) => fs.globSync(glob, { cwd: repo })))]
    .map((file) => file.split(path.sep).join("/"))
    .sort();
}

const ownedBySkill = (file: string) => file.startsWith("skills/");

/** Every case a repository keeps, with the commitments it helps prove: a skill's cases prove its SKILL.md. */
export function repoCases(repo: string): Case[] {
  return caseFiles(repo).flatMap((file) => {
    const cases = fileCases(file, fs.readFileSync(path.join(repo, file), "utf8"));
    return ownedBySkill(file) ? cases.map((c) => ({ ...c, places: [SKILL_CASES] })) : cases;
  });
}

/**
 * Every case a repository runs whose title cannot be read, so a later run
 * could not tell that it went missing: a case not at the top of its file, or
 * whose title is not a plain double-quoted string, as `file:line`.
 */
export function unnamedCases(repo: string): string[] {
  return caseFiles(repo).flatMap((file) => {
    const text = fs.readFileSync(path.join(repo, file), "utf8").replace(/\r\n/g, "\n");
    return [...text.matchAll(/^([ \t]*)test\(\s*/gm)].flatMap((m) => {
      const literal = /^"((?:[^"\\]|\\.)*)"/.exec(text.slice(m.index + m[0].length));
      let readable = !m[1] && !!literal;
      try {
        if (literal) JSON.parse(`"${literal[1]}"`);
      } catch {
        readable = false;
      }
      return readable ? [] : [`${file}:${text.slice(0, m.index).split("\n").length}`];
    });
  });
}

/**
 * Why `place` is not where a commitment of `repo` can be stated, if it is not:
 * a place is inside the repository and must exist there. Only plain path
 * segments are accepted, with * the one wildcard (as in each skill's
 * SKILL.md), and every file it names must really be a file inside the
 * repository, not a link out of it.
 */
export function placeError(repo: string, place: string): string | undefined {
  const root = fs.realpathSync(repo);
  const inside = (file: string) => {
    try {
      const real = fs.realpathSync(path.join(repo, file));
      return real.startsWith(root + path.sep) && fs.statSync(real).isFile();
    } catch {
      return false; // A link to nothing states nothing.
    }
  };
  const plain = /^[\w*-][\w.*-]*(\/[\w*-][\w.*-]*)*$/.test(place) && !place.split("/").includes("..");
  const files = plain ? fs.globSync(place, { cwd: repo }) : [];
  if (!plain || !files.every(inside)) return `${place}: the plan names it, but it is not a place inside the repository`;
  if (!files.length) return `${place}: the plan names it, but nothing is stated there`;
  return undefined;
}

/**
 * Everything that makes a checkout's testing links incoherent, read from its
 * files alone. Every commitment its plan states is at a place that exists and
 * says what shows it; a commitment its cases show has at least one case
 * pointing at it. Every case KAAL keeps outside its skills points at least at
 * one commitment, and only at places the plan states. A skill's cases prove
 * its own SKILL.md and never point at KAAL. A link that belongs to no case,
 * or a case whose title cannot be read, would be lost without a trace when
 * the case changes or moves, so both are refused too.
 */
export function linkErrors(repo: string): string[] {
  if (!fs.existsSync(path.join(repo, PLAN))) return [`${PLAN}: there is no plan, so no link can be read`];
  const entries = planEntries(fs.readFileSync(path.join(repo, PLAN), "utf8"));
  const errors: string[] = [];
  const unplaced = new Set<string>();
  for (const { line, place, shownBy } of entries) {
    if (!place) {
      errors.push(`${PLAN}: "${line}" does not say where it is stated`);
      continue;
    }
    const wrong = placeError(repo, place);
    if (wrong) {
      errors.push(wrong);
      unplaced.add(place);
    }
    if (!shownBy) errors.push(`${place}: the plan does not say what shows it`);
    for (const by of (shownBy ?? []).filter((by) => !SHOWN_BY.includes(by)))
      errors.push(`${place}: the plan says ${by} show it, which is not a check KAAL knows`);
  }
  const stated = new Set(entries.flatMap((e) => (e.place ? [e.place] : [])));
  for (const file of caseFiles(repo)) {
    const { cases, stray } = scan(file, fs.readFileSync(path.join(repo, file), "utf8"));
    if (ownedBySkill(file)) {
      // A skill's cases prove its SKILL.md by where they are kept; a link from one would make the skill depend on KAAL.
      const links = cases.flatMap((c) => (c.places.length ? [`"${c.title}"`] : []));
      errors.push(...links.map((c) => `${file}: ${c} is a skill's case, so it points at nothing outside its skill`));
      errors.push(...stray.map((at) => `${file}:${at}: a skill's case points at nothing outside its skill`));
      continue;
    }
    errors.push(...stray.map((at) => `${file}:${at}: a link that belongs to no case, written as "// Why: <place>"`));
    for (const c of cases) {
      if (!c.places.length) errors.push(`${file}: "${c.title}" says no commitment it helps prove`);
      for (const place of c.places.filter((p) => !stated.has(p)))
        errors.push(`${file}: "${c.title}" points at ${place}, which the plan does not state`);
    }
  }
  errors.push(...unnamedCases(repo).map((at) => `${at}: a case whose title cannot be read, so no link can follow it`));
  const proven = new Set(repoCases(repo).flatMap((c) => c.places));
  for (const { place, shownBy } of entries)
    if (place && !unplaced.has(place) && shownBy?.includes("its cases") && !proven.has(place))
      errors.push(`${place}: the plan says its cases show it, but no case points at it`);
  return errors;
}
