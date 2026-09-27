import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ideaErrors, readIdeas, recordIdea } from "./ideas.js";

const TSX = fileURLToPath(import.meta.resolve("tsx/cli"));
const TSX_LOADER = fileURLToPath(import.meta.resolve("tsx"));
const SCRIPTS = fileURLToPath(new URL("./", import.meta.url));
const CRASH = fileURLToPath(new URL("../test-data/crash-on-write.mjs", import.meta.url));
const emptyDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "ideas-"));
const modular = () => ({
  idea: "a system can compose itself from selected packages and their dependencies",
  context: "Package dependencies could close the capability graph without making selection a commitment.",
});

test("records an Idea as a possibility and the context needed to understand it", () => {
  const dir = emptyDir();
  const file = recordIdea(dir, "modular-system", modular());
  assert.equal(file, path.join(dir, "modular-system", "idea.md"));
  assert.match(
    fs.readFileSync(file, "utf8"),
    /^---\nidea: a system can compose itself[\s\S]*\n---\n\nPackage dependencies/,
  );
  assert.deepEqual(readIdeas(dir), [{ name: "modular-system", idea: modular().idea }]);
});

test("never records an Idea twice, and refuses a record without its portable name, possibility, or context", () => {
  const dir = emptyDir();
  const file = recordIdea(dir, "modular-system", modular());
  const before = fs.readFileSync(file, "utf8");
  assert.throws(() => recordIdea(dir, "modular-system", { ...modular(), idea: "something else" }), /already recorded/);
  assert.equal(fs.readFileSync(file, "utf8"), before);
  assert.throws(() => recordIdea(dir, "Modular System", modular()), /lowercase letters, digits and single hyphens/);
  for (const reserved of ["con", "nul", "com1", "lpt9"])
    assert.throws(() => recordIdea(dir, reserved, modular()), /never a name Windows reserves/);
  assert.throws(() => recordIdea(dir, "no-idea", { ...modular(), idea: " " }), /Idea is required/);
  assert.throws(() => recordIdea(dir, "no-context", { ...modular(), context: "\n" }), /context is required/);
  assert.deepEqual(fs.readdirSync(dir), ["modular-system"]);
});

test("a failed write leaves no partial Idea and its name remains recordable", (t) => {
  const dir = emptyDir();
  const write = fs.writeFileSync;
  t.mock.method(fs, "writeFileSync", (target: fs.PathOrFileDescriptor, data: string, options?: fs.WriteFileOptions) => {
    write(target, data.slice(0, 3), options);
    throw new Error("write failed on purpose");
  });
  assert.throws(() => recordIdea(dir, "modular-system", modular()), /write failed on purpose/);
  t.mock.restoreAll();
  assert.deepEqual(fs.readdirSync(dir), []);
  recordIdea(dir, "modular-system", modular());
  assert.deepEqual(ideaErrors(dir), []);
});

test("a crash during writing leaves the Idea's name free and exposes only invalid staging", () => {
  const dir = emptyDir();
  const context = path.join(dir, "context.md");
  fs.writeFileSync(context, modular().context);
  const crashed = spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(TSX_LOADER).href,
      "--import",
      pathToFileURL(CRASH).href,
      path.join(SCRIPTS, "record.ts"),
      dir,
      "modular-system",
      "--idea",
      modular().idea,
      context,
    ],
    { encoding: "utf8" },
  );
  assert.equal(crashed.status, 9, crashed.stderr);
  assert.equal(fs.existsSync(path.join(dir, "modular-system")), false);
  const [left] = fs.readdirSync(dir).filter((name) => name !== "context.md");
  assert.match(left!, /^\.modular-system\..*\.tmp$/);
  recordIdea(dir, "modular-system", modular());
  assert.deepEqual(ideaErrors(dir), [
    `${path.join(dir, left!)}: not an Idea; each Idea is a directory named with lowercase letters, digits and single hyphens, never a name Windows reserves such as con or nul`,
  ]);
});

test("checks complete records, refuses malformed ones, and leaves guidance beside Ideas alone", () => {
  const dir = emptyDir();
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "Local guidance.\n");
  recordIdea(dir, "modular-system", modular());
  assert.deepEqual(ideaErrors(dir), []);

  fs.mkdirSync(path.join(dir, "incomplete"));
  fs.writeFileSync(path.join(dir, "incomplete", "idea.md"), "---\nidea: ''\nstatus: accepted\n---\n");
  fs.mkdirSync(path.join(dir, "stray"));
  fs.writeFileSync(path.join(dir, "stray", "notes.md"), "not a record\n");
  const relative = ideaErrors(dir).map((error) =>
    error
      .slice(dir.length + 1)
      .split(path.sep)
      .join("/"),
  );
  assert.deepEqual(relative, [
    "incomplete/idea.md: idea is required",
    "incomplete/idea.md: status is not a field of an Idea, which records only idea",
    "incomplete/idea.md: context is required",
    "stray/notes.md: an Idea holds only idea.md",
    "stray/idea.md: missing",
  ]);
});

test("records and checks Ideas from the command line", () => {
  const dir = emptyDir();
  const context = path.join(dir, "context.md");
  fs.writeFileSync(context, modular().context);
  const run = (script: string, ...args: string[]) =>
    spawnSync(process.execPath, [TSX, path.join(SCRIPTS, script), ...args], { encoding: "utf8" });
  const recorded = run("record.ts", dir, "modular-system", "--idea", modular().idea, context);
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(run("check.ts", dir).stdout, `modular-system: ${modular().idea}\n`);
  assert.equal(run("record.ts", dir, "modular-system", "--idea", "else", context).status, 1);
  assert.equal(run("record.ts", dir, "missing-idea", context).status, 2);
});
