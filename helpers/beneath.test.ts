import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { beneath } from "./beneath.js";

const root = path.join(os.tmpdir(), "beneath-root");

test("a path strictly beneath the root is returned relative to it, posix", () => {
  assert.equal(beneath(root, "a"), "a");
  assert.equal(beneath(root, "a/b"), "a/b");
  assert.equal(beneath(root, path.join("a", "b")), "a/b");
  assert.equal(beneath(root, "a/../b"), "b");
  assert.equal(beneath(root, "./a//b/"), "a/b");
});

test("an absolute path beneath the root is the same as its relative path", () => {
  assert.equal(beneath(root, path.join(root, "k")), "k");
  assert.equal(beneath(root, path.join(root, "a", "b")), "a/b");
});

test("the root itself, its parents and anything elsewhere are not beneath it", () => {
  for (const target of [
    ".",
    "",
    "..",
    "../outside",
    "a/../..",
    path.dirname(root),
    os.tmpdir(),
    path.resolve(root, "..", "other"),
  ])
    assert.equal(beneath(root, target), undefined, target);
});

test("nothing on disk is consulted: the root and the path need not exist", () => {
  assert.equal(beneath(path.join(root, "missing"), "also/missing"), "also/missing");
});
