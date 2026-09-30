import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { checkChain, entryKind, sealChain, sealChains } from "./seals.js";
import {
  CHAIN,
  chainData,
  chainWithDirectorySymlink,
  chainWithEmptyUnit,
  chainWithSymlink,
  chainWithSymlinkedSealFile,
  chainWithSymlinkedUnit,
  INVALID_CHAIN,
  NESTED_UNITS,
  OTHER_CHAIN,
  PROTOTYPE_CHAIN,
  RENAMED_UNITS,
  scratchChain,
  SPECIAL_ENTRY,
  SPLIT_CHAINS,
  tree,
  UNITS,
  UNSAFE_UNITS,
  during,
  withFailure,
} from "./test-data.js";

const check = (name: string, units = UNITS) => checkChain(chainData(name), CHAIN, units);

test("seals every open unit oldest first, each chained to the one before, and records the head", () => {
  const root = scratchChain("open");
  assert.deepEqual(sealChain(root, CHAIN, UNITS), ["one", "two"]);
  assert.deepEqual(tree(root), tree(chainData("sealed")));
});

test("sealing later extends the chain and its head exactly as sealing everything at once would", () => {
  const root = scratchChain("sealed-one");
  assert.deepEqual(sealChain(root, CHAIN, UNITS), ["two"]);
  assert.deepEqual(tree(root), tree(chainData("sealed")));
});

test("sealing a fully sealed chain does nothing", () => {
  const root = scratchChain("sealed");
  assert.deepEqual(sealChain(root, CHAIN, UNITS), []);
  assert.deepEqual(tree(root), tree(chainData("sealed")));
});

test("refuses to seal a chain whose seals are broken, and writes nothing", () => {
  for (const name of ["sealed-after-open", "trailing-seal-removed-changed"]) {
    const root = scratchChain(name);
    assert.throws(() => sealChain(root, CHAIN, UNITS), /refusing to seal a chain with broken seals/, name);
    assert.deepEqual(tree(root), tree(chainData(name)), name);
  }
});

test("refuses to seal an empty unit, and writes no seal for the units before it", () => {
  const { root, units } = chainWithEmptyUnit();
  assert.throws(() => sealChain(root, CHAIN, units), /three: refusing to seal an empty unit/);
  assert.deepEqual(tree(root), tree(chainData("open")));
});

test("refuses to seal a unit holding a symlink, naming what it is", () => {
  const root = chainWithSymlink("open");
  assert.throws(
    () => sealChain(root, CHAIN, UNITS),
    /one: refusing to seal entries that are not regular files: link\.txt \(symlink\)/,
  );
});

test("seals and checks a chain named like an inherited object property", () => {
  const root = scratchChain("open");
  assert.deepEqual(checkChain(root, PROTOTYPE_CHAIN, UNITS), []);
  assert.deepEqual(sealChain(root, PROTOTYPE_CHAIN, UNITS), ["one", "two"]);
  assert.deepEqual(checkChain(root, PROTOTYPE_CHAIN, UNITS), []);
});

test("refuses to seal while another sealing holds the root's lock, and writes nothing", () => {
  const root = scratchChain("sealing-in-progress");
  assert.throws(() => sealChain(root, CHAIN, UNITS), /seals\.json\.lock: another sealing holds this root/);
  assert.deepEqual(tree(root), tree(chainData("sealing-in-progress")));
});

test("refuses to seal a unit holding a directory symlink, without following it", () => {
  const root = chainWithDirectorySymlink("open");
  assert.throws(
    () => sealChain(root, CHAIN, UNITS),
    /one: refusing to seal entries that are not regular files: link \(symlink\)$/,
  );
});

test("reports a directory symlink placed in a sealed unit, without following it", () => {
  assert.deepEqual(checkChain(chainWithDirectorySymlink("sealed"), CHAIN, UNITS), ["one/link: symlink in sealed unit"]);
});

test("refuses a chain name that is not lowercase kebab-case", () => {
  assert.deepEqual(checkChain(chainData("open"), INVALID_CHAIN, UNITS), [
    "Not A Chain: chain name must be lowercase kebab-case (a-z, 0-9, single hyphens)",
  ]);
});

test("accepts intact seals and open units after them", () => {
  assert.deepEqual(check("sealed"), []);
  assert.deepEqual(check("sealed-one"), []);
  assert.deepEqual(check("open"), []);
});

test("reports files changed, added or removed after sealing", () => {
  assert.deepEqual(check("file-changed"), ["one/nested/b.txt: changed after sealing"]);
  assert.deepEqual(check("file-added"), ["one/d.txt: added after sealing"]);
  assert.deepEqual(check("file-removed"), ["one/nested/b.txt: removed after sealing"]);
});

test("reports an edited seal and every seal chained after it", () => {
  assert.deepEqual(check("seal-edited"), [
    "one: seal does not match its own content",
    "two: seal does not chain to the previous seal",
  ]);
});

test("reports a seal that is intact but chained to the wrong predecessor", () => {
  assert.deepEqual(check("chain-broken"), ["two: seal does not chain to the previous seal"]);
});

test("reports a seal removed before other seals, and the sealed unit after it", () => {
  assert.deepEqual(check("sealed-after-open"), [
    "two: sealed after open unit one",
    "two: seal does not chain to the previous seal",
    "one: seal removed after sealing",
  ]);
});

test("reports a trailing seal removed after sealing, even if its files changed since", () => {
  assert.deepEqual(check("trailing-seal-removed"), ["two: seal removed after sealing"]);
  assert.deepEqual(check("trailing-seal-removed-changed"), ["two: seal removed after sealing"]);
});

test("reports a chain whose head is missing, mismatched, behind its seals, unknown or unreadable", () => {
  assert.deepEqual(check("head-missing"), ["chain: chain has seals but no head in seals.json"]);
  assert.deepEqual(check("head-mismatch"), ["chain: head does not match the seal of two"]);
  assert.deepEqual(check("sealed-beyond-head"), ["two: sealed beyond the chain's head"]);
  assert.deepEqual(check("head-unknown-unit"), [
    "chain: head records units one, two, three, which do not begin the chain",
  ]);
  assert.deepEqual(check("heads-malformed"), ["seals.json: unreadable chain heads (not a set of chain heads)"]);
});

test("reports units checked in a different order than they were sealed", () => {
  assert.deepEqual(check("sealed", ["two", "one"]), [
    "two: seal does not chain to the previous seal",
    "one: seal does not chain to the previous seal",
    "chain: head records units one, two, which do not begin the chain",
  ]);
});

test("reports a sealed unit whose directory was renamed after sealing", () => {
  assert.deepEqual(check("unit-renamed", RENAMED_UNITS), [
    "zero: seal belongs to unit one",
    "chain: head records units one, two, which do not begin the chain",
  ]);
});

test("reports a symlink placed in a sealed unit", () => {
  assert.deepEqual(checkChain(chainWithSymlink("sealed"), CHAIN, UNITS), ["one/link.txt: symlink in sealed unit"]);
});

test("refuses unit lists that could leave the root, repeat a unit or nest units, reading and writing nothing", () => {
  const rule =
    'unit must be a relative path of portable segments separated by "/": letters, digits, "_", "-", and dots only between them';
  const expected: Record<string, string> = {
    traversal: `../outside: ${rule}`,
    absolute: `/outside: ${rule}`,
    backslash: `one\\nested: ${rule}`,
    "dot-segment": `./one: ${rule}`,
    "trailing-slash": `one/: ${rule}`,
    "trailing-dot": `one.: ${rule}`,
    "trailing-space": `one : ${rule}`,
    reserved: 'con: unit segment "con" is reserved on Windows',
    "reserved-with-extension": 'one/NUL.txt: unit segment "NUL.txt" is reserved on Windows',
    "heads-file": 'seals.json: unit "seals.json" is reserved for the chain heads and lock at the root',
    "lock-file": 'Seals.json.lock: unit "Seals.json.lock" is reserved for the chain heads and lock at the root',
    duplicate: "one: unit listed twice",
    "case-alias": "ONE: unit is the same directory as one on case-insensitive filesystems",
    nested: "one: unit contains unit one/nested",
  };
  for (const [name, units] of Object.entries(UNSAFE_UNITS)) {
    const root = scratchChain("open");
    assert.deepEqual(checkChain(root, CHAIN, units), [expected[name]], name);
    assert.throws(() => sealChain(root, CHAIN, units), /refusing to seal a chain with broken seals/, name);
    assert.deepEqual(tree(root), tree(chainData("open")), name);
  }
});

test("reports an unsafe unit list on its own, without reading the units", () => {
  assert.deepEqual(check("sealed", UNSAFE_UNITS.duplicate), ["one: unit listed twice"]);
});

test("refuses a unit whose directory is a symlink, and writes nothing through it", () => {
  const { root, outside } = chainWithSymlinkedUnit();
  assert.deepEqual(checkChain(root, CHAIN, UNITS), ["one: unit path passes through a symlink"]);
  assert.throws(() => sealChain(root, CHAIN, UNITS), /one: unit path passes through a symlink/);
  assert.deepEqual(Object.keys(tree(outside)), ["a.txt", "nested/b.txt"]);
});

test("reports a structurally invalid seal instead of crashing, and keeps checking later units", () => {
  for (const name of ["seal-malformed-empty", "seal-malformed-files"]) {
    assert.deepEqual(
      check(name),
      ["one: unreadable seal (not a seal)", "two: seal does not chain to the previous seal"],
      name,
    );
  }
});

test("classifies FIFOs, sockets and devices as special files, which cannot be sealed", () => {
  assert.equal(entryKind(SPECIAL_ENTRY), "special file");
});

test("refuses to seal a unit inside a unit another chain has sealed, and writes nothing", () => {
  const root = scratchChain("sealed");
  assert.throws(
    () => sealChain(root, OTHER_CHAIN, NESTED_UNITS),
    /one\/nested: refusing to seal a unit inside sealed unit one/,
  );
  assert.deepEqual(tree(root), tree(chainData("sealed")));
});

test("refuses to seal a unit containing a unit another chain has sealed, and writes nothing", () => {
  const root = scratchChain("nested-sealed-by-other-chain");
  assert.throws(() => sealChain(root, CHAIN, UNITS), /one: refusing to seal a unit containing sealed unit one\/nested/);
  assert.deepEqual(tree(root), tree(chainData("nested-sealed-by-other-chain")));
});

test("reads a seal only from a regular file, never through a symlink", () => {
  const { root } = chainWithSymlinkedSealFile("sealed", "seal");
  assert.deepEqual(checkChain(root, CHAIN, UNITS), [
    "one: unreadable seal (not a regular file)",
    "two: seal does not chain to the previous seal",
  ]);
});

test("refuses a symlinked chain head, and never writes through it", () => {
  const { root, outside } = chainWithSymlinkedSealFile("sealed-one", "heads");
  const before = fs.readFileSync(outside, "utf8");
  assert.deepEqual(checkChain(root, CHAIN, UNITS), ["seals.json: unreadable chain heads (not a regular file)"]);
  assert.throws(() => sealChain(root, CHAIN, UNITS), /refusing to seal a chain with broken seals/);
  assert.equal(fs.readFileSync(outside, "utf8"), before);
});

test("reports a sealed unit replaced by a file instead of crashing, reading and writing nothing", () => {
  const root = scratchChain("unit-replaced-by-file");
  assert.deepEqual(checkChain(root, CHAIN, UNITS), ["one: unit path passes through one, which is not a directory"]);
  assert.deepEqual(checkChain(root, OTHER_CHAIN, NESTED_UNITS), [
    "one/nested: unit path passes through one, which is not a directory",
  ]);
  assert.throws(() => sealChain(root, CHAIN, UNITS), /refusing to seal a chain with broken seals/);
});

test("reports unreadable unit contents instead of crashing, and keeps checking later units", () => {
  assert.deepEqual(
    withFailure("unreadable-file", () => checkChain(chainData("sealed"), CHAIN, UNITS)),
    ["one: unreadable unit contents (simulated readFileSync failure)"],
  );
});

test("removes the seals it wrote when a later seal cannot be written, leaving the chain as it was", () => {
  const root = scratchChain("open");
  assert.throws(
    () => withFailure("unwritable-seal", () => sealChain(root, CHAIN, UNITS)),
    /simulated writeFileSync failure/,
  );
  assert.deepEqual(tree(root), tree(chainData("open")));
  assert.deepEqual(sealChain(root, CHAIN, UNITS), ["one", "two"]);
});

test("removes the seals it wrote when the head cannot be moved, leaving the chain as it was", () => {
  const root = scratchChain("open");
  assert.throws(
    () => withFailure("head-not-replaced", () => sealChain(root, CHAIN, UNITS)),
    /simulated renameSync failure/,
  );
  assert.deepEqual(tree(root), tree(chainData("open")));
});

test("reports a unit whose seal cannot be probed instead of crashing, and keeps checking later units", () => {
  assert.deepEqual(
    withFailure("unprobeable-seal", () => checkChain(chainData("sealed"), CHAIN, UNITS)),
    ["one: unreadable unit (simulated lstatSync failure)"],
  );
});

test("reports a unit path that cannot be probed instead of crashing, and writes nothing", () => {
  const root = scratchChain("open");
  assert.deepEqual(
    withFailure("unprobeable-unit-path", () => checkChain(root, CHAIN, UNITS)),
    ["one: unreadable unit path (simulated lstatSync failure)"],
  );
  assert.throws(
    () => withFailure("unprobeable-unit-path", () => sealChain(root, CHAIN, UNITS)),
    /refusing to seal a chain with broken seals/,
  );
  assert.deepEqual(tree(root), tree(chainData("open")));
});

test("removes a seal left partly written by a failed write, leaving the chain as it was", () => {
  const root = scratchChain("open");
  assert.throws(
    () => withFailure("seal-partly-written", () => sealChain(root, CHAIN, UNITS)),
    /simulated writeFileSync failure/,
  );
  assert.deepEqual(tree(root), tree(chainData("open")));
  assert.deepEqual(sealChain(root, CHAIN, UNITS), ["one", "two"]);
});

test("removes a head left partly written by a failed write, leaving the chain as it was", () => {
  const root = scratchChain("open");
  assert.throws(
    () => withFailure("head-partly-written", () => sealChain(root, CHAIN, UNITS)),
    /simulated writeFileSync failure/,
  );
  assert.deepEqual(tree(root), tree(chainData("open")));
  assert.deepEqual(sealChain(root, CHAIN, UNITS), ["one", "two"]);
});

test("removes a lock left partly written by a failed write, so a retry can seal", () => {
  const root = scratchChain("open");
  assert.throws(
    () => withFailure("lock-partly-written", () => sealChain(root, CHAIN, UNITS)),
    /simulated writeFileSync failure/,
  );
  assert.deepEqual(tree(root), tree(chainData("open")));
  assert.deepEqual(sealChain(root, CHAIN, UNITS), ["one", "two"]);
});

test("reports a sealing in progress instead of a half-sealed chain", () => {
  assert.deepEqual(check("sealing-in-progress"), [
    "seals.json.lock: a sealing is in progress under this root; check again once it has finished",
  ]);
});

test("reports a sealing that completed during the check instead of a half-sealed chain", () => {
  const root = scratchChain("sealed-one");
  assert.deepEqual(
    during(
      "two/seal.json",
      () => sealChain(root, CHAIN, UNITS),
      () => checkChain(root, CHAIN, UNITS),
    ),
    ["seals.json.lock: a sealing is in progress under this root; check again once it has finished"],
  );
  assert.deepEqual(checkChain(root, CHAIN, UNITS), []);
});

test("refuses to seal over another chain's newest unit whose seal was removed, and writes nothing", () => {
  const containing = scratchChain("nested-seal-removed-by-other-chain");
  assert.throws(
    () => sealChain(containing, CHAIN, UNITS),
    /one: refusing to seal a unit overlapping one\/nested, sealed by chain other/,
  );
  assert.deepEqual(tree(containing), tree(chainData("nested-seal-removed-by-other-chain")));
  const inside = scratchChain("head-seal-removed");
  assert.throws(
    () => sealChain(inside, OTHER_CHAIN, NESTED_UNITS),
    /one\/nested: refusing to seal a unit overlapping one, sealed by chain chain/,
  );
  assert.deepEqual(tree(inside), tree(chainData("head-seal-removed")));
});

test("refuses to seal over an earlier unit of another chain whose seal was removed, and writes nothing", () => {
  const root = scratchChain("sealed-after-open");
  assert.throws(
    () => sealChain(root, OTHER_CHAIN, NESTED_UNITS),
    /one\/nested: refusing to seal a unit overlapping one, sealed by chain chain/,
  );
  assert.deepEqual(tree(root), tree(chainData("sealed-after-open")));
});

test("reports a seal or chain heads file edited without changing what the seal's hash covers", () => {
  assert.deepEqual(check("seal-extra-property"), ["one: seal file edited after sealing"]);
  assert.deepEqual(check("heads-extra-property"), ["seals.json: chain heads edited outside sealing"]);
});

test("seals several chains under one root together", () => {
  const root = scratchChain("open");
  assert.deepEqual(sealChains(root, SPLIT_CHAINS), ["one", "two"]);
  for (const [chain, units] of SPLIT_CHAINS) assert.deepEqual(checkChain(root, chain, units), [], chain);
});

test("removes the seals of earlier chains when a later chain fails, leaving the root as it was", () => {
  const root = scratchChain("open");
  assert.throws(
    () => withFailure("unwritable-seal", () => sealChains(root, SPLIT_CHAINS)),
    /simulated writeFileSync failure/,
  );
  assert.deepEqual(tree(root), tree(chainData("open")));
});

test("restores the heads when a later chain refuses after an earlier chain moved them", () => {
  const root = scratchChain("sealed-one");
  assert.throws(
    () =>
      sealChains(root, [
        [OTHER_CHAIN, ["two"]],
        [CHAIN, UNITS],
      ]),
    /refusing to seal a chain with broken seals:\ntwo: seal does not chain to the previous seal/,
  );
  assert.deepEqual(tree(root), tree(chainData("sealed-one")));
});
