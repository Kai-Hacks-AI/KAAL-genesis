import assert from "node:assert/strict";
import test from "node:test";
import { guardBranchError, type PullRequestOrigin } from "./guard-branch.js";

const THIS_REPO = "Kai-Hacks-AI/KAAL";
const origin = (over: Partial<PullRequestOrigin>): PullRequestOrigin => ({
  headRef: "kaal/change/thing",
  headRepo: THIS_REPO,
  author: "ChBrain",
  thisRepo: THIS_REPO,
  ...over,
});

test("#91, an unnamed agent branch of this repository, is refused", () => {
  const error = guardBranchError(
    origin({ headRef: "fix-linked-skill-symlink-test-18126460239853844777", author: "kaihacksai" }),
  );
  assert.match(error ?? "", /must come from a kaal\/\* branch/);
  assert.match(error ?? "", /fix-linked-skill-symlink-test-18126460239853844777/);
});

test("the hotfix path #91 was rerouted to, kaal/hotfix/*, is allowed", () => {
  assert.equal(guardBranchError(origin({ headRef: "kaal/hotfix/using-skills-symlink-case" })), undefined);
});

test("any kaal/* branch of this repository is allowed", () => {
  assert.equal(guardBranchError(origin({})), undefined);
});

test("a fork's kaal/* branch is refused", () => {
  assert.ok(guardBranchError(origin({ headRepo: "someone/KAAL" })));
});

test("a branch that merely starts like kaal is refused", () => {
  assert.ok(guardBranchError(origin({ headRef: "kaal-fix" })));
  assert.ok(guardBranchError(origin({ headRef: "xkaal/thing" })));
});

test("Dependabot's own dependabot/* branch is allowed", () => {
  assert.equal(
    guardBranchError(origin({ headRef: "dependabot/npm_and_yarn/x-1", author: "dependabot[bot]" })),
    undefined,
  );
});

test("a dependabot/* branch from anyone else, or from a fork, is refused", () => {
  assert.ok(guardBranchError(origin({ headRef: "dependabot/npm_and_yarn/x-1" })));
  assert.ok(
    guardBranchError(
      origin({ headRef: "dependabot/npm_and_yarn/x-1", author: "dependabot[bot]", headRepo: "someone/KAAL" }),
    ),
  );
});
