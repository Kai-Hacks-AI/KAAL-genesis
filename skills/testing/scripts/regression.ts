/**
 * A protection identity: an opaque, portable name for one protection. Testing
 * compares identities by exact equality and never interprets, normalizes or
 * resolves them.
 */
export type Protection = string;

/**
 * One Change's protection transition. `previous` is the Regression before it;
 * absent, the Change is the first, and `feature` alone is protected. Each is a
 * set of identities: order carries no meaning.
 */
export type Far = {
  previous?: readonly Protection[];
  feature: readonly Protection[];
  acceptance: readonly Protection[];
};

/** The next Regression, or every reason the transition is refused. */
export type Regression = { regression: Protection[] } | { errors: string[] };

function setErrors(name: string, identities: readonly Protection[]): string[] {
  const errors: string[] = [];
  const seen = new Set<Protection>();
  for (const id of identities) {
    if (typeof id !== "string" || !id || id !== id.trim())
      errors.push(`${name}: ${JSON.stringify(id)} must be a non-empty string without leading or trailing whitespace`);
    else if (seen.has(id)) errors.push(`${name}: "${id}" is listed more than once`);
    else seen.add(id);
  }
  return errors;
}

/**
 * Derives the next Regression: `R₀ = F₀`, then `Rₙ = Rₙ₋₁ − Aₙ + Fₙ`. Feature
 * adds protection, Acceptance explicitly gives up protection, and an identity
 * the next Change omits stays protected. Refused, with nothing computed: a
 * malformed identity or one listed twice in a set; accepting an identity the
 * previous Regression does not protect (so any Acceptance without a previous
 * Regression); introducing one it already protects; and an identity both
 * introduced and given up by the same Change.
 *
 * The result is sorted by code unit so the same sets always give the same
 * representation; the order means nothing. Inputs are never modified.
 */
export function computeRegression({ previous, feature, acceptance }: Far): Regression {
  const errors = [
    ...(previous ? setErrors("previous", previous) : []),
    ...setErrors("feature", feature),
    ...setErrors("acceptance", acceptance),
  ];
  if (errors.length) return { errors };

  const protectedNow = new Set(previous ?? []);
  const accepted = new Set(acceptance);
  for (const id of acceptance)
    if (!protectedNow.has(id)) errors.push(`acceptance: "${id}" is not protected, so it cannot be given up`);
  for (const id of feature) {
    if (protectedNow.has(id)) errors.push(`feature: "${id}" is already protected`);
    if (accepted.has(id)) errors.push(`"${id}" cannot be both introduced by feature and given up by acceptance`);
  }
  if (errors.length) return { errors };

  for (const id of acceptance) protectedNow.delete(id);
  for (const id of feature) protectedNow.add(id);
  return { regression: [...protectedNow].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) };
}
