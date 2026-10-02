import assert from "node:assert/strict";
import test from "node:test";
import { computeRegression, type Far } from "./regression.js";

const next = (far: Far) => computeRegression(far);
const refused = (far: Far) => {
  const result = computeRegression(far);
  assert.ok("errors" in result, "expected a refusal");
  return result.errors;
};

test("with no previous Regression, Regression is the Feature: R0 = F0", () => {
  assert.deepEqual(next({ feature: ["b", "a"], authorise: [] }), { regression: ["a", "b"] });
  assert.deepEqual(next({ feature: [], authorise: [] }), { regression: [] });
});

test("Feature adds protection", () => {
  assert.deepEqual(next({ previous: ["a", "b"], feature: ["c"], authorise: [] }), { regression: ["a", "b", "c"] });
});

test("Authorise removes protection", () => {
  assert.deepEqual(next({ previous: ["a", "b"], feature: [], authorise: ["a"] }), { regression: ["b"] });
});

test("Regression is Rn-1 minus A plus F", () => {
  assert.deepEqual(next({ previous: ["a", "b", "c"], feature: ["d"], authorise: ["b"] }), {
    regression: ["a", "c", "d"],
  });
});

test("an identity the next Change omits stays protected", () => {
  assert.deepEqual(next({ previous: ["a", "b"], feature: [], authorise: [] }), { regression: ["a", "b"] });
  assert.deepEqual(next({ previous: ["a", "b"], feature: ["c"], authorise: [] }), { regression: ["a", "b", "c"] });
});

test("authorising an identity that is not protected is refused", () => {
  assert.match(refused({ previous: ["a"], feature: [], authorise: ["b"] })[0]!, /"b" is not protected/);
});

test("any Authorise without a previous Regression is refused", () => {
  assert.equal(refused({ feature: ["a"], authorise: ["a"] }).length > 0, true);
  assert.match(refused({ feature: [], authorise: ["a"] })[0]!, /"a" is not protected/);
});

test("introducing an identity that is already protected is refused", () => {
  assert.match(refused({ previous: ["a"], feature: ["a"], authorise: [] })[0]!, /"a" is already protected/);
});

test("an identity both introduced and authorised away by one Change is refused", () => {
  assert.match(
    refused({ previous: ["a"], feature: ["a"], authorise: ["a"] }).join("\n"),
    /"a" cannot be both introduced/,
  );
  assert.match(refused({ previous: ["b"], feature: ["a"], authorise: ["a"] }).join("\n"), /"a" cannot be both/);
});

test("an identity authorised away earlier may be introduced again when the previous Regression lacks it", () => {
  const afterAuthorise = next({ previous: ["a", "b"], feature: [], authorise: ["a"] });
  assert.deepEqual(afterAuthorise, { regression: ["b"] });
  assert.deepEqual(next({ previous: ["b"], feature: ["a"], authorise: [] }), { regression: ["a", "b"] });
});

test("malformed identities and duplicates within a set are refused", () => {
  for (const bad of ["", " a", "a ", "\ta", "a\n"])
    assert.equal(refused({ feature: [bad], authorise: [] }).length, 1, JSON.stringify(bad));
  assert.equal(refused({ previous: [""], feature: [], authorise: [] }).length, 1);
  assert.equal(refused({ previous: ["a"], feature: [], authorise: [" a"] }).length, 1);
  assert.equal(refused({ feature: ["a", "a"], authorise: [] }).length, 1);
  assert.equal(refused({ feature: [1 as unknown as string], authorise: [] }).length, 1);
});

test("identities are compared exactly, without normalization", () => {
  assert.deepEqual(next({ previous: ["A"], feature: ["a"], authorise: [] }), { regression: ["A", "a"] });
  assert.deepEqual(next({ previous: ["\u00e9"], feature: ["e\u0301"], authorise: [] }), {
    regression: ["e\u0301", "\u00e9"],
  });
  assert.equal(refused({ previous: ["a/b"], feature: [], authorise: ["a\\b"] }).length, 1);
});

test("the order of identities does not change the meaning", () => {
  const one = next({ previous: ["a", "b", "c"], feature: ["e", "d"], authorise: ["c", "a"] });
  const other = next({ previous: ["c", "b", "a"], feature: ["d", "e"], authorise: ["a", "c"] });
  assert.deepEqual(one, other);
  assert.deepEqual(one, { regression: ["b", "d", "e"] });
});

test("the same inputs always give the same result, and are never modified", () => {
  const far = { previous: ["b", "a"], feature: ["d", "c"], authorise: ["a"] };
  const copy = structuredClone(far);
  const first = next(far);
  assert.deepEqual(next(far), first);
  assert.deepEqual(far, copy);
});

test("every reason for a refusal is reported", () => {
  const errors = refused({ previous: ["a"], feature: ["a"], authorise: ["x"] });
  assert.equal(errors.length, 2);
});

test("omission has no authority: a Change that states no Authorise removes nothing", () => {
  assert.deepEqual(next({ previous: ["a", "b"], feature: [], authorise: [] }), { regression: ["a", "b"] });
  assert.deepEqual(next({ previous: ["a", "b"], feature: ["c"], authorise: [] }), { regression: ["a", "b", "c"] });
});

test("Authorise can remove only protected meaning, and exactly what it names", () => {
  assert.deepEqual(next({ previous: ["a", "b", "c"], feature: [], authorise: ["b"] }), { regression: ["a", "c"] });
  assert.match(refused({ previous: ["a"], feature: [], authorise: ["b"] })[0]!, /"b" is not protected/);
});

test("the earlier name Acceptance is refused by name, never read, guessed at or silently dropped", () => {
  const retired = (far: object) => computeRegression(far as Far);
  for (const far of [
    { previous: ["a", "b"], feature: [], acceptance: ["a"] },
    { previous: ["a", "b"], feature: [], authorise: [], acceptance: ["a"] },
    { previous: ["a", "b"], feature: [], authorise: ["a"], acceptance: ["a"] },
  ]) {
    const result = retired(far);
    assert.ok("errors" in result, JSON.stringify(far));
    assert.match(result.errors.join("\n"), /acceptance: this is the earlier name of authorise/);
  }
});
