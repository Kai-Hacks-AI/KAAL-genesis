import { testCaseId, type TestCase, type Tests } from "./test-cases.js";

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
  // A Test Case supersedes one and is superseded by one, so a lineage is a line or a circle. A walk that
  // ends, or reaches one that did, settles all it passed: each Test Case is walked once.
  const settled = new Set<string>();
  for (const start of superseder.keys()) {
    const seen = new Set([start]);
    let circle = false;
    for (let at = superseder.get(start); at !== undefined && !settled.has(at); at = superseder.get(at)) {
      if (seen.has(at)) {
        errors.push(`Test Cases ${[...seen].join(", ")} supersede one another in a circle`);
        circle = true;
        break;
      }
      seen.add(at);
    }
    if (!circle) for (const id of seen) settled.add(id);
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

/**
 * One active Test Case, once, and the `targets` it is active for: the
 * protected identities that select it. Whatever is relevant to its execution
 * for them is keyed by these, not by the Test Case.
 */
export type PlanEntry = { carrier: string; name: string; targets: Tests[] };

/**
 * The Test Cases, among those given, that are active for at least one of
 * `targets`, each a `kind` and `id`, each once whatever number of targets
 * select it, with the targets it is active for. Activity is `currentTestCasesTesting`'s
 * rule, per edge. The entries are sorted by carrier and name, and the targets
 * of each by kind and id, by code unit. The answer is computed from the Test
 * Cases given and the edges they declare, never stored, so discarding it and
 * asking again gives the same one, and it is a single pass over them: each
 * lineage, a line, is walked from its latest Test Case back, remembering what
 * the later ones test. Nothing is answered from a lineage that is refused: the
 * errors of `readSupersession` are returned instead.
 */
export function testCasesProtecting(
  cases: TestCase[],
  targets: readonly Tests[],
): { entries: PlanEntry[] } | { errors: string[] } {
  const { superseder, errors } = readSupersession(cases);
  if (errors.length) return { errors };
  const key = ({ kind, id }: Tests) => JSON.stringify([kind, id]);
  const wanted = new Map(targets.map((t) => [key(t), { kind: t.kind, id: t.id }]));
  const byId = new Map(cases.map((c) => [testCaseId(c), c]));
  const entries = new Map<string, PlanEntry>();
  for (const head of cases.filter((c) => !superseder.has(testCaseId(c)))) {
    const later = new Set<string>();
    for (let at: TestCase | undefined = head; at; at = at.supersedes && byId.get(testCaseId(at.supersedes))) {
      const edges = at.tests.map(key);
      const active = edges.filter((e) => wanted.has(e) && !later.has(e));
      if (active.length)
        entries.set(testCaseId(at), {
          carrier: at.carrier,
          name: at.name,
          targets: active.map((e) => wanted.get(e)!).sort(byTarget),
        });
      for (const e of edges) later.add(e);
    }
  }
  return { entries: [...entries.values()].sort((a, b) => compare(a.carrier, b.carrier) || compare(a.name, b.name)) };
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byTarget = (a: Tests, b: Tests): number => compare(a.kind, b.kind) || compare(a.id, b.id);

/**
 * The Carriers that hold the Test Cases, among those given, that are active
 * for at least one of `targets`, each a `kind` and `id`: a Test Case counts
 * when it is active for a target it tests, by the same rule as
 * `currentTestCasesTesting`. A Carrier is selected by its active Test Cases
 * alone, never by whether it, or any Test Case in it, has been superseded: one
 * whose Test Case is superseded for one target but active for another stays
 * selected, and one whose every Test Case is superseded for every target does
 * not appear. The Carriers are paths, sorted by code unit and each once; a
 * Test Case contains its Carrier and nothing else is inferred. They are the
 * Carriers of `testCasesProtecting`, and a refused lineage answers its errors.
 */
export function carriersCurrentlyTesting(
  cases: TestCase[],
  targets: readonly Tests[],
): { carriers: string[] } | { errors: string[] } {
  const answer = testCasesProtecting(cases, targets);
  if ("errors" in answer) return answer;
  return { carriers: [...new Set(answer.entries.map((e) => e.carrier))].sort(compare) };
}
