// Loads named test data from ../test-data so test cases hold no data themselves.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = fileURLToPath(new URL("../test-data/", import.meta.url));

/** Contents of an expected output file in test-data/expected. */
export function expected(name: string): string {
  return fs.readFileSync(path.join(DATA, "expected", `${name}.md`), "utf8");
}

/** A new, empty directory to create an anchor in. */
export function scratch(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "testing-anchor-"));
}

/** Named run data from test-data/runs: `cases`, a testing state's cases; `reports`, what an executor reported of them; `observed`, what a run observed. */
export function runData(name: "cases" | "reports" | "observed"): unknown {
  return JSON.parse(fs.readFileSync(path.join(DATA, "runs", `${name}.json`), "utf8"));
}
