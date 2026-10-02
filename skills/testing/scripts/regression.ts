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
  authorise: readonly Protection[];
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
 * adds protection, Authorise is the explicit authority by which protection may
 * cease to be required, and an identity the next Change omits stays protected:
 * omission has no authority. Refused, with nothing computed: a malformed
 * identity or one listed twice in a set; authorising an identity the previous
 * Regression does not protect (so any Authorise without a previous Regression);
 * introducing one it already protects; an identity both introduced and
 * authorised away by the same Change; and `acceptance`, the name Authorise had
 * before, which is refused by name rather than read or guessed at, so a set
 * stated under it is never silently dropped.
 *
 * The result is sorted by code unit so the same sets always give the same
 * representation; the order means nothing. Inputs are never modified.
 */
export function computeRegression(far: Far): Regression {
  if ("acceptance" in far)
    return { errors: ["acceptance: this is the earlier name of authorise; state the set as authorise"] };
  const { previous, feature, authorise } = far;
  const errors = [
    ...(previous ? setErrors("previous", previous) : []),
    ...setErrors("feature", feature),
    ...setErrors("authorise", authorise),
  ];
  if (errors.length) return { errors };

  const protectedNow = new Set(previous ?? []);
  const authorised = new Set(authorise);
  for (const id of authorise)
    if (!protectedNow.has(id)) errors.push(`authorise: "${id}" is not protected, so it cannot be authorised away`);
  for (const id of feature) {
    if (protectedNow.has(id)) errors.push(`feature: "${id}" is already protected`);
    if (authorised.has(id))
      errors.push(`"${id}" cannot be both introduced by feature and authorised away by authorise`);
  }
  if (errors.length) return { errors };

  for (const id of authorise) protectedNow.delete(id);
  for (const id of feature) protectedNow.add(id);
  return { regression: [...protectedNow].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) };
}

/**
 * The Feature of a Change: the identities of the protections born on it,
 * as a set, sorted by code unit so the same identities always give the same
 * representation. It is a projection and never a judgment: what is born on a
 * Change is Feature whether or not it can yet be defended, so discovery is
 * never edited to what Testing can currently protect. Which identities a
 * Change gave birth to is for the using system to say. Refused, with nothing
 * computed: a malformed identity or one listed twice. Inputs are never modified.
 */
export function computeFeature(born: readonly Protection[]): { feature: Protection[] } | { errors: string[] } {
  const errors = setErrors("born", born);
  if (errors.length) return { errors };
  return { feature: [...born].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) };
}
