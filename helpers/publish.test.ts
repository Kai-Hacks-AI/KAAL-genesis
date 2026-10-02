import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { publish } from "./publish.js";

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), "publish-"));

/** Runs `body` with `fs.renameSync` failing on its `nth` call. */
function failingRename(nth: number, body: () => void): void {
  const original = fs.renameSync;
  let calls = 0;
  (fs as { renameSync: typeof fs.renameSync }).renameSync = ((from: string, to: string) => {
    if (++calls === nth) throw new Error("injected");
    return original(from, to);
  }) as typeof fs.renameSync;
  try {
    body();
  } finally {
    (fs as { renameSync: typeof fs.renameSync }).renameSync = original;
  }
}

const populate = (dir: string) => {
  fs.mkdirSync(path.join(dir, "sub"));
  fs.writeFileSync(path.join(dir, "sub", "a.txt"), "a\n");
};

test("a directory and a file are published, and no staging is left", () => {
  const root = temp();
  publish({
    directory: { to: path.join(root, "new"), populate },
    file: { to: path.join(root, "f.txt"), content: "f\n" },
  });
  assert.equal(fs.readFileSync(path.join(root, "new", "sub", "a.txt"), "utf8"), "a\n");
  assert.equal(fs.readFileSync(path.join(root, "f.txt"), "utf8"), "f\n");
  assert.deepEqual(fs.readdirSync(root).sort(), ["f.txt", "new"]);
});

test("either part may be published alone", () => {
  const root = temp();
  publish({ file: { to: path.join(root, "f.txt"), content: "f" } });
  publish({ directory: { to: path.join(root, "d"), populate } });
  assert.deepEqual(fs.readdirSync(root).sort(), ["d", "f.txt"]);
  publish({});
  assert.deepEqual(fs.readdirSync(root).sort(), ["d", "f.txt"]);
});

test("a file is replaced in whole, byte for byte, line endings included", () => {
  const root = temp();
  fs.writeFileSync(path.join(root, "f.txt"), "old\r\n");
  publish({ file: { to: path.join(root, "f.txt"), content: "new\r\nbytes\r\n" } });
  assert.equal(fs.readFileSync(path.join(root, "f.txt"), "utf8"), "new\r\nbytes\r\n");
  assert.deepEqual(fs.readdirSync(root), ["f.txt"]);
});

test("a failure while the directory is being built leaves nothing behind", () => {
  const root = temp();
  fs.writeFileSync(path.join(root, "f.txt"), "old\n");
  assert.throws(
    () =>
      publish({
        directory: {
          to: path.join(root, "new"),
          populate(dir) {
            populate(dir);
            throw new Error("boom");
          },
        },
        file: { to: path.join(root, "f.txt"), content: "new\n" },
      }),
    /boom/,
  );
  assert.deepEqual(fs.readdirSync(root), ["f.txt"]);
  assert.equal(fs.readFileSync(path.join(root, "f.txt"), "utf8"), "old\n");
});

test("a failure to publish the file removes the directory this call published, and the original file stays", () => {
  const root = temp();
  fs.writeFileSync(path.join(root, "f.txt"), "old\n");
  failingRename(2, () =>
    assert.throws(
      () =>
        publish({
          directory: { to: path.join(root, "new"), populate },
          file: { to: path.join(root, "f.txt"), content: "new\n" },
        }),
      /injected/,
    ),
  );
  assert.deepEqual(fs.readdirSync(root), ["f.txt"]);
  assert.equal(fs.readFileSync(path.join(root, "f.txt"), "utf8"), "old\n");
});

test("a failure to publish the directory leaves the file untouched and removes the staging", () => {
  const root = temp();
  fs.writeFileSync(path.join(root, "f.txt"), "old\n");
  failingRename(1, () =>
    assert.throws(
      () =>
        publish({
          directory: { to: path.join(root, "new"), populate },
          file: { to: path.join(root, "f.txt"), content: "new\n" },
        }),
      /injected/,
    ),
  );
  assert.deepEqual(fs.readdirSync(root), ["f.txt"]);
  assert.equal(fs.readFileSync(path.join(root, "f.txt"), "utf8"), "old\n");
});

test("a directory that cannot be published over what stands there is not removed", () => {
  const root = temp();
  fs.mkdirSync(path.join(root, "new"));
  fs.writeFileSync(path.join(root, "new", "mine.txt"), "mine\n");
  assert.throws(() => publish({ directory: { to: path.join(root, "new"), populate } }));
  assert.equal(fs.readFileSync(path.join(root, "new", "mine.txt"), "utf8"), "mine\n");
  assert.deepEqual(fs.readdirSync(root), ["new"]);
});
