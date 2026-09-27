import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { defectErrors, readDefects, recordDefect, resolveDefect } from "./defects.js";
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
  assert.throws(() => recordDefect(dir, "no-observation", { ...leak(), observation: "\n" }), /observation is required/);
  assert.deepEqual(fs.readdirSync(dir), ["leaks-temp-files"]);
});

test("resolves a defect beside its record, which stays as it was, and only once", () => {
  const dir = emptyDir();
  const file = recordDefect(dir, "leaks-temp-files", leak());
  const before = fs.readFileSync(file, "utf8");
  const resolved = resolveDefect(dir, "leaks-temp-files", { by: "a finally block", how: observation("repair") });
  assert.equal(resolved, path.join(dir, "leaks-temp-files", "resolved.md"));
  assert.equal(fs.readFileSync(file, "utf8"), before);
  assert.deepEqual(readDefects(dir)[0]?.resolved, "a finally block");
  assert.throws(() => resolveDefect(dir, "leaks-temp-files", { by: "again", how: "again" }), /already resolved/);
  assert.throws(() => resolveDefect(dir, "never-recorded", { by: "x", how: "y" }), /no such defect is recorded/);
  assert.throws(() => resolveDefect(dir, "leaks-temp-files", { by: "", how: "y" }), /by is required/);
});

test("reads every defect in name order, open or resolved", () => {
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
      resolved: "the printer flushes its buffer before it closes",
    },
  ]);
  assert.deepEqual(readDefects(path.join(emptyDir(), "none")), []);
});

test("a defects directory holds only complete defect records", () => {
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
      "README.md: not a defect; each defect is a directory named with lowercase letters, digits and single hyphens",
      "incomplete/defect.md: observed is required",
      "incomplete/defect.md: what was observed is required",
      "no-record/notes.md: a defect holds only defect.md and, once repaired, resolved.md",
      "no-record/defect.md: missing",
      "stray/notes.md: a defect holds only defect.md and, once repaired, resolved.md",
    ],
  );
});

test("records, resolves and checks defects from the command line", () => {
  const dir = emptyDir();
  const run = (script: string, ...args: string[]) =>
    spawnSync(process.execPath, [TSX, path.join(SCRIPTS, script), ...args], { encoding: "utf8" });
  const recorded = run(
    "record.ts",
    dir,
    "leaks-temp-files",
    "--holds",
    leak().holds,
    "--observed",
    leak().observed,
    observationFile("leak"),
  );
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(run("check.ts", dir).stdout, "leaks-temp-files: open\n");
  const resolved = run("resolve.ts", dir, "leaks-temp-files", "--by", "a finally block", observationFile("repair"));
  assert.equal(resolved.status, 0, resolved.stderr);
  assert.equal(run("check.ts", dir).stdout, "leaks-temp-files: resolved by a finally block\n");
  assert.equal(run("record.ts", dir, "leaks-temp-files").status, 2);
  const again = run("resolve.ts", dir, "leaks-temp-files", "--by", "again", observationFile("repair"));
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already resolved/);
  assert.equal(run("check.ts", defectsDir("broken")).status, 1);
});
