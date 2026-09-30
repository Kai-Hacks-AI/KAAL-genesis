import { type Case, caseSuites, repoCases } from "./links.js";

/**
 * How a regression that held no evidence of its own was judged, before any
 * projected evidence: the candidate's own testing became the next regression,
 * so it had to carry every inherited case at its address, keeping every link
 * and membership, and hold no case nothing newly promised brought in. A
 * candidate of such a regression that holds no evidence either is judged so
 * still; once either holds evidence, the projection judges it instead.
 */

/** A case of a regression, by its address, with the commitments it helps prove and the suites it belongs to, of those the regression requires. */
export type Carried = { file: string; title: string; places: string[]; suites: string[] };

/** Sorted, once each. */
const sorted = (values: string[]) => [...new Set(values)].sort();

/** Each of `state`'s cases for which `keep` holds, with only the commitments and suites of `protection` it names. */
export function carriedCases(
  state: string,
  keep: (c: Case) => boolean,
  commitments: Set<string>,
  suites: Set<string>,
): Carried[] {
  const joined = caseSuites(state);
  return repoCases(state).flatMap((c, i) =>
    keep(c)
      ? [
          {
            file: c.file,
            title: c.title,
            places: sorted(c.places.filter((p) => commitments.has(p))),
            suites: sorted((joined[i]?.suites ?? []).filter((s) => suites.has(s))),
          },
        ]
      : [],
  );
}

/**
 * A complete one-to-one pairing of `left` with `right`, as large as can be,
 * where each pair `fits`: for each of `left`, the index of its partner in
 * `right`, or nothing. Grown by augmenting paths, so it does not depend on the
 * order either is listed in, and with as many partners that are `preferred`
 * as a complete pairing can have.
 */
function pairing<L, R>(
  left: L[],
  right: R[],
  fits: (l: L, r: R) => boolean,
  preferred: (r: R) => boolean = () => true,
): (number | undefined)[] {
  const owner: (number | undefined)[] = right.map(() => undefined);
  const assign = (l: number, seen: Set<number>, may: (r: R) => boolean): boolean =>
    right.some((r, k) => {
      if (seen.has(k) || !may(r) || !fits(left[l]!, r)) return false;
      seen.add(k);
      if (owner[k] === undefined || assign(owner[k]!, seen, may)) return ((owner[k] = l), true);
      return false;
    });
  // First among the preferred alone, then among all: a path that grows a matching never frees what it has matched,
  // so as many preferred as can be are kept, and the matching is still complete where one can be.
  left.forEach((_, l) => assign(l, new Set(), preferred));
  left.forEach((_, l) => owner.includes(l) || assign(l, new Set(), () => true));
  return left.map((_, l) => {
    const k = owner.indexOf(l);
    return k < 0 ? undefined : k;
  });
}

/** Whether `c` keeps every link and membership `d` has. */
const keepsAll = (d: Carried, c: Carried) =>
  d.places.every((p) => c.places.includes(p)) && d.suites.every((s) => c.suites.includes(s));

/** A case's address, the same for every case at it. */
const address = (c: Carried) => `${c.file}\0${c.title}`;

/**
 * The cases of the next regression: each inherited case as the candidate
 * carries it, found by a complete matching at each address with a case of the
 * candidate keeping its every link and membership, so a case that comes to
 * prove a new promise too is carried once, as the case it is; each case of the
 * candidate demonstrating a new promise, with its links to what it
 * demonstrates and, back at the address of a case `given` up whose every link
 * and membership still held it keeps, with those; and each inherited case the
 * candidate does not carry, as it was, which the candidate is then held to.
 */
export function carrying(
  inherited: Carried[],
  given: Carried[],
  candidate: Carried[],
  proving: Set<string>,
): Carried[] {
  const demonstrates = (c: Carried) => c.places.some((p) => proving.has(p));
  const cases: Carried[] = [];
  const carried = new Set<number>();
  for (const at of new Set(inherited.map(address))) {
    const is = inherited.filter((c) => address(c) === at);
    const slots = candidate.flatMap((c, k) => (address(c) === at ? [k] : []));
    // A case demonstrating a new promise carries an inherited one only where no other case at the address can, so a
    // demonstrating duplicate added beside the inherited case enters as the new case it is.
    const partner = pairing(
      is,
      slots,
      (c, k) => keepsAll(c, candidate[k]!),
      (k) => !demonstrates(candidate[k]!),
    );
    is.forEach((c, i) => {
      const k = partner[i] === undefined ? undefined : slots[partner[i]!];
      if (k === undefined) cases.push(c);
      // Carried with what it had, and a link to a new promise it came to prove: nothing else it gained enters with it.
      else {
        carried.add(k);
        cases.push({ ...c, places: sorted([...c.places, ...candidate[k]!.places.filter((p) => proving.has(p))]) });
      }
    });
  }
  // A case of the candidate's own enters as a case of what it newly promises, and as nothing else: a link to an
  // inherited commitment or a membership of an inherited suite is protection no new promise brought in. Only a case
  // given up and back at its address, keeping all the given-up case had that the regression still holds, keeps that:
  // it restores what the regression had, and adds nothing to it.
  const entering = candidate.filter((c, k) => !carried.has(k) && demonstrates(c));
  return [
    ...cases,
    ...[...new Set(entering.map(address))].flatMap((at) => {
      const back = given.filter((c) => address(c) === at);
      const here = entering.filter((c) => address(c) === at);
      const partner = pairing(here, back, (c, g) => keepsAll(g, c));
      return here.map((c, i) => {
        const was = partner[i] === undefined ? undefined : back[partner[i]!];
        const places = c.places.filter((p) => proving.has(p));
        return was
          ? { ...c, places: sorted([...places, ...was.places]), suites: was.suites }
          : { ...c, places, suites: [] };
      });
    }),
  ];
}

/**
 * Why `own`, the cases a candidate's own testing holds, does not carry
 * `derived`, the cases of the regression derived for it, exactly, if it does
 * not: it keeps every case the derivation holds at its address, still helping
 * prove each commitment and belonging to each suite the derivation says it
 * does, and holds nothing more. `refused` are the addresses of the candidate's
 * cases that did not pass as the next regression, which the successor checks
 * already refuse, so a case of its own there is left to them.
 */
export function carriedErrors(derived: Carried[], own: Carried[], refused: Set<string> = new Set()): string[] {
  const errors: string[] = [];
  // Cases are matched one to one, so two cases at one address need two. At each address the derived cases are paired
  // with the candidate's by a complete matching that keeps every relation, whatever order either lists them in; only
  // what no such pairing can keep is reported, against what the candidate has left at the address, if anything. What
  // the candidate's regression holds beyond the derived one, a case or a relation, is reported too: once accepted, it
  // would be inherited protection that nothing newly promised brought in.
  const surplus = (name: string, o: Carried, d: Carried) => {
    for (const place of o.places.filter((p) => !d.places.includes(p)))
      errors.push(
        `${name}: helps prove ${place} in the candidate's regression, which nothing newly promised brings into the regression`,
      );
    for (const suite of o.suites.filter((s) => !d.suites.includes(s)))
      errors.push(
        `${name}: belongs to ${suite} in the candidate's regression, which nothing newly promised brings into the regression`,
      );
  };
  for (const at of new Set([...derived, ...own].map(address))) {
    const ds = derived.filter((c) => address(c) === at);
    const os = own.filter((c) => address(c) === at);
    const partner = pairing(ds, os, keepsAll);
    const spare = os.filter((_, k) => !partner.includes(k));
    ds.forEach((c, d) => {
      const name = `${c.file}: ${JSON.stringify(c.title)}`;
      if (partner[d] !== undefined) return surplus(name, os[partner[d]!]!, c);
      const is = spare.shift();
      if (!is) {
        errors.push(
          `${name}: in the regression, and no acceptance record excludes it, but the candidate no longer has it`,
        );
        return;
      }
      for (const place of c.places.filter((p) => !is.places.includes(p)))
        errors.push(`${name}: helps prove ${place} in the regression, but no longer does in the candidate's`);
      for (const suite of c.suites.filter((s) => !is.suites.includes(s)))
        errors.push(`${name}: belongs to ${suite} in the regression, but no longer does in the candidate's`);
    });
    // A case of its own that could not judge the next candidate, which the successor checks already refuse, is left to them.
    for (const o of spare.filter((o) => !refused.has(address(o))))
      errors.push(
        `${o.file}: ${JSON.stringify(o.title)}: the candidate's regression has it, but nothing newly promised brings it into the regression`,
      );
  }
  return errors;
}
