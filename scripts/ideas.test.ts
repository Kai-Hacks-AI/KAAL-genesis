import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ideaErrors, readIdeas } from "../skills/managing-ideas/scripts/ideas.js";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const IDEAS = path.join(REPO, "ideas");
const MODULAR = path.join(IDEAS, "modular-kaal", "idea.md");

// Why: brain/learning/genesis/26/09/27/04/nodes/managing-ideas.md
test("KAAL keeps complete Ideas in ideas/, beginning with the modular-KAAL possibility without adopting it", () => {
  assert.ok(fs.lstatSync(IDEAS, { throwIfNoEntry: false })?.isDirectory(), "ideas/ is missing");
  assert.deepEqual(ideaErrors(IDEAS), []);
  assert.deepEqual(readIdeas(IDEAS), [
    {
      name: "modular-kaal",
      idea: "KAAL can become modular through packages whose dependencies close the selected capability composition",
    },
  ]);
  const record = fs.readFileSync(MODULAR, "utf8");
  for (const meaning of [
    "Package dependencies could provide the dependency mechanism.",
    "capability meaning remains in KAAL and BRAIN",
    "birth inherits active understanding",
    "does not commit KAAL",
  ])
    assert.match(record, new RegExp(meaning));
});
