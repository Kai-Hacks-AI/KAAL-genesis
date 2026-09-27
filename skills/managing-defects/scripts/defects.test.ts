import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { defectErrors, readDefects, recordDefect } from "./defects.js";
import { defectsDir, emptyDir, observation, observationFile } from "./test-data.js";

const TSX = fileURLToPath(import.meta.resolve("tsx/cli"));
const SCRIPTS = fileURLToPath(new URL("./", import.meta.url));

const leak = () => ({
  holds: "the check leaves nothing behind",
  observed: "the second run of the check, on Linux",
  observation: observation("leak"),
});

test("records a defect as what should hold, where it was observed not to, and what was observed", () => {
  const dir = emptyDir();
  const file = recordDefect(dir, "leaks-temp-files", leak());
  assert.equal(file, path.join(dir, "leaks-temp-files", "defect.md"));
  assert.equal(
    fs.readFileSync(file, "utf8"),
    fs.readFileSync(path.join(defectsDir("defects"), "leaks-temp-files", "defect.md"), "utf8"),
  );
  assert.deepEqual(readDefects(dir), [
    {
      name: "leaks-temp-files",
      holds: "the check leaves nothing behind",
      observed: "the second run of the check, on Linux",
    },
  ]);
});

test("never records a defect twice, and refuses a record without its name, what should hold, where, or what was observed", () => {
  const dir = emptyDir();
  const file = recordDefect(dir, "leaks-temp-files", leak());
  const before = fs.readFileSync(file, "utf8");
  assert.throws(() => recordDefect(dir, "leaks-temp-files", { ...leak(), holds: "else" }), /already recorded/);
  assert.equal(fs.readFileSync(file, "utf8"), before);
  assert.throws(() => recordDefect(dir, "Leaks Temp", leak()), /lowercase letters, digits and single hyphens/);
  assert.throws(() => recordDefect(dir, "no-holds", { ...leak(), holds: " " }), /holds is required/);
  assert.throws(() => recordDefect(dir, "no-where", { ...leak(), observed: "" }), /observed is required/);
  for (const reserved of ["con", "nul", "com1", "lpt9"])
    assert.throws(() => recordDefect(dir, reserved, leak()), /never a name Windows reserves/);
  assert.throws(() => recordDefect(dir, "no-observation", { ...leak(), observation: "\n" }), /observation is required/);
  assert.deepEqual(fs.readdirSync(dir), ["leaks-temp-files"]);
});

test("reads every defect in name order, with no state of its own", () => {
  assert.deepEqual(readDefects(defectsDir("defects")), [
    {
      name: "leaks-temp-files",
      holds: "the check leaves nothing behind",
      observed: "the second run of the check, on Linux",
    },
    {
      name: "loses-a-line",
      holds: "a report keeps every line it was given",
      observed: "a report of three lines, printed with two",
    },
  ]);
  assert.deepEqual(readDefects(path.join(emptyDir(), "none")), []);
});

test("a defects directory holds only complete defect records, and leaves the files beside them alone", () => {
  assert.deepEqual(defectErrors(defectsDir("defects")), []);
  const dir = defectsDir("broken");
  assert.deepEqual(
    defectErrors(dir).map((e) =>
      e
        .slice(dir.length + 1)
        .split(path.sep)
        .join("/"),
    ),
    [
      "incomplete/defect.md: observed is required",
      "incomplete/defect.md: what was observed is required",
      "no-record/notes.md: a defect holds only defect.md",
      "no-record/defect.md: missing",
      "not_a_name: not a defect; each defect is a directory named with lowercase letters, digits and single hyphens, never a name Windows reserves such as con or nul",
      "stray/notes.md: a defect holds only defect.md",
    ],
  );
});

test("records and checks defects from the command line", () => {
  const dir = emptyDir();
  const run = (script: string, ...args: string[]) =>
    spawnSync(process.execPath, [TSX, path.join(SCRIPTS, script), ...args], { encoding: "utf8" });
  const recorded = run(
    "record.ts",
    dir,
    "loses-a-line",
    "--holds",
    "a report keeps every line it was given",
    "--observed",
    "a report of three lines, printed with two",
    observationFile("loses-a-line"),
  );
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(
    fs.readFileSync(path.join(dir, "loses-a-line", "defect.md"), "utf8"),
    fs.readFileSync(path.join(defectsDir("defects"), "loses-a-line", "defect.md"), "utf8"),
  );
  assert.equal(run("check.ts", dir).stdout, "loses-a-line: a report keeps every line it was given\n");
  const again = run("record.ts", dir, "loses-a-line", "--holds", "x", "--observed", "y", observationFile("leak"));
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already recorded/);
  assert.equal(run("record.ts", dir, "leaks-temp-files", "--holds", "x", observationFile("leak")).status, 2);
  assert.equal(run("check.ts", defectsDir("broken")).status, 1);
});
