import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readRequirements, recordRequirement, requirementErrors } from "./requirements.js";

const TSX = fileURLToPath(import.meta.resolve("tsx/cli"));
const TSX_LOADER = fileURLToPath(import.meta.resolve("tsx"));
const SCRIPTS = fileURLToPath(new URL("./", import.meta.url));
const CRASH = fileURLToPath(new URL("../test-data/crash-on-write.mjs", import.meta.url));
const emptyDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "requirements-"));
const keepsLines = () => ({
  holds: "a report keeps every line it was given",
  statement:
    "Every line handed to a report is printed, in order, once. How the report is laid out is not part of this.",
});

test("records a Requirement as what is committed to hold and the statement of that commitment", () => {
  const dir = emptyDir();
  const file = recordRequirement(dir, "keeps-every-line", keepsLines());
  assert.equal(file, path.join(dir, "keeps-every-line", "requirement.md"));
  assert.equal(
    fs.readFileSync(file, "utf8"),
    `---\nholds: a report keeps every line it was given\n---\n\n${keepsLines().statement}\n`,
  );
  assert.deepEqual(readRequirements(dir), [{ name: "keeps-every-line", holds: keepsLines().holds }]);
});

test("never rewrites a recorded commitment, and refuses a record without its portable name, what it holds, or its statement", () => {
  const dir = emptyDir();
  const file = recordRequirement(dir, "keeps-every-line", keepsLines());
  const before = fs.readFileSync(file, "utf8");
  assert.throws(
    () => recordRequirement(dir, "keeps-every-line", { ...keepsLines(), holds: "a report keeps most lines" }),
    /already recorded/,
  );
  assert.equal(fs.readFileSync(file, "utf8"), before);
  assert.throws(
    () => recordRequirement(dir, "Keeps Lines", keepsLines()),
    /lowercase letters, digits and single hyphens/,
  );
  for (const reserved of ["con", "nul", "com1", "lpt9"])
    assert.throws(() => recordRequirement(dir, reserved, keepsLines()), /never a name Windows reserves/);
  assert.throws(() => recordRequirement(dir, "no-holds", { ...keepsLines(), holds: " " }), /holds is required/);
  assert.throws(
    () => recordRequirement(dir, "no-statement", { ...keepsLines(), statement: "\n" }),
    /statement is required/,
  );
  assert.deepEqual(fs.readdirSync(dir), ["keeps-every-line"]);
});

test("a failed write leaves no partial Requirement and its name remains recordable", (t) => {
  const dir = emptyDir();
  const write = fs.writeFileSync;
  t.mock.method(fs, "writeFileSync", (target: fs.PathOrFileDescriptor, data: string, options?: fs.WriteFileOptions) => {
    write(target, data.slice(0, 3), options);
    throw new Error("write failed on purpose");
  });
  assert.throws(() => recordRequirement(dir, "keeps-every-line", keepsLines()), /write failed on purpose/);
  t.mock.restoreAll();
  assert.deepEqual(fs.readdirSync(dir), []);
  recordRequirement(dir, "keeps-every-line", keepsLines());
  assert.deepEqual(requirementErrors(dir), []);
});

test("a crash leaves the Requirement's name free and its hidden staging directory reported", () => {
  const dir = emptyDir();
  const statement = path.join(dir, "statement.md");
  fs.writeFileSync(statement, keepsLines().statement);
  const crashed = spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(TSX_LOADER).href,
      "--import",
      pathToFileURL(CRASH).href,
      path.join(SCRIPTS, "record.ts"),
      dir,
      "keeps-every-line",
      "--holds",
      keepsLines().holds,
      statement,
    ],
    { encoding: "utf8" },
  );
  assert.equal(crashed.status, 9, crashed.stderr);
  assert.equal(fs.existsSync(path.join(dir, "keeps-every-line")), false);
  const [left] = fs.readdirSync(dir).filter((name) => name !== "statement.md");
  assert.match(left!, /^\.keeps-every-line\..*\.tmp$/);
  recordRequirement(dir, "keeps-every-line", keepsLines());
  assert.deepEqual(requirementErrors(dir), [
    `${path.join(dir, left!)}: not a Requirement; each Requirement is a directory named with lowercase letters, digits and single hyphens, never a name Windows reserves such as con or nul`,
  ]);
});

test("allows only what a Requirement holds, so it records no state and names nothing that proves it, and leaves guidance beside records alone", () => {
  const dir = emptyDir();
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "Local guidance.\n");
  recordRequirement(dir, "keeps-every-line", keepsLines());
  assert.deepEqual(requirementErrors(dir), []);

  fs.mkdirSync(path.join(dir, "incomplete"));
  fs.writeFileSync(path.join(dir, "incomplete", "requirement.md"), "---\nholds: ''\nstatus: accepted\n---\n");
  fs.mkdirSync(path.join(dir, "proven"));
  fs.writeFileSync(
    path.join(dir, "proven", "requirement.md"),
    "---\nholds: a report is printed\ntested-by: [scripts/report.test.ts]\n---\n\nA report is printed.\n",
  );
  fs.mkdirSync(path.join(dir, "stray"));
  fs.writeFileSync(path.join(dir, "stray", "notes.md"), "not a record\n");
  const relative = requirementErrors(dir).map((error) =>
    error
      .slice(dir.length + 1)
      .split(path.sep)
      .join("/"),
  );
  assert.deepEqual(relative, [
    "incomplete/requirement.md: holds is required",
    "incomplete/requirement.md: status is not a field of a Requirement, which records only holds",
    "incomplete/requirement.md: the statement is required",
    "proven/requirement.md: tested-by is not a field of a Requirement, which records only holds",
    "stray/notes.md: a Requirement holds only requirement.md",
    "stray/requirement.md: missing",
  ]);
});

test("records and checks Requirements from the command line", () => {
  const dir = emptyDir();
  const statement = path.join(dir, "statement.md");
  fs.writeFileSync(statement, keepsLines().statement);
  const run = (script: string, ...args: string[]) =>
    spawnSync(process.execPath, [TSX, path.join(SCRIPTS, script), ...args], { encoding: "utf8" });
  const recorded = run("record.ts", dir, "keeps-every-line", "--holds", keepsLines().holds, statement);
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(run("check.ts", dir).stdout, `keeps-every-line: ${keepsLines().holds}\n`);
  assert.equal(run("record.ts", dir, "keeps-every-line", "--holds", "else", statement).status, 1);
  assert.equal(run("record.ts", dir, "missing-holds", statement).status, 2);
  fs.writeFileSync(path.join(dir, "keeps-every-line", "notes.md"), "not a record\n");
  assert.equal(run("check.ts", dir).status, 1);
});
