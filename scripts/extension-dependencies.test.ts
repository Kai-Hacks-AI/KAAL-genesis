import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// The dependency rules of Core, Skill and Extension, shown against the code KAAL has today.
// Why: change/adapters/26/10/01/02/architecture, brain/learning/adapters/26/10/01/02.
// A Skill is a directory holding SKILL.md, whichever folder holds it; Core is the machinery
// that births KAAL; an Extension is everything else KAAL-specific, in either role, so no rule
// here classifies a module by its folder or by the role it plays.

/** The relative modules a source imports or re-exports, as written. */
const relativeImports = (source: string): string[] =>
  [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.[^"']*)["']/g)].map((m) => m[1]);

const typescript = (dir: string): string[] =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => path.join(e.parentPath, e.name));

/** Where an import written for a TypeScript module that Node spells `.js` lands. */
const resolveImport = (from: string, spec: string): string => {
  const target = path.resolve(path.dirname(from), spec);
  return target.endsWith(".js") ? target.slice(0, -3) + ".ts" : target;
};

/** The Skills under `root`: every directory holding SKILL.md. */
const skillsIn = (root: string): string[] =>
  fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, "SKILL.md")))
    .map((e) => path.join(root, e.name));

/** Every way a Skill reaches beyond itself: an import that leaves its directory, or a concrete provider it names or runs. */
function skillDependencies(skill: string): string[] {
  const found: string[] = [];
  for (const file of typescript(skill)) {
    const source = fs.readFileSync(file, "utf8");
    const where = path.relative(path.dirname(skill), file).split(path.sep).join("/");
    for (const spec of relativeImports(source)) {
      const target = resolveImport(file, spec);
      if (path.relative(skill, target).startsWith("..")) found.push(`${where} imports ${spec}`);
    }
    if (file.endsWith(".test.ts") || file.includes(`${path.sep}test-data`)) continue;
    if (/\b(?:execFileSync|execFile|spawnSync|spawn|execSync|exec)\(\s*["'`]git["'`]/.test(source))
      found.push(`${where} runs git`);
    if (/github/i.test(source)) found.push(`${where} names GitHub`);
  }
  return found;
}

test("no Skill depends on another Skill, on Core, on an Extension or on Git or GitHub", () => {
  const skills = skillsIn("skills");
  assert.ok(skills.length > 1);
  for (const skill of skills) assert.deepEqual(skillDependencies(skill), [], skill);
});

test("the rule is not vacuous: a Skill that imports out, runs git or names GitHub is found", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-deps-"));
  for (const name of ["a", "b"]) {
    fs.mkdirSync(path.join(root, name, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(root, name, "SKILL.md"), "---\nname: x\n---\n");
  }
  fs.writeFileSync(path.join(root, "a/scripts/own.ts"), "export const own = 1;\n");
  fs.writeFileSync(
    path.join(root, "b/scripts/bad.ts"),
    'import { own } from "../../a/scripts/own.js";\nimport { execFileSync } from "node:child_process";\nexecFileSync("git", []);\nconst h = "https://api.github.com";\n',
  );
  assert.deepEqual(
    skillsIn(root).map((s) => skillDependencies(s).length),
    [0, 3],
  );
});

/** Everything under `scripts/` that is not a test: Core, and the Extensions, each module by what it imports. */
const machinery = (): Map<string, string[]> =>
  new Map(
    typescript("scripts")
      .filter((f) => !f.endsWith(".test.ts"))
      .map((file) => [
        path.relative(".", file).split(path.sep).join("/"),
        relativeImports(fs.readFileSync(file, "utf8")).map((s) =>
          path.relative(".", resolveImport(file, s)).split(path.sep).join("/"),
        ),
      ]),
  );

const CORE = "scripts/genesis.ts";

test("Core depends on Skills only, and nothing depends on Core", () => {
  const graph = machinery();
  const core = graph.get(CORE);
  assert.ok(core?.length);
  for (const target of core) assert.match(target, /^skills\/[^/]+\//, `Core imports ${target}`);
  for (const [file, imports] of graph) assert.ok(!imports.includes(CORE), `${file} imports Core`);
  for (const skill of skillsIn("skills"))
    for (const file of typescript(skill))
      assert.ok(
        !relativeImports(fs.readFileSync(file, "utf8")).some((s) =>
          resolveImport(file, s).endsWith("scripts/genesis.ts"),
        ),
      );
});

test("Extensions depend on Skills and on one another without a cycle", () => {
  const graph = machinery();
  const mine = (target: string) => graph.has(target);
  const state = new Map<string, "open" | "done">();
  const walk = (file: string, trail: string[]) => {
    if (state.get(file) === "done") return;
    assert.notEqual(state.get(file), "open", `cycle: ${[...trail, file].join(" -> ")}`);
    state.set(file, "open");
    for (const target of graph.get(file) ?? []) if (mine(target)) walk(target, [...trail, file]);
    state.set(file, "done");
  };
  for (const file of graph.keys()) walk(file, []);
  assert.ok(state.size > 5);
});
