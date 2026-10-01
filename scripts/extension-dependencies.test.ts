import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// The dependency rule of a Skill, shown against the code KAAL has today.
// Why: change/adapters/26/10/01/02/architecture, brain/learning/adapters/26/10/01/02.
// A Skill is a directory holding SKILL.md, whichever folder holds it. It may depend on Core,
// which does not exist yet, so nothing here forbids reaching beyond the Skill's directory;
// it forbids reaching another Skill, an Extension or a concrete provider. That Genesis is no
// Core, that nothing imports it and that the modules under scripts/ are acyclic are not asserted:
// the last two are observations about today's code, and whether they are rules is not decided.

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

/** Whether `target` is `dir` or lies inside it. */
const inside = (dir: string, target: string): boolean => !path.relative(dir, target).startsWith("..");

/**
 * Every way a Skill depends on another Skill, on an Extension (machinery under one of `extensions`) or
 * on a concrete provider it names or runs. Reaching Core, which is not installed yet, is not one of them.
 */
function skillDependencies(skill: string, siblings: string[], extensions: string[]): string[] {
  const found: string[] = [];
  for (const file of typescript(skill)) {
    const source = fs.readFileSync(file, "utf8");
    const where = path.relative(path.dirname(skill), file).split(path.sep).join("/");
    for (const spec of relativeImports(source)) {
      const target = resolveImport(file, spec);
      if (siblings.some((other) => inside(other, target))) found.push(`${where} imports another Skill: ${spec}`);
      if (extensions.some((dir) => inside(dir, target))) found.push(`${where} imports an Extension: ${spec}`);
    }
    if (file.endsWith(".test.ts") || file.includes(`${path.sep}test-data`)) continue;
    if (/\b(?:execFileSync|execFile|spawnSync|spawn|execSync|exec)\(\s*["'`]git["'`]/.test(source))
      found.push(`${where} runs git`);
    if (/github/i.test(source)) found.push(`${where} names GitHub`);
  }
  return found;
}

const dependenciesOf = (skills: string[], extensions: string[]): string[][] =>
  skills.map((skill) =>
    skillDependencies(
      skill,
      skills.filter((s) => s !== skill),
      extensions,
    ),
  );

test("no Skill depends on another Skill, on an Extension or on Git or GitHub", () => {
  const skills = skillsIn("skills");
  assert.ok(skills.length > 1);
  // scripts/ is where today's Extensions are: each module there composes Skills or realizes a boundary, whichever role.
  for (const found of dependenciesOf(skills, [path.resolve("scripts")])) assert.deepEqual(found, []);
});

test("the rule is not vacuous: a Skill that imports a Skill or an Extension, runs git or names GitHub is found, and one that reaches Core is not", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-deps-"));
  const skills = ["a", "b", "c"].map((name) => path.join(root, "skills", name));
  for (const skill of skills) {
    fs.mkdirSync(path.join(skill, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(skill, "SKILL.md"), "---\nname: x\n---\n");
  }
  for (const dir of ["extensions", "core"]) fs.mkdirSync(path.join(root, dir));
  fs.writeFileSync(path.join(skills[0], "scripts/own.ts"), "export const own = 1;\n");
  fs.writeFileSync(path.join(root, "extensions/composes.ts"), "export const composed = 1;\n");
  fs.writeFileSync(path.join(root, "core/shared.ts"), "export const shared = 1;\n");
  fs.writeFileSync(
    path.join(skills[1], "scripts/bad.ts"),
    'import { own } from "../../a/scripts/own.js";\nimport { composed } from "../../../extensions/composes.js";\nimport { execFileSync } from "node:child_process";\nexecFileSync("git", []);\nconst h = "https://api.github.com";\n',
  );
  fs.writeFileSync(
    path.join(skills[2], "scripts/ok.ts"),
    'import { shared } from "../../../core/shared.js";\nexport const ok = shared;\n',
  );
  assert.deepEqual(
    dependenciesOf(skills, [path.join(root, "extensions")]).map((found) => found.length),
    [0, 4, 0],
  );
});
