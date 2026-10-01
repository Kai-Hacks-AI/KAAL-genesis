import { testCaseId, type TestCase } from "./test-cases.js";

/**
 * How one Test Case's HOW supersedes another's without the earlier Test Case
 * changing. A Test Case may declare that it `supersedes` an earlier one, and
 * the declaration belongs to the newer alone: the earlier names nothing and is
 * never touched, and both stay what they were written. Supersession records
 * HOW history. It does not delete, invalidate or unrun the earlier Test Case,
 * and it does not by itself make it inactive: whether a Test Case still
 * protects something is decided per `tests` edge. A Test Case is active for a
 * `(kind, id)` it tests unless a later Test Case of its own lineage tests that
 * same `(kind, id)` too. So when TC₁ tests R1 and R2 and TC₂ supersedes TC₁
 * and tests R1, TC₂ is active for R1 and TC₁ stays active for R2, the only
 * protection it has. Everything here is computed from the Test Cases given and
 * the edges they declare, never from dates, history, ordering, where they live
 * or a stored flag, so nothing can be stale.
 *
 * A Test Case is superseded immediately by at most one, so a lineage is a line
 * and which Test Case is later is never ambiguous. Testing reads declared
 * meaning only: it never judges whether two Test Cases prove the same thing.
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
        `${who} supersedes ${earlier}, which another Test Case already supersedes: which is later would be ambiguous`,
      );
    else superseder.set(earlier, id);
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

/**
 * The identities of the Test Cases, among those given, that are active for
 * `id` of `kind`, in the order given: those that test it and that no later
 * Test Case of their own lineage, among those given, tests too. The lineage of
 * a Test Case is the line of Test Cases that supersede it, one after another.
 */
export function currentTestCasesTesting(cases: TestCase[], kind: string, id: string): string[] {
  const { superseder } = readSupersession(cases);
  const byId = new Map(cases.map((c) => [testCaseId(c), c]));
  const tests = (c: TestCase) => c.tests.some((t) => t.kind === kind && t.id === id);
  return cases
    .filter(tests)
    .filter((c) => {
      const seen = new Set<string>();
      for (let at = superseder.get(testCaseId(c)); at !== undefined && !seen.has(at); at = superseder.get(at)) {
        seen.add(at);
        if (tests(byId.get(at)!)) return false;
      }
      return true;
    })
    .map(testCaseId);
}
