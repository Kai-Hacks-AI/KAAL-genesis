import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ideaErrors, readIdeas } from "../skills/managing-ideas/scripts/ideas.js";
import { kaal } from "./test-data.js";

/** The subject of this file's cases about KAAL itself. */
const KAAL = kaal();
const IDEAS = path.join(KAAL, "ideas");
const MODULAR = path.join(IDEAS, "modular-kaal", "idea.md");

// Why: brain/learning/genesis/26/09/27/04/nodes/managing-ideas.md
test("KAAL keeps complete Ideas in ideas/, beginning with the modular-KAAL possibility without adopting it", () => {
  assert.ok(fs.lstatSync(IDEAS, { throwIfNoEntry: false })?.isDirectory(), "ideas/ is missing");
  assert.deepEqual(ideaErrors(IDEAS), []);
  assert.deepEqual(readIdeas(IDEAS), [
    {
      name: "composable-capabilities",
      idea: "KAAL could be assembled from independently birthable capability packages, with Genesis composing a selected configuration of required dependencies and optional integrations and establishing that configuration's initial sealed Regression R0",
    },
    {
      name: "modular-kaal",
      idea: "KAAL can become modular through packages whose dependencies close the selected capability composition",
    },
    {
      name: "release-management",
      idea: "KAAL's protected main could become its release boundary, where a kaal/<name> line whose next Regression is demonstrated through FAR is sealed, released and versioned",
    },
    {
      name: "we-can-go-far",
      idea: "KAAL's forward planning and testing loop could connect with a backward loop of worked evidence, learning and refactoring, remembered provisionally as WE CAN GO FAR",
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
