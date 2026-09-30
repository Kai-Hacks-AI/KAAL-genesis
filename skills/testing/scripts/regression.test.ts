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
  assert.deepEqual(next({ feature: ["b", "a"], acceptance: [] }), { regression: ["a", "b"] });
  assert.deepEqual(next({ feature: [], acceptance: [] }), { regression: [] });
});

test("Feature adds protection", () => {
  assert.deepEqual(next({ previous: ["a", "b"], feature: ["c"], acceptance: [] }), { regression: ["a", "b", "c"] });
});

test("Acceptance removes protection", () => {
  assert.deepEqual(next({ previous: ["a", "b"], feature: [], acceptance: ["a"] }), { regression: ["b"] });
});

test("Regression is Rn-1 minus A plus F", () => {
  assert.deepEqual(next({ previous: ["a", "b", "c"], feature: ["d"], acceptance: ["b"] }), {
    regression: ["a", "c", "d"],
  });
});

test("an identity the next Change omits stays protected", () => {
  assert.deepEqual(next({ previous: ["a", "b"], feature: [], acceptance: [] }), { regression: ["a", "b"] });
  assert.deepEqual(next({ previous: ["a", "b"], feature: ["c"], acceptance: [] }), { regression: ["a", "b", "c"] });
});

test("accepting an identity that is not protected is refused", () => {
  assert.match(refused({ previous: ["a"], feature: [], acceptance: ["b"] })[0]!, /"b" is not protected/);
});

test("any Acceptance without a previous Regression is refused", () => {
  assert.equal(refused({ feature: ["a"], acceptance: ["a"] }).length > 0, true);
  assert.match(refused({ feature: [], acceptance: ["a"] })[0]!, /"a" is not protected/);
});

test("introducing an identity that is already protected is refused", () => {
  assert.match(refused({ previous: ["a"], feature: ["a"], acceptance: [] })[0]!, /"a" is already protected/);
});

test("an identity both introduced and given up by one Change is refused", () => {
  assert.match(
    refused({ previous: ["a"], feature: ["a"], acceptance: ["a"] }).join("\n"),
    /"a" cannot be both introduced/,
  );
  assert.match(refused({ previous: ["b"], feature: ["a"], acceptance: ["a"] }).join("\n"), /"a" cannot be both/);
});

test("an identity given up earlier may be introduced again when the previous Regression lacks it", () => {
  const afterAcceptance = next({ previous: ["a", "b"], feature: [], acceptance: ["a"] });
  assert.deepEqual(afterAcceptance, { regression: ["b"] });
  assert.deepEqual(next({ previous: ["b"], feature: ["a"], acceptance: [] }), { regression: ["a", "b"] });
});

test("malformed identities and duplicates within a set are refused", () => {
  for (const bad of ["", " a", "a ", "\ta", "a\n"])
    assert.equal(refused({ feature: [bad], acceptance: [] }).length, 1, JSON.stringify(bad));
  assert.equal(refused({ previous: [""], feature: [], acceptance: [] }).length, 1);
  assert.equal(refused({ previous: ["a"], feature: [], acceptance: [" a"] }).length, 1);
  assert.equal(refused({ feature: ["a", "a"], acceptance: [] }).length, 1);
  assert.equal(refused({ feature: [1 as unknown as string], acceptance: [] }).length, 1);
});

test("identities are compared exactly, without normalization", () => {
  assert.deepEqual(next({ previous: ["A"], feature: ["a"], acceptance: [] }), { regression: ["A", "a"] });
  assert.deepEqual(next({ previous: ["\u00e9"], feature: ["e\u0301"], acceptance: [] }), {
    regression: ["e\u0301", "\u00e9"],
  });
  assert.equal(refused({ previous: ["a/b"], feature: [], acceptance: ["a\\b"] }).length, 1);
});

test("the order of identities does not change the meaning", () => {
  const one = next({ previous: ["a", "b", "c"], feature: ["e", "d"], acceptance: ["c", "a"] });
  const other = next({ previous: ["c", "b", "a"], feature: ["d", "e"], acceptance: ["a", "c"] });
  assert.deepEqual(one, other);
  assert.deepEqual(one, { regression: ["b", "d", "e"] });
});

test("the same inputs always give the same result, and are never modified", () => {
  const far = { previous: ["b", "a"], feature: ["d", "c"], acceptance: ["a"] };
  const copy = structuredClone(far);
  const first = next(far);
  assert.deepEqual(next(far), first);
  assert.deepEqual(far, copy);
});

test("every reason for a refusal is reported", () => {
  const errors = refused({ previous: ["a"], feature: ["a"], acceptance: ["x"] });
  assert.equal(errors.length, 2);
});
