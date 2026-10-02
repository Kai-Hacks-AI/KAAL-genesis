// Loads named test data from ../test-data so test cases hold no data themselves.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = fileURLToPath(new URL("../test-data/", import.meta.url));

/** The path of a named piece of test data. */
export const data = (...name: string[]) => path.join(DATA, ...name);

/** A child agent command from test-data/agents, run with the Node running the tests. */
export const agent = (name: string) => [process.execPath, data("agents", `${name}.mjs`)];

/** A new, empty directory. */
export const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), "experimenting-kaal-test-"));

/** The question every test asks, as exact bytes. */
export const question = () => fs.readFileSync(data("question.md"), "utf8");

/** The `lighthouse` host copied into `into`, which is made if needed, and where the copy is. */
export function copyHost(into: string): string {
  const host = path.join(into, "lighthouse");
  fs.cpSync(data("hosts", "lighthouse"), host, { recursive: true });
  return host;
}
