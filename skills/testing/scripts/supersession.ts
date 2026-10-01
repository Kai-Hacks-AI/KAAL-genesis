import { testCaseId, type TestCase } from "./test-cases.js";

/**
 * How one Test Case's HOW supersedes another's without the earlier Test Case
 * changing. A Test Case may declare that it `supersedes` an earlier one, and
 * the declaration belongs to the newer alone: the earlier names nothing and is
 * never touched, and both stay what they were written. Supersession does not
 * delete, invalidate or unrun the earlier Test Case. It only says that, among
 * the Test Cases being considered, the newer is the current continuation of
 * its HOW. Everything here is computed from the Test Cases given, never from
 * dates, history, ordering or where they live, and nothing is stored, so
 * nothing can be stale.
 *
 * A superseding Test Case must keep testing what its predecessor declared it
 * tested, so one HOW replaces another for the same meaning, and a Test Case is
 * superseded immediately by at most one, so the current HOW is never
 * ambiguous. Testing reads declared meaning only: it never judges whether two
 * Test Cases prove the same thing.
 */

/** The Test Case that immediately supersedes each superseded one, by identity, and everything that makes the lineage refused. */
export function readSupersession(cases: TestCase[]): { superseder: Map<string, string>; errors: string[] } {
  const known = new Map(cases.map((c) => [testCaseId(c), c]));
  const superseder = new Map<string, string>();
  const errors: string[] = [];
  for (const c of cases) {
    if (!c.supersedes) continue;
    const id = testCaseId(c);
    const earlier = testCaseId(c.supersedes);
    const who = `${c.carrier}: "${c.name}"`;
    const before = known.get(earlier);
    if (earlier === id) errors.push(`${who} supersedes itself`);
    else if (!before) errors.push(`${who} supersedes ${earlier}, which names no Test Case`);
    else if (superseder.has(earlier))
      errors.push(
        `${who} supersedes ${earlier}, which another Test Case already supersedes: its current HOW would be ambiguous`,
      );
    else {
      superseder.set(earlier, id);
      for (const { kind, id: what } of before.tests)
        if (!c.tests.some((t) => t.kind === kind && t.id === what))
          errors.push(`${who} supersedes ${earlier} but does not test ${kind} "${what}", which it tested`);
    }
  }
  for (const start of superseder.keys()) {
    const seen = new Set([start]);
    for (let at = superseder.get(start); at !== undefined; at = superseder.get(at)) {
      if (seen.has(at)) {
        errors.push(`Test Cases ${[...seen].join(", ")} supersede one another in a circle`);
        break;
      }
      seen.add(at);
    }
  }
  return { superseder, errors: [...new Set(errors)] };
}

/** The identity of the current continuation of `id`: the end of its lineage, `id` itself when nothing supersedes it. */
export function currentOf(superseder: Map<string, string>, id: string): string {
  const seen = new Set([id]);
  let at = id;
  for (let next = superseder.get(at); next !== undefined && !seen.has(next); next = superseder.get(at)) {
    seen.add(next);
    at = next;
  }
  return at;
}

/** The identities of the Test Cases, among those given, that no Test Case among them supersedes, in the order given. */
export function currentTestCases(cases: TestCase[]): string[] {
  const { superseder } = readSupersession(cases);
  return cases.map(testCaseId).filter((id) => !superseder.has(id));
}

/** The identities of the Test Cases, among those given, that test `id` of `kind` and that none among them supersedes: the current HOW of that meaning. */
export function currentTestCasesTesting(cases: TestCase[], kind: string, id: string): string[] {
  const current = new Set(currentTestCases(cases));
  return cases
    .filter((c) => c.tests.some((t) => t.kind === kind && t.id === id))
    .map(testCaseId)
    .filter((tc) => current.has(tc));
}
