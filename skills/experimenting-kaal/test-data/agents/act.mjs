// A child agent that changes its workspace: adds a file, edits one, removes one.
import fs from "node:fs";

fs.writeFileSync("seen.txt", "the child was here\n");
fs.appendFileSync("AGENTS.md", "edited by the child\n");
fs.rmSync(".kaal/notes.md");
