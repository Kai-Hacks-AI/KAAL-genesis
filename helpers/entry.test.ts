import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isRegularFile, kind } from "./entry.js";

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), "entry-"));

test("kind tells absence, files and directories apart", () => {
  const dir = temp();
  fs.writeFileSync(path.join(dir, "file"), "x");
  fs.mkdirSync(path.join(dir, "sub"));
  assert.equal(kind(path.join(dir, "file")), "file");
  assert.equal(kind(path.join(dir, "sub")), "directory");
  assert.equal(kind(path.join(dir, "nothing")), "missing");
});

test("kind does not follow a link: a link is other, whatever it points at", (t) => {
  const dir = temp();
  fs.writeFileSync(path.join(dir, "file"), "x");
  fs.mkdirSync(path.join(dir, "sub"));
  try {
    fs.symlinkSync(path.join(dir, "file"), path.join(dir, "to-file"));
    fs.symlinkSync(path.join(dir, "sub"), path.join(dir, "to-sub"), "dir");
    fs.symlinkSync(path.join(dir, "nothing"), path.join(dir, "dangling"));
  } catch {
    t.skip("cannot create symbolic links here");
    return;
  }
  for (const link of ["to-file", "to-sub", "dangling"]) {
    assert.equal(kind(path.join(dir, link)), "other", link);
    assert.equal(isRegularFile(path.join(dir, link)), false, link);
  }
});

test("isRegularFile is true for a file only, and false rather than thrown for what cannot be looked at", () => {
  const dir = temp();
  fs.writeFileSync(path.join(dir, "file"), "x");
  fs.mkdirSync(path.join(dir, "sub"));
  assert.equal(isRegularFile(path.join(dir, "file")), true);
  assert.equal(isRegularFile(path.join(dir, "sub")), false);
  assert.equal(isRegularFile(path.join(dir, "nothing")), false);
  assert.equal(isRegularFile(path.join(dir, "file", "below")), false);
});
