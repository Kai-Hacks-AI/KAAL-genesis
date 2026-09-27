import assert from "node:assert/strict";
import test from "node:test";
import type { Observation } from "./observe.js";
import { type Member, members, reached } from "./suite.js";
import { suiteData } from "./test-data.js";

test("a run of a suite observes exactly the cases that say they belong to it, as the run observed them, and a case in two suites is reached by each", () => {
  const cases = suiteData("cases") as Member[];
  const observations = suiteData("observations") as Observation[];
  const expected = suiteData("reached") as Record<string, Observation[]>;
  for (const [suite, observed] of Object.entries(expected)) {
    assert.deepEqual(reached(suite, cases, observations), observed);
    assert.deepEqual(
      members(suite, cases),
      observed.map(({ file, title }) => ({ file, title })),
    );
  }
});

test("a suite no case belongs to is refused, and so are observations that are not of the testing state's cases, one each in order", () => {
  const cases = suiteData("cases") as Member[];
  const observations = suiteData("observations") as Observation[];
  assert.throws(() => members("farewells", cases), /farewells: no case belongs to it/);
  assert.throws(() => reached("farewells", cases, observations), /farewells: no case belongs to it/);
  assert.throws(() => reached("greeting", cases, observations.slice(1)), /not of these cases/);
  assert.throws(() => reached("greeting", cases, [...observations].reverse()), /not of these cases/);
});
