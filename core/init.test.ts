import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { initialized, init, KERNEL_FILE } from "./init.js";

const CORE = fileURLToPath(new URL("./", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));

function temp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kaal-core-"));
}

/** Everything under `dir`: posix path to bytes, directories as null. */
function tree(dir: string): Record<string, string | null> {
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .map((e) => path.join(e.parentPath, e.name))
      .sort()
      .map((f) => [
        path.relative(dir, f).split(path.sep).join("/"),
        fs.lstatSync(f).isFile() ? fs.readFileSync(f, "utf8") : null,
      ]),
  );
}

test("an empty directory is not an initialized KAAL", () => {
  assert.equal(initialized(temp()), false);
});

test("init births .kaal in the supplied directory, holding only the KAAL Kernel", () => {
  const dir = temp();
  assert.deepEqual(init(dir), { born: true });
  assert.deepEqual(Object.keys(tree(dir)), [".kaal", `.kaal/${KERNEL_FILE}`]);
  assert.equal(KERNEL_FILE, "KAAL Kernel.md");
  assert.equal(initialized(dir), true);
});

test("the born KAAL can be interpreted from where it is, without the KAAL repository", () => {
  const born = temp();
  init(born);
  // Carried elsewhere, read by nothing but Node: no module of this repository.
  const elsewhere = temp();
  fs.cpSync(path.join(born, ".kaal"), path.join(elsewhere, ".kaal"), { recursive: true });
  const text = fs.readFileSync(path.join(elsewhere, ".kaal", KERNEL_FILE), "utf8");
  const match = /^---\n([\s\S]*?)\n---\n\n([\s\S]+)$/.exec(text);
  assert.ok(match, "frontmatter, a blank line, then a body");
  assert.deepEqual(match[1].split("\n"), ["name: KAAL Kernel", "type: Definition"]);
  // The body defines what it needs to be read: Definition, name, type, body.
  for (const word of ["Definition", "`name`", "`type`", "Markdown body"]) assert.ok(match[2].includes(word), word);
  // And what is born is judged initialized in its new place, too.
  assert.equal(initialized(elsewhere), true);
});

test("the same bytes are born on every run, wherever the repository's line endings were converted", () => {
  const a = temp();
  const b = temp();
  init(a);
  init(b);
  assert.deepEqual(tree(a), tree(b));
  assert.ok(!tree(a)[`.kaal/${KERNEL_FILE}`]!.includes("\r"));
});

test("init changes nothing outside .kaal, and leaves no staging behind", () => {
  const dir = temp();
  fs.writeFileSync(path.join(dir, "mine.txt"), "mine\n");
  fs.mkdirSync(path.join(dir, "sub"));
  fs.writeFileSync(path.join(dir, "sub", "keep.md"), "keep\n");
  const before = tree(dir);
  init(dir);
  const { ".kaal": _dir, [`.kaal/${KERNEL_FILE}`]: _file, ...outside } = tree(dir);
  assert.deepEqual(outside, before);
  assert.deepEqual(fs.readdirSync(dir).sort(), [".kaal", "mine.txt", "sub"]);
});

test("a second init on an initialized KAAL changes nothing", () => {
  const dir = temp();
  init(dir);
  const before = tree(dir);
  const stat = fs.statSync(path.join(dir, ".kaal", KERNEL_FILE));
  assert.deepEqual(init(dir), { born: false });
  assert.deepEqual(tree(dir), before);
  assert.equal(fs.statSync(path.join(dir, ".kaal", KERNEL_FILE)).mtimeMs, stat.mtimeMs);
});

test("an initialized KAAL that holds more than Core installed is left exactly as it is", () => {
  const dir = temp();
  init(dir);
  fs.writeFileSync(path.join(dir, ".kaal", "other.md"), "later\n");
  const before = tree(dir);
  assert.deepEqual(init(dir), { born: false });
  assert.deepEqual(tree(dir), before);
});

test("init refuses a directory that does not exist, creating nothing", () => {
  const missing = path.join(temp(), "nope");
  assert.throws(() => init(missing), /existing directory/);
  assert.equal(fs.existsSync(missing), false);
});

test("init refuses a file in place of the directory", () => {
  const file = path.join(temp(), "file");
  fs.writeFileSync(file, "x");
  assert.throws(() => init(file), /existing directory/);
});

// Sabotage: each thing Core installs, taken away or spoiled, is no longer a
// KAAL, and init then neither repairs nor overwrites what it finds.
const sabotage: Record<string, (kaal: string) => void> = {
  "the Kernel removed (an empty .kaal)": (kaal) => fs.rmSync(path.join(kaal, KERNEL_FILE)),
  "the Kernel emptied": (kaal) => fs.writeFileSync(path.join(kaal, KERNEL_FILE), ""),
  "the Kernel's meaning changed": (kaal) => {
    const file = path.join(kaal, KERNEL_FILE);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("Definition", "Definitions"));
  },
  "the Kernel's type changed": (kaal) => {
    const file = path.join(kaal, KERNEL_FILE);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("type: Definition", "type: Node"));
  },
  "the Kernel renamed": (kaal) => fs.renameSync(path.join(kaal, KERNEL_FILE), path.join(kaal, "KAAL Kernels.md")),
  "the Kernel replaced by a directory": (kaal) => {
    fs.rmSync(path.join(kaal, KERNEL_FILE));
    fs.mkdirSync(path.join(kaal, KERNEL_FILE));
  },
  ".kaal replaced by a file": (kaal) => {
    fs.rmSync(kaal, { recursive: true });
    fs.writeFileSync(kaal, "not a directory\n");
  },
};

for (const [what, spoil] of Object.entries(sabotage)) {
  test(`sabotage: ${what}; the directory is not initialized and init refuses it, changing nothing`, () => {
    const dir = temp();
    init(dir);
    spoil(path.join(dir, ".kaal"));
    const before = tree(dir);
    assert.equal(initialized(dir), false);
    assert.throws(() => init(dir), /\.kaal/);
    assert.deepEqual(tree(dir), before);
  });
}

test("sabotage: .kaal a link to a valid installation is not an installation", (t) => {
  const real = temp();
  init(real);
  const dir = temp();
  try {
    fs.symlinkSync(path.join(real, ".kaal"), path.join(dir, ".kaal"), "dir");
  } catch {
    t.skip("cannot create symbolic links here");
    return;
  }
  assert.equal(initialized(dir), false);
  assert.throws(() => init(dir), /\.kaal/);
  assert.equal(fs.lstatSync(path.join(dir, ".kaal")).isSymbolicLink(), true);
});

test("init refuses unknown material at .kaal, whatever it is, changing nothing", () => {
  const dir = temp();
  fs.mkdirSync(path.join(dir, ".kaal"));
  fs.writeFileSync(path.join(dir, ".kaal", "unknown.md"), "not Core's\n");
  const before = tree(dir);
  assert.throws(() => init(dir), /\.kaal/);
  assert.deepEqual(tree(dir), before);
});

test("a failed birth leaves the directory as it was", () => {
  const dir = temp();
  fs.writeFileSync(path.join(dir, "mine.txt"), "mine\n");
  fs.chmodSync(dir, 0o500);
  try {
    if (process.platform === "win32" || process.getuid?.() === 0) return; // cannot make a directory read-only for this user
    assert.throws(() => init(dir));
  } finally {
    fs.chmodSync(dir, 0o700);
  }
  assert.deepEqual(fs.readdirSync(dir), ["mine.txt"]);
});

test("Core is independent: it imports only Node, nothing of this repository, no graph Skill", () => {
  for (const file of fs.readdirSync(CORE).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
    const source = fs.readFileSync(path.join(CORE, file), "utf8");
    for (const [, specifier] of source.matchAll(/\bfrom\s+"([^"]+)"/g))
      assert.match(specifier, /^(node:|\.\/)/, `${file} imports ${specifier}`);
    for (const name of ["brain", "change", "far", "git", "github", "requirement", "defect", "idea", "managing"])
      assert.ok(!new RegExp(`from\\s+"[^"]*${name}`, "i").test(source), `${file} depends on ${name}`);
  }
});

test("kaal init <directory> works from the command line, without a KAAL repository around the directory", () => {
  const dir = temp();
  const cli = path.join(CORE, "kaal.ts");
  const run = (...args: string[]) =>
    execFileSync(process.execPath, [TSX, cli, ...args], { cwd: os.tmpdir(), encoding: "utf8" });
  assert.match(run("init", dir), /initialized/i);
  assert.equal(initialized(dir), true);
  assert.match(run("init", dir), /already/i);
  assert.throws(() => run("init"), /usage/i);
  assert.throws(() => run("nonsense", dir), /usage/i);
});
