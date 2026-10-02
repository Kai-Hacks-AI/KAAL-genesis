import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HELPERS = fileURLToPath(new URL("./", import.meta.url));
const sources = fs.readdirSync(HELPERS).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

test("helpers import only Node and each other, nothing of Core, Skills, the graph or the rest of this repository", () => {
  assert.ok(sources.length > 0);
  for (const file of sources)
    for (const [, specifier] of fs.readFileSync(path.join(HELPERS, file), "utf8").matchAll(/\bfrom\s+"([^"]+)"/g))
      assert.match(specifier, /^(node:|\.\/[a-z-]+\.js$)/, `${file} imports ${specifier}`);
});

test("helpers know nothing of KAAL: its name appears in none of them", () => {
  for (const file of sources) assert.doesNotMatch(fs.readFileSync(path.join(HELPERS, file), "utf8"), /kaal/i, file);
});
