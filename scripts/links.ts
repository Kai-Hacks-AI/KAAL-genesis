import fs from "node:fs";
import path from "node:path";
import { portableNameError } from "../skills/using-brain/scripts/brain.js";
import type { Member } from "../skills/testing/scripts/suite.js";
import { planErrors } from "./plans.js";

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
/**
 * What a plan may say shows a commitment: its cases, found by their links, and
 * the seal checks besides. Only cases say in the files which commitment they
 * show, so every commitment is shown by its cases; another check may add to
 * them, and may stand in for them only once it can say the same.
 */
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
/** A line meant to say its case tests a defect, strictly written or not: any line comment that starts with "Tests". */
const TESTS_LIKE = /^\s*\/\/\s*tests\b/i;
const TESTS = /^\/\/ Tests: (\S+)$/;

/** A line meant to say its case belongs to a suite, strictly written or not: any line comment that starts with "Suite". */
const SUITE_LIKE = /^\s*\/\/\s*suite\b/i;
const SUITE = /^\/\/ Suite: (\S+)$/;
/** Where KAAL states its suites: one file each, `suites/<name>.md`, whose place is the suite's identity. */
export const SUITES = "suites";
const SUITE_PLACE = /^suites\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/** A case that says which defects it tests, through `// Tests: <defect>` lines among the links directly above it. */
export type Tested = { file: string; title: string; defects: string[] };

/**
 * The cases a test file states, each with the places of the commitments it
 * points at through `// Why:` lines directly above it, and every line that
 * looks like a link but belongs to no case. Only cases whose title is a
 * plain string literal are found.
 */
function scan(
  file: string,
  source: string,
): {
  cases: Case[];
  stray: number[];
  tested: Tested[];
  strayTests: number[];
  suites: string[][];
  straySuites: number[];
} {
  const cases: Case[] = [];
  const tested: Tested[] = [];
  const suites: string[][] = [];
  const owned = new Set<number>();
  const ownedTests = new Set<number>();
  const ownedSuites = new Set<number>();
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
    const defects: string[] = [];
    const joined: string[] = [];
    let line = text.slice(0, m.index).split("\n").length - 2;
    for (; line >= 0; line--) {
      const why = LINK.exec(lines[line]!);
      const tests = TESTS.exec(lines[line]!);
      const suite = SUITE.exec(lines[line]!);
      if (why) {
        places.unshift(why[1]!);
        owned.add(line);
      } else if (tests) {
        defects.unshift(tests[1]!);
        ownedTests.add(line);
      } else if (suite) {
        joined.unshift(suite[1]!);
        ownedSuites.add(line);
      } else break;
    }
    cases.push({ file, title, places });
    suites.push(joined);
    if (defects.length) tested.push({ file, title, defects });
  }
  const stray = lines.flatMap((line, i) => (LINK_LIKE.test(line) && !owned.has(i) ? [i + 1] : []));
  const strayTests = lines.flatMap((line, i) => (TESTS_LIKE.test(line) && !ownedTests.has(i) ? [i + 1] : []));
  const straySuites = lines.flatMap((line, i) => (SUITE_LIKE.test(line) && !ownedSuites.has(i) ? [i + 1] : []));
  return { cases, stray, tested, strayTests, suites, straySuites };
}

/** The cases a test file states, each with the places it points at. */
export function fileCases(file: string, source: string): Case[] {
  return scan(file, source).cases;
}

/**
 * The cases a repository runs that say which defects they test, read as every
 * other link of a case is read, so a `Tests:` line belongs to the very case
 * the trusted regression finds, runs and holds to running; and, as
 * `file:line`, every line that looks like one but belongs to no case.
 */
export function testedDefects(repo: string): { tested: Tested[]; stray: string[] } {
  const scans = caseFiles(repo).map((file) => ({
    file,
    ...scan(file, fs.readFileSync(path.join(repo, file), "utf8")),
  }));
  return {
    tested: scans.flatMap((s) => s.tested),
    stray: scans.flatMap((s) => s.strayTests.map((at) => `${s.file}:${at}`)),
  };
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

/** Whether a case file is a skill's: its cases prove the skill's SKILL.md, and point at nothing of KAAL's. */
export const ownedBySkill = (file: string) => file.startsWith("skills/");

/** Every case a repository keeps, with the commitments it helps prove: a skill's cases prove its SKILL.md. */
export function repoCases(repo: string): Case[] {
  return caseFiles(repo).flatMap((file) => {
    const cases = fileCases(file, fs.readFileSync(path.join(repo, file), "utf8"));
    return ownedBySkill(file) ? cases.map((c) => ({ ...c, places: [SKILL_CASES] })) : cases;
  });
}

/**
 * Every case a repository runs, in the order its cases are read, with the
 * suites it says it belongs to through `// Suite: <place>` lines among the
 * links directly above it, read as every other link of a case is read. A suite
 * never lists its cases, so this is how KAAL finds a suite's cases.
 */
export function caseSuites(repo: string): Member[] {
  return caseFiles(repo).flatMap((file) => {
    const { cases, suites } = scan(file, fs.readFileSync(path.join(repo, file), "utf8"));
    return cases.map(({ title }, i) => ({ file, title, suites: suites[i]! }));
  });
}

/**
 * Why `place` is not a suite `repo` states, if it is not: KAAL states each of
 * its suites in a file of its own, `suites/<name>.md`, named in lowercase
 * words joined by hyphens, as every system it runs on can keep it, which must
 * really be a file there, not a link.
 */
export function suiteError(repo: string, place: string): string | undefined {
  if (!SUITE_PLACE.test(place)) return `${place}: not a suite's place, which is ${SUITES}/<name>.md`;
  const portable = portableNameError(path.posix.basename(place, ".md"), "a suite's name");
  if (portable) return `${place}: ${portable}`;
  const file = path.join(repo, place);
  const real = fs.existsSync(file) ? path.relative(fs.realpathSync(repo), fs.realpathSync(file)) : undefined;
  if (real === undefined || !fs.statSync(file).isFile()) return `${place}: no suite is stated there`;
  if (real.split(path.sep).join("/") !== place) return `${place}: a suite stated through a link`;
  return undefined;
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
    // Only cases say, in the files, which commitments they show; another check can add to them, not stand in for them.
    if (shownBy && !shownBy.includes("its cases"))
      errors.push(
        `${place}: the plan says only ${shownBy.join(" and ")} show it, but only cases say which commitment they show`,
      );
  }
  const stated = new Set(entries.flatMap((e) => (e.place ? [e.place] : [])));
  for (const file of caseFiles(repo)) {
    const { cases, stray, suites, straySuites } = scan(file, fs.readFileSync(path.join(repo, file), "utf8"));
    if (ownedBySkill(file)) {
      // A skill's cases prove its SKILL.md by where they are kept; a link from one would make the skill depend on KAAL,
      // and so would joining one of KAAL's suites.
      const links = cases.flatMap((c, i) => (c.places.length || suites[i]!.length ? [`"${c.title}"`] : []));
      errors.push(...links.map((c) => `${file}: ${c} is a skill's case, so it points at nothing outside its skill`));
      errors.push(
        ...[...stray, ...straySuites]
          .sort((a, b) => a - b)
          .map((at) => `${file}:${at}: a skill's case points at nothing outside its skill`),
      );
      continue;
    }
    errors.push(...stray.map((at) => `${file}:${at}: a link that belongs to no case, written as "// Why: <place>"`));
    errors.push(
      ...straySuites.map((at) => `${file}:${at}: a suite line that belongs to no case, written as "// Suite: <place>"`),
    );
    cases.forEach((c, i) => {
      for (const suite of suites[i]!) {
        const wrong = suiteError(repo, suite);
        if (wrong) errors.push(`${file}: "${c.title}" belongs to ${wrong}`);
      }
    });
    for (const c of cases) {
      if (!c.places.length) errors.push(`${file}: "${c.title}" says no commitment it helps prove`);
      for (const place of c.places.filter((p) => !stated.has(p)))
        errors.push(`${file}: "${c.title}" points at ${place}, which the plan does not state`);
    }
  }
  errors.push(...unnamedCases(repo).map((at) => `${at}: a case whose title cannot be read, so no link can follow it`));
  // Every suite is stated in its own place. One no case belongs to yet is still that suite: its concern gives it its
  // meaning, not its cases, and a run of it observes nothing, which is no evidence.
  const suiteFiles = fs.existsSync(path.join(repo, SUITES))
    ? fs.readdirSync(path.join(repo, SUITES)).map((name) => `${SUITES}/${name}`)
    : [];
  for (const suite of suiteFiles.sort()) {
    const wrong = suiteError(repo, suite);
    if (wrong) errors.push(wrong);
  }
  // Plans, and the suites that say they serve them, are read as KAAL reads its plans.
  errors.push(...planErrors(repo));
  const proven = new Set(repoCases(repo).flatMap((c) => c.places));
  // A skill's cases prove its own SKILL.md, so a place naming each skill's is shown only if every skill has one.
  const ownProof = new Set(
    repoCases(repo)
      .filter((c) => ownedBySkill(c.file))
      .map((c) => c.file.split("/").slice(0, 2).join("/")),
  );
  for (const { place, shownBy } of entries) {
    if (!place || unplaced.has(place) || !shownBy?.includes("its cases")) continue;
    if (!proven.has(place)) errors.push(`${place}: the plan says its cases show it, but no case points at it`);
    else if (place === SKILL_CASES)
      for (const skill of fs
        .globSync(place, { cwd: repo })
        .map((f) => f.split(path.sep).slice(0, 2).join("/"))
        .sort())
        if (!ownProof.has(skill))
          errors.push(`${skill}/SKILL.md: the plan says its cases show it, but the skill has none`);
  }
  return errors;
}
