// Loads named test data from ../test-data so test cases hold no data themselves.
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = fileURLToPath(new URL("../test-data/", import.meta.url));

/** A read-only testing root in test-data/roots, holding `plan.json` and its Suites. */
export function rootData(name: string): string {
  return path.join(DATA, "roots", name);
}

/** A read-only candidate in test-data/candidates. */
export function candidateData(name: string): string {
  return path.join(DATA, "candidates", name);
}

/** A read-only plan file in test-data/plans. */
export function planData(name: string): string {
  return path.join(DATA, "plans", `${name}.json`);
}
