import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { candidate } from "../../../../../../26/09/26/01/test/candidate.js";

// What is tested is the candidate's own check definitions, which are provider specific: a check is a named job or
// workflow, and its name is the realization's way of stating what it asserts. The words below (workflow, job,
// matrix) are therefore the realization's, never the Requirement's.
const ENVIRONMENT = /-(linux|windows|macos)$/;
// A check asserts its environment when what it asserts is that KAAL's tests pass there.
const ASSERTS_ENVIRONMENT = /^(push-)?test-/;

/** The literal names of the candidate's workflows and jobs, from lines `name:` at workflow or job level. */
function checkNames(): string[] {
  const dir = candidate(".github/workflows");
  const names: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".yml"))) {
    for (const line of readFileSync(`${dir}/${file}`, "utf8").split(/\r?\n/)) {
      const match = /^ {0,4}name:\s*(.+?)\s*$/.exec(line);
      if (match) names.push(match[1].replace(/^["']|["']$/g, ""));
    }
  }
  return names;
}

test(
  "a check names its environment only where the environment is part of what it asserts",
  { tests: { requirement: ["check-named-by-what-it-asserts"] } },
  () => {
    const names = checkNames();
    assert.ok(names.length > 0, "the candidate defines checks to judge");
    // A name built from the environment itself, such as a matrix over it, is already about the environment.
    const literal = names.filter((name) => !name.includes("${{"));
    const misnamed = literal.filter((name) => ENVIRONMENT.test(name) && !ASSERTS_ENVIRONMENT.test(name));
    assert.deepEqual(misnamed, []);
  },
);
