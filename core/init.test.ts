import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { init, initialized, KERNEL_FILE } from "./init.js";
import { available, capabilities, register, registered, REGISTRATIONS } from "./registrations.js";
import { section } from "./section.js";

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

const agents = (root: string) => path.join(root, "AGENTS.md");
const kernel = (root: string, kaal = ".kaal") => path.join(root, kaal, KERNEL_FILE);
const registrations = (root: string, kaal = ".kaal") => path.join(root, kaal, ...REGISTRATIONS.split("/"));

test("an empty directory is not an initialized KAAL", () => {
  assert.equal(initialized(temp()), false);
});

test("init in an empty directory births .kaal and the root's AGENTS.md, nothing else", () => {
  const root = temp();
  assert.deepEqual(init(root), { born: true, wired: true });
  assert.deepEqual(Object.keys(tree(root)).sort(), [
    ".kaal",
    `.kaal/${KERNEL_FILE}`,
    ".kaal/core",
    ".kaal/core/registrations.md",
    "AGENTS.md",
  ]);
  assert.equal(KERNEL_FILE, "KAAL Kernel.md");
  assert.equal(fs.readFileSync(agents(root), "utf8"), section(".kaal"));
  assert.equal(initialized(root), true);
});

test("the born KAAL can be interpreted from where it is, without the KAAL repository", () => {
  const born = temp();
  init(born);
  // Carried elsewhere, read by nothing but Node: no module of this repository.
  const elsewhere = temp();
  fs.cpSync(path.join(born, ".kaal"), path.join(elsewhere, ".kaal"), { recursive: true });
  const text = fs.readFileSync(kernel(elsewhere), "utf8");
  const match = /^---\n([\s\S]*?)\n---\n\n([\s\S]+)$/.exec(text);
  assert.ok(match, "frontmatter, a blank line, then a body");
  assert.deepEqual(match[1].split("\n"), ["name: KAAL Kernel", "type: Definition"]);
  // The body defines what it needs to be read: Definition, name, type, body.
  for (const word of ["Definition", "`name`", "`type`", "Markdown body"]) assert.ok(match[2].includes(word), word);
  // The registrations explain themselves to an agent that reads only them.
  assert.match(fs.readFileSync(registrations(elsewhere), "utf8"), /never holds it/);
});

test("the same bytes are born every time, whatever the platform's line endings", () => {
  const a = temp();
  const b = temp();
  init(a);
  init(b);
  assert.deepEqual(tree(a), tree(b));
  assert.ok(!Object.values(tree(a)).some((text) => text?.includes("\r")));
});

test("the root's AGENTS.md points at the KAAL directory's registrations, and at nothing a later install changes", () => {
  const root = temp();
  init(root);
  const text = fs.readFileSync(agents(root), "utf8");
  assert.match(text, /^# KAAL\n/);
  assert.ok(text.includes("`.kaal/core/registrations.md`"));
  fs.mkdirSync(path.join(root, "skills", "some-skill"), { recursive: true });
  fs.writeFileSync(path.join(root, "skills", "some-skill", "SKILL.md"), "---\nname: some-skill\n---\n");
  register(root, ".kaal", { kind: "skill", name: "some-skill", location: "skills/some-skill" });
  assert.equal(fs.readFileSync(agents(root), "utf8"), text);
});

test("init with an explicitly named KAAL directory births it there and points AGENTS.md at it", () => {
  const root = temp();
  fs.mkdirSync(path.join(root, "tools"));
  assert.deepEqual(init(root, { kaal: "tools/kaal" }), { born: true, wired: true });
  assert.ok(fs.existsSync(kernel(root, "tools/kaal")));
  assert.ok(fs.existsSync(registrations(root, "tools/kaal")));
  assert.ok(!fs.existsSync(path.join(root, ".kaal")));
  assert.equal(fs.readFileSync(agents(root), "utf8"), section("tools/kaal"));
  assert.equal(initialized(root, "tools/kaal"), true);
  assert.equal(initialized(root), false);
});

test("the KAAL directory must lie strictly inside the root, and its parent must exist", () => {
  const root = temp();
  for (const kaal of [".", "..", "../outside", path.resolve(root, ".."), os.tmpdir()])
    assert.throws(() => init(root, { kaal }), /inside/, kaal);
  assert.throws(() => init(root, { kaal: "missing/kaal" }), /parent/);
  assert.deepEqual(fs.readdirSync(root), []);
});

test("an absolute KAAL directory inside the root is the same as its relative path", () => {
  const root = temp();
  init(root, { kaal: path.join(root, "k") });
  assert.equal(fs.readFileSync(agents(root), "utf8"), section("k"));
});

test("AGENTS.md: an existing file keeps every byte outside Core's section", () => {
  for (const [name, host] of [
    ["ending in a newline", "# Host\n\nMy rules.\n\n## Detail\nkept\n"],
    ["with no final newline", "# Host\n\nMy rules."],
    ["CRLF", "# Host\r\n\r\nMy rules.\r\n"],
    ["with a KAAL heading inside a code fence", "# Host\n\n```\n# KAAL\n```\n"],
  ]) {
    const root = temp();
    fs.writeFileSync(agents(root), host);
    assert.deepEqual(init(root), { born: true, wired: true }, name);
    const after = fs.readFileSync(agents(root), "utf8");
    assert.ok(after.startsWith(host), name);
    assert.equal(after.slice(host.length).replace(/\r\n/g, "\n").trim(), section(".kaal").trim(), name);
    if (host.includes("\r\n")) assert.ok(!/[^\r]\n/.test(after), name);
  }
});

test("AGENTS.md: Core's section sits between the host's other sections and keeps them", () => {
  const root = temp();
  init(root);
  const mine = fs.readFileSync(agents(root), "utf8");
  fs.writeFileSync(agents(root), `# Before\n\nfirst\n\n${mine}\n# After\n\nlast\n`);
  const before = fs.readFileSync(agents(root), "utf8");
  assert.deepEqual(init(root), { born: false, wired: false });
  assert.equal(fs.readFileSync(agents(root), "utf8"), before);
});

test("a second init does not duplicate or churn the section or anything else", () => {
  const root = temp();
  fs.writeFileSync(agents(root), "# Host\n\nmine\n");
  init(root);
  const before = tree(root);
  const stat = fs.statSync(agents(root));
  assert.deepEqual(init(root), { born: false, wired: false });
  assert.deepEqual(tree(root), before);
  assert.equal(fs.statSync(agents(root)).mtimeMs, stat.mtimeMs);
  assert.equal(fs.readFileSync(agents(root), "utf8").match(/^# KAAL$/gm)?.length, 1);
});

test("init wires a missing section into an existing installation, changing nothing else", () => {
  const root = temp();
  init(root);
  fs.rmSync(agents(root));
  const kaal = tree(path.join(root, ".kaal"));
  assert.equal(initialized(root), false);
  assert.deepEqual(init(root), { born: false, wired: true });
  assert.deepEqual(tree(path.join(root, ".kaal")), kaal);
  assert.equal(initialized(root), true);
});

test("a KAAL section that is not the one Core writes is refused, changing nothing", () => {
  const root = temp();
  fs.writeFileSync(agents(root), "# KAAL\n\nThe host's own words about KAAL.\n");
  const before = tree(root);
  assert.throws(() => init(root), /refusing to replace/);
  assert.deepEqual(tree(root), before);
  init(temp()); // and a second root is unaffected
  const other = temp();
  init(other);
  assert.throws(() => init(other, { kaal: "elsewhere" }), /refusing to replace/);
  assert.equal(fs.existsSync(path.join(other, "elsewhere")), false);
});

test("an AGENTS.md that is not a regular file is refused, changing nothing", () => {
  const root = temp();
  fs.mkdirSync(agents(root));
  assert.throws(() => init(root), /regular file/);
  assert.deepEqual(fs.readdirSync(root), ["AGENTS.md"]);
});

test("init changes nothing outside .kaal and the one AGENTS.md section, and leaves no staging behind", () => {
  const root = temp();
  fs.writeFileSync(path.join(root, "mine.txt"), "mine\n");
  fs.mkdirSync(path.join(root, "sub"));
  fs.writeFileSync(path.join(root, "sub", "keep.md"), "keep\n");
  const before = tree(root);
  init(root);
  const after = tree(root);
  for (const [file, content] of Object.entries(before)) assert.equal(after[file], content, file);
  assert.deepEqual(fs.readdirSync(root).sort(), [".kaal", "AGENTS.md", "mine.txt", "sub"]);
});

test("init installs no Skill or Extension anywhere, nor creates directories for later layers", () => {
  const root = temp();
  init(root);
  assert.deepEqual(
    Object.keys(tree(root)).filter((p) => /skill|extension|agent|graph|brain/i.test(p)),
    ["AGENTS.md"],
  );
  const state = capabilities(path.join(root, ".kaal"));
  assert.deepEqual(state.registered, []);
  assert.ok(state.available.length > 0 && state.available.every((c) => !c.registered));
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

// Sabotage: each thing Core installs, taken away or spoiled, is no longer an
// initialized KAAL, and init then neither repairs nor overwrites what it finds.
const sabotage: Record<string, (root: string) => void> = {
  "the Kernel removed": (root) => fs.rmSync(kernel(root)),
  "the Kernel emptied": (root) => fs.writeFileSync(kernel(root), ""),
  "the Kernel renamed": (root) => fs.renameSync(kernel(root), path.join(root, ".kaal", "KAAL Kernels.md")),
  "the Kernel replaced by a directory": (root) => {
    fs.rmSync(kernel(root));
    fs.mkdirSync(kernel(root));
  },
  "the registrations removed": (root) => fs.rmSync(registrations(root)),
  "the registrations emptied": (root) => fs.writeFileSync(registrations(root), ""),
  "core/ replaced by a file": (root) => {
    fs.rmSync(path.join(root, ".kaal", "core"), { recursive: true });
    fs.writeFileSync(path.join(root, ".kaal", "core"), "x");
  },
  ".kaal replaced by a file": (root) => {
    fs.rmSync(path.join(root, ".kaal"), { recursive: true });
    fs.writeFileSync(path.join(root, ".kaal"), "not a directory\n");
  },
  ".kaal emptied": (root) => {
    fs.rmSync(path.join(root, ".kaal"), { recursive: true });
    fs.mkdirSync(path.join(root, ".kaal"));
  },
};

for (const [what, spoil] of Object.entries(sabotage)) {
  test(`sabotage: ${what}; the directory is not initialized and init refuses it, changing nothing`, () => {
    const root = temp();
    init(root);
    spoil(root);
    const before = tree(root);
    assert.equal(initialized(root), false);
    assert.throws(() => init(root), /\.kaal/);
    assert.deepEqual(tree(root), before);
  });
}

test("sabotage: the host's section removed leaves KAAL not initialized, and init wires it again", () => {
  const root = temp();
  fs.writeFileSync(agents(root), "# Host\n");
  init(root);
  fs.writeFileSync(agents(root), "# Host\n");
  assert.equal(initialized(root), false);
  assert.deepEqual(init(root), { born: false, wired: true });
  assert.equal(initialized(root), true);
});

test("a different Kernel is a KAAL this Core does not recognize: initialized, never overwritten", () => {
  const root = temp();
  init(root);
  fs.writeFileSync(kernel(root), "---\nname: KAAL Kernel\ntype: Definition\n---\n\nA later Kernel.\n");
  const before = tree(root);
  assert.equal(initialized(root), true);
  assert.throws(() => init(root), /does not recognize/);
  assert.deepEqual(tree(root), before);
});

test("sabotage: .kaal a link to a valid installation is not an installation", (t) => {
  const real = temp();
  init(real);
  const root = temp();
  try {
    fs.symlinkSync(path.join(real, ".kaal"), path.join(root, ".kaal"), "dir");
  } catch {
    t.skip("cannot create symbolic links here");
    return;
  }
  assert.equal(initialized(root), false);
  assert.throws(() => init(root), /\.kaal/);
  assert.equal(fs.lstatSync(path.join(root, ".kaal")).isSymbolicLink(), true);
});

test("init refuses unknown material at .kaal, whatever it is, changing nothing", () => {
  const root = temp();
  fs.mkdirSync(path.join(root, ".kaal"));
  fs.writeFileSync(path.join(root, ".kaal", "unknown.md"), "not Core's\n");
  const before = tree(root);
  assert.throws(() => init(root), /\.kaal/);
  assert.deepEqual(tree(root), before);
});

test("a failed init leaves the directory as it was, AGENTS.md and all", () => {
  if (process.platform === "win32" || process.getuid?.() === 0) return; // cannot make a directory read-only for this user
  const root = temp();
  fs.writeFileSync(agents(root), "# Host\n");
  fs.chmodSync(root, 0o500);
  try {
    assert.throws(() => init(root));
  } finally {
    fs.chmodSync(root, 0o700);
  }
  assert.deepEqual(fs.readdirSync(root), ["AGENTS.md"]);
  assert.equal(fs.readFileSync(agents(root), "utf8"), "# Host\n");
});

test("a failure after .kaal is born rolls .kaal back, leaving the host as it was", () => {
  const root = temp();
  fs.writeFileSync(agents(root), "# Host\n");
  // The staged AGENTS.md cannot be published over a directory of the same name.
  const original = fs.renameSync;
  let calls = 0;
  (fs as { renameSync: typeof fs.renameSync }).renameSync = ((from: string, to: string) => {
    if (++calls === 2) throw new Error("injected");
    return original(from, to);
  }) as typeof fs.renameSync;
  try {
    assert.throws(() => init(root), /injected/);
  } finally {
    (fs as { renameSync: typeof fs.renameSync }).renameSync = original;
  }
  assert.deepEqual(fs.readdirSync(root), ["AGENTS.md"]);
  assert.equal(fs.readFileSync(agents(root), "utf8"), "# Host\n");
});

// Available is what the distribution offers, registered is what this KAAL
// holds, installed is what stands in the project. Three different facts.
test("Core represents available and registered apart, without installing anything", () => {
  const root = temp();
  init(root);
  const kaalDir = path.join(root, ".kaal");
  const available = [
    { kind: "skill", name: "some-skill" },
    { kind: "extension", name: "some-extension" },
  ] as const;
  assert.deepEqual(capabilities(kaalDir, available), {
    available: [
      { kind: "skill", name: "some-skill", registered: false },
      { kind: "extension", name: "some-extension", registered: false },
    ],
    registered: [],
  });
  assert.deepEqual(
    Object.keys(tree(root)),
    Object.keys(tree(root)).filter((p) => !/some-/.test(p)),
  );
});

test("registering points at what is installed where its own standard puts it, and records nothing else", () => {
  const root = temp();
  init(root);
  const kaalDir = path.join(root, ".kaal");
  fs.mkdirSync(path.join(root, ".agents", "skills", "some-skill"), { recursive: true });
  fs.mkdirSync(path.join(root, "ext"), { recursive: true });
  const before = tree(kaalDir);
  assert.equal(
    register(root, ".kaal", { kind: "skill", name: "some-skill", location: ".agents/skills/some-skill" }),
    true,
  );
  assert.equal(register(root, ".kaal", { kind: "extension", name: "some-extension", location: "ext" }), true);
  assert.deepEqual(registered(kaalDir), [
    { kind: "skill", name: "some-skill", location: ".agents/skills/some-skill" },
    { kind: "extension", name: "some-extension", location: "ext" },
  ]);
  const after = tree(kaalDir);
  assert.deepEqual(Object.keys(after), Object.keys(before), "no new path under .kaal");
  assert.deepEqual(
    Object.keys(tree(path.join(root, ".agents", "skills", "some-skill"))),
    [],
    "the capability is untouched",
  );
  assert.deepEqual(
    capabilities(kaalDir, [
      { kind: "skill", name: "some-skill" },
      { kind: "skill", name: "other" },
    ]).available,
    [
      { kind: "skill", name: "some-skill", registered: true },
      { kind: "skill", name: "other", registered: false },
    ],
  );
  // Registered and still recognized: a second init is still a no-op.
  assert.deepEqual(init(root), { born: false, wired: false });
  assert.equal(registered(kaalDir).length, 2);
});

test("registering twice changes nothing; the same name elsewhere is refused", () => {
  const root = temp();
  init(root);
  fs.mkdirSync(path.join(root, "a"));
  fs.mkdirSync(path.join(root, "b"));
  assert.equal(register(root, ".kaal", { kind: "skill", name: "x", location: "a" }), true);
  const before = tree(root);
  assert.equal(register(root, ".kaal", { kind: "skill", name: "x", location: "a/" }), false);
  assert.throws(() => register(root, ".kaal", { kind: "skill", name: "x", location: "b" }), /already registered/);
  assert.deepEqual(tree(root), before);
});

test("registering refuses what is not installed, what lives inside .kaal, and what escapes the root", () => {
  const root = temp();
  init(root);
  fs.mkdirSync(path.join(root, ".kaal", "inside"));
  const before = tree(root);
  const skill = (location: string) => register(root, ".kaal", { kind: "skill", name: "x", location });
  assert.throws(() => skill("nothing-here"), /nothing is installed/);
  assert.throws(() => skill(".kaal/inside"), /never inside/);
  assert.throws(() => skill(".kaal"), /never inside/);
  assert.throws(() => skill("../out"), /inside/);
  assert.throws(() => skill("."), /inside/);
  assert.throws(
    () => register(root, ".kaal", { kind: "plugin" as "skill", name: "x", location: "a" }),
    /skill or an extension/,
  );
  assert.throws(() => register(root, ".kaal", { kind: "skill", name: "bad name", location: "a" }), /name/);
  assert.deepEqual(tree(root), before);
});

test("registering needs an initialized KAAL", () => {
  const root = temp();
  fs.mkdirSync(path.join(root, "a"));
  assert.throws(() => register(root, ".kaal", { kind: "skill", name: "x", location: "a" }), /not initialized/);
});

test("Core is independent: it imports only Node and itself, nothing of this repository, no graph Skill", () => {
  for (const file of fs.readdirSync(CORE).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
    const source = fs.readFileSync(path.join(CORE, file), "utf8");
    for (const [, specifier] of source.matchAll(/\bfrom\s+"([^"]+)"/g))
      assert.match(specifier, /^(node:|\.\/[a-z]+\.js$)/, `${file} imports ${specifier}`);
  }
});

test("kaal init <directory> [--kaal <dir>] works from the command line, without a KAAL repository around the directory", () => {
  const root = temp();
  const cli = path.join(CORE, "kaal.ts");
  const run = (...args: string[]) =>
    execFileSync(process.execPath, [TSX, cli, ...args], {
      cwd: os.tmpdir(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  assert.match(run("init", root), /initialized/i);
  assert.equal(initialized(root), true);
  assert.match(run("init", root), /already/i);
  const other = temp();
  assert.match(run("init", other, "--kaal", "k"), /initialized/i);
  assert.equal(initialized(other, "k"), true);
  assert.throws(() => run("init"), /usage/i);
  assert.throws(() => run("nonsense", root), /usage/i);
  assert.throws(() => run("init", root, "--bogus", "x"), /usage/i);
});

// The catalogue: a small file Core owns, read and never inferred.

test("Core reads its catalogue file: kind and name only, nothing scanned", () => {
  const entries = available();
  assert.ok(entries.length > 0);
  for (const entry of entries) assert.deepEqual(Object.keys(entry), ["kind", "name"]);
  const file = path.join(temp(), "catalogue.md");
  fs.writeFileSync(file, "# Any\n\nprose is ignored\n\n- skill one\n- extension two\n");
  assert.deepEqual(available(file), [
    { kind: "skill", name: "one" },
    { kind: "extension", name: "two" },
  ]);
});

test("the catalogue refuses an entry it cannot read and an entry listed twice", () => {
  const file = path.join(temp(), "catalogue.md");
  for (const [text, error] of [
    ["- plugin one\n", /not a catalogue entry/],
    ["- skill\n", /not a catalogue entry/],
    ["- skill one extra\n", /not a catalogue entry/],
    ["- skill one\n- skill one\n", /listed twice/],
  ] as const) {
    fs.writeFileSync(file, text);
    assert.throws(() => available(file), error, text);
  }
});

test("what Core reports as available is what the catalogue lists, whatever else stands in the project", () => {
  const root = temp();
  init(root);
  fs.mkdirSync(path.join(root, "skills", "not-listed"), { recursive: true });
  const kaalDir = path.join(root, ".kaal");
  const names = capabilities(kaalDir).available.map((c) => `${c.kind} ${c.name}`);
  assert.deepEqual(
    names,
    available().map((c) => `${c.kind} ${c.name}`),
  );
  assert.ok(!names.includes("skill not-listed"));
  // Registering one marks that one registered; the rest stay available and unregistered.
  fs.mkdirSync(path.join(root, ".agents", "skills", "testing"), { recursive: true });
  register(root, ".kaal", { kind: "skill", name: "testing", location: ".agents/skills/testing" });
  const after = capabilities(kaalDir);
  assert.deepEqual(
    after.available.filter((c) => c.registered).map((c) => c.name),
    ["testing"],
  );
  assert.equal(after.available.length, names.length);
});

test("one authority: the Kernel Core installs is the file KAAL's graph holds, byte for byte", () => {
  const root = temp();
  init(root);
  assert.equal(
    fs.readFileSync(kernel(root), "utf8"),
    fs.readFileSync(new URL(`../graph/${KERNEL_FILE}`, import.meta.url), "utf8"),
  );
});
