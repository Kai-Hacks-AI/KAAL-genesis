import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { main } from "./run.js";
import { agent, copyHost, data, scratch } from "./test-data.js";

/** `main`'s result with its console output kept out of the test report. */
function quietly(argv: string[]): { code: number; out: string; err: string } {
  const log = console.log;
  const error = console.error;
  let out = "";
  let err = "";
  console.log = (...parts: unknown[]) => void (out += `${parts.join(" ")}\n`);
  console.error = (...parts: unknown[]) => void (err += `${parts.join(" ")}\n`);
  try {
    return { code: main(argv), out, err };
  } finally {
    console.log = log;
    console.error = error;
  }
}

test("run.ts retains a Run and exits 0 however the child ended", () => {
  const root = scratch();
  const host = copyHost(root);
  const arguments_ = (name: string, command: string[]) => [
    "--host",
    host,
    "--instruction",
    data("question.md"),
    "--evidence",
    path.join(root, name),
    "--capability",
    "Read",
    "--timeout",
    "30",
    "--",
    ...command,
  ];

  const ok = quietly(arguments_("ok", agent("observe")));
  assert.equal(ok.code, 0);
  assert.match(ok.out, /child exit 0/);
  const failed = quietly(arguments_("failed", agent("fail")));
  assert.equal(failed.code, 0);
  assert.match(failed.out, /child exit 3/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "ok", "run.json"), "utf8")).capabilities, ["Read"]);
});

test("run.ts exits 1 when no Run can be retained and 2 on bad usage", () => {
  const root = scratch();
  const host = copyHost(root);
  const missing = quietly([
    "--host",
    path.join(root, "absent"),
    "--instruction",
    data("question.md"),
    "--evidence",
    path.join(root, "e"),
    "--",
    ...agent("observe"),
  ]);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /host is not a directory/);
  assert.equal(quietly(["--host", host]).code, 2);
  assert.equal(
    quietly(["--host", host, "--instruction", data("question.md"), "--evidence", path.join(root, "e")]).code,
    2,
  );
});
