import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { caseSuites, fileCases, linkErrors, PLAN, repoCases, testedDefects } from "./links.js";
import { regressionErrors } from "./regression.js";
import { kaal, regressionCandidate, regressionTrusted } from "./test-data.js";

/** The subject of this file's cases about KAAL itself. */
const KAAL = kaal();
const CASES = "scripts/cases.test.ts";
const GREETING = "brain/learning/k/26/01/01/01/nodes/greeting.md";
const GREETS_LINK = `// Why: ${GREETING}\ntest("greets"`;

/** A scratch copy of the trusted fixture, whose links are coherent, with `file` rewritten by `change`. */
function changed(file: string, change: (text: string) => string): string {
  const repo = regressionCandidate("kept");
  const at = path.join(repo, file);
  const before = fs.readFileSync(at, "utf8");
  const after = change(before);
  assert.notEqual(after, before, `the change to ${file} changes nothing`);
  fs.writeFileSync(at, after);
  return repo;
}

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("links hold from the files alone: every case points at stated commitments, and several cases may prove one", () => {
  assert.deepEqual(linkErrors(regressionTrusted()), []);
  const cases = fileCases(CASES, fs.readFileSync(path.join(regressionTrusted(), CASES), "utf8"));
  assert.deepEqual(
    cases.filter((c) => c.places.includes("src/add.ts")).map((c) => c.title),
    ["adds", "adds as its fixture says"],
  );
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a case may point at several commitments, one link each", () => {
  const repo = changed(CASES, (text) => text.replace(GREETS_LINK, `// Why: src/add.ts\n${GREETS_LINK}`));
  assert.deepEqual(linkErrors(repo), []);
  const greets = fileCases(CASES, fs.readFileSync(path.join(repo, CASES), "utf8")).find((c) => c.title === "greets");
  assert.deepEqual(greets?.places, ["src/add.ts", GREETING]);
});

/** Where the greeting's case is kept, and what it relates to: the commitments it helps prove and the defects it tests. */
function greetingCase(repo: string): { file: string; title: string; places: string[]; defects: string[] } {
  const [found, ...more] = repoCases(repo).filter((c) => c.places.includes(GREETING));
  assert.ok(found && !more.length, "exactly one case proves the greeting");
  const tested = testedDefects(repo).tested.find((t) => t.file === found.file && t.title === found.title);
  return { ...found, defects: tested?.defects ?? [] };
}

// Why: brain/learning/genesis/26/09/27/03/nodes/case.md
test("a case moved to another file and retitled keeps every relation it states: nothing finds them by its address", () => {
  const before = greetingCase(regressionCandidate("tested"));
  const after = greetingCase(regressionCandidate("moved"));
  assert.deepEqual(
    [before, after].map(({ file, title }) => `${file}: ${title}`),
    ["scripts/cases.test.ts: greets", "scripts/greetings.test.ts: greets with hello"],
  );
  assert.deepEqual(
    [before, after].map(({ places, defects }) => ({ places, defects })),
    [
      { places: [GREETING], defects: ["defects/greets-no-one"] },
      { places: [GREETING], defects: ["defects/greets-no-one"] },
    ],
  );
  assert.deepEqual(linkErrors(regressionCandidate("moved")), []);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a case whose link disappears is refused, and so is the commitment it leaves without a case", () => {
  const repo = changed(CASES, (text) => text.replace(`// Why: ${GREETING}\n`, ""));
  assert.deepEqual(linkErrors(repo), [
    `${CASES}: "greets" says no commitment it helps prove`,
    `${GREETING}: the plan says its cases show it, but no case points at it`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a link redirected to another commitment leaves its own commitment without a case", () => {
  const repo = changed(CASES, (text) => text.replace(GREETS_LINK, GREETS_LINK.replace(GREETING, "src/add.ts")));
  assert.deepEqual(linkErrors(repo), [`${GREETING}: the plan says its cases show it, but no case points at it`]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a link to a commitment the plan does not state is refused, whether or not its place exists", () => {
  for (const place of ["brain/learning/k/26/01/01/01/nodes/unknown.md", "src/greet.ts"]) {
    const repo = changed(CASES, (text) => text.replace(GREETS_LINK, GREETS_LINK.replace(GREETING, place)));
    assert.deepEqual(linkErrors(repo), [
      `${CASES}: "greets" points at ${place}, which the plan does not state`,
      `${GREETING}: the plan says its cases show it, but no case points at it`,
    ]);
  }
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a link that belongs to no case is refused: one moved away from its case, or not written as a link", () => {
  const moved = changed(CASES, (text) => text.replace(GREETS_LINK, GREETS_LINK.replace("\ntest(", "\n\ntest(")));
  assert.deepEqual(linkErrors(moved), [
    `${CASES}:12: a link that belongs to no case, written as "// Why: <place>"`,
    `${CASES}: "greets" says no commitment it helps prove`,
    `${GREETING}: the plan says its cases show it, but no case points at it`,
  ]);
  const miswritten = changed(CASES, (text) => text.replace(`// Why: ${GREETING}`, `//Why: ${GREETING}`));
  assert.deepEqual(
    linkErrors(miswritten)[0],
    `${CASES}:12: a link that belongs to no case, written as "// Why: <place>"`,
  );
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a case whose title cannot be read is refused, since no link can follow it", () => {
  const repo = changed(CASES, (text) => text.replace('test("adds", () => {', "test(`adds`, () => {"));
  assert.deepEqual(linkErrors(repo), [
    `${CASES}:7: a link that belongs to no case, written as "// Why: <place>"`,
    `${CASES}:8: a case whose title cannot be read, so no link can follow it`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a commitment whose place states nothing is refused", () => {
  assert.deepEqual(linkErrors(regressionCandidate("misplaced")), [
    "brain/learning/k/26/01/01/01/nodes/parting.md: the plan names it, but nothing is stated there",
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a commitment whose place is outside the repository is refused, even where a file exists", () => {
  assert.deepEqual(linkErrors(regressionCandidate("outside")), [
    "/etc/passwd: the plan names it, but it is not a place inside the repository",
    "../trusted/src/add.ts: the plan names it, but it is not a place inside the repository",
    "{/etc/passwd,missing}: the plan names it, but it is not a place inside the repository",
  ]);
  const repo = regressionCandidate("kept");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "kaal-outside-"));
  fs.writeFileSync(path.join(outside, "linked.ts"), "export {};\n");
  fs.symlinkSync(outside, path.join(repo, "src", "out"), "junction");
  const plan = path.join(repo, PLAN);
  fs.writeFileSync(
    plan,
    fs
      .readFileSync(plan, "utf8")
      .replace(/^2\. .*$/m, "$&\n3. Linked. Stated in `src/out/linked.ts`. Shown by its cases."),
  );
  assert.deepEqual(linkErrors(repo), [
    "src/out/linked.ts: the plan names it, but it is not a place inside the repository",
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a plan says what shows each commitment, and cases always do: another check can only add to them", () => {
  const silent = changed(PLAN, (text) => text.replace("`src/add.ts`. Shown by its cases.", "`src/add.ts`."));
  assert.deepEqual(linkErrors(silent), ["src/add.ts: the plan does not say what shows it"]);
  const unknown = changed(PLAN, (text) =>
    text.replace("`src/add.ts`. Shown by its cases.", "`src/add.ts`. Shown by its cases and hope."),
  );
  assert.deepEqual(linkErrors(unknown), ["src/add.ts: the plan says hope show it, which is not a check KAAL knows"]);
  const both = changed(PLAN, (text) =>
    text.replace("`src/add.ts`. Shown by its cases.", "`src/add.ts`. Shown by its cases and the seal checks."),
  );
  assert.deepEqual(linkErrors(both), []);
  // The seal checks do not say which commitments they show, so they cannot stand in for cases, even for a new commitment.
  const sealed = changed(PLAN, (text) =>
    text.replace(/^2\. .*$/m, "$&\n3. Sealed. Stated in `src/greet.ts`. Shown by the seal checks."),
  );
  assert.deepEqual(linkErrors(sealed), [
    "src/greet.ts: the plan says only the seal checks show it, but only cases say which commitment they show",
  ]);
});

/** A copy of the trusted fixture that also keeps a skill, whose cases prove its SKILL.md. */
function withSkill(caseSource: string): string {
  const repo = regressionCandidate("kept");
  const skill = path.join(repo, "skills", "demo");
  fs.mkdirSync(path.join(skill, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(skill, "SKILL.md"), "---\nname: demo\n---\n\nIts script says hello.\n");
  fs.writeFileSync(path.join(skill, "scripts", "demo.test.ts"), caseSource);
  const pkg = path.join(repo, "package.json");
  fs.writeFileSync(
    pkg,
    fs.readFileSync(pkg, "utf8").replace("scripts/*.test.ts", "skills/*/scripts/*.test.ts scripts/*.test.ts"),
  );
  const plan = path.join(repo, PLAN);
  fs.writeFileSync(
    plan,
    fs
      .readFileSync(plan, "utf8")
      .replace(/^2\. .*$/m, "$&\n3. Skills. Stated in each `skills/*/SKILL.md`. Shown by its cases."),
  );
  return repo;
}

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a skill's case proves its own SKILL.md without a link, and never points outside its skill", () => {
  const plain = 'import test from "node:test";\n\ntest("says hello", () => {});\n';
  assert.deepEqual(linkErrors(withSkill(plain)), []);
  const linked = withSkill(plain.replace("\ntest(", `\n// Why: ${GREETING}\ntest(`));
  assert.deepEqual(linkErrors(linked), [
    `skills/demo/scripts/demo.test.ts: "says hello" is a skill's case, so it points at nothing outside its skill`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("each skill's SKILL.md needs a case of its own: another skill's cases do not show it", () => {
  const repo = withSkill('import test from "node:test";\n\ntest("says hello", () => {});\n');
  fs.mkdirSync(path.join(repo, "skills", "silent"));
  fs.writeFileSync(
    path.join(repo, "skills", "silent", "SKILL.md"),
    "---\nname: silent\n---\n\nIts script says nothing.\n",
  );
  assert.deepEqual(linkErrors(repo), [
    "skills/silent/SKILL.md: the plan says its cases show it, but the skill has none",
  ]);
  // A file of cases that holds none is no case of its own.
  fs.mkdirSync(path.join(repo, "skills", "silent", "scripts"));
  fs.writeFileSync(path.join(repo, "skills", "silent", "scripts", "silent.test.ts"), "export {};\n");
  assert.deepEqual(linkErrors(repo), [
    "skills/silent/SKILL.md: the plan says its cases show it, but the skill has none",
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("a candidate that would leave the next accepted regression with links it cannot read is refused", () => {
  const candidate = changed(CASES, (text) => text.replace(`// Why: ${GREETING}\n`, ""));
  const errors = regressionErrors(regressionTrusted(), candidate, "b".repeat(64));
  assert.deepEqual(errors.slice(0, 2), [
    `as the next accepted regression, ${CASES}: "greets" says no commitment it helps prove`,
    `as the next accepted regression, ${GREETING}: the plan says its cases show it, but no case points at it`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("npm run links:check checks a checkout's links by its command line, and fails when they do not hold", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(KAAL, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(pkg.scripts["links:check"], "tsx scripts/check-links.ts");
  const tsx = fileURLToPath(import.meta.resolve("tsx/cli"));
  const run = (repo: string) =>
    spawnSync(process.execPath, [tsx, path.join(KAAL, "scripts", "check-links.ts"), repo], {
      encoding: "utf8",
      env: { ...process.env, NODE_TEST_CONTEXT: undefined },
    });
  const holds = run(regressionTrusted());
  assert.equal(holds.status, 0, holds.stderr);
  const broken = run(changed(CASES, (text) => text.replace(`// Why: ${GREETING}\n`, "")));
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /"greets" says no commitment it helps prove/);
});

// Why: brain/learning/genesis/26/09/26/03/nodes/testing.md
test("KAAL's own testing links hold from its files", () => {
  assert.deepEqual(linkErrors(KAAL), []);
});

const SUITED = `// Suite: suites/greeting.md\n${GREETS_LINK}`;

/** A scratch copy of the trusted fixture whose greeting case belongs to a suite, with its cases rewritten by `change`. */
function suited(change: (text: string) => string = (text) => text): string {
  const repo = regressionCandidate("suited");
  const at = path.join(repo, CASES);
  fs.writeFileSync(at, change(fs.readFileSync(at, "utf8")));
  return repo;
}

// Why: brain/learning/genesis/26/09/27/06/nodes/suite.md
test("a case says beside it which suites it belongs to, apart from the commitments it helps prove, and a suite's cases are found from the cases", () => {
  const repo = suited();
  assert.deepEqual(linkErrors(repo), []);
  assert.deepEqual(
    caseSuites(repo).filter((c) => c.suites.length),
    [{ file: CASES, title: "greets", suites: ["suites/greeting.md"] }],
  );
  // A suite line is no link to a commitment: the case's commitments are read as they were.
  assert.deepEqual(repoCases(repo).find((c) => c.title === "greets")?.places, [GREETING]);
});

// Why: brain/learning/genesis/26/09/27/06/nodes/suite.md
test("a suite line that belongs to no case, or names no suite stated in its own place, is refused, while a suite no case belongs to yet is still that suite", () => {
  const stray = [`${CASES}:12: a suite line that belongs to no case, written as "// Suite: <place>"`];
  assert.deepEqual(linkErrors(suited((text) => text.replace(SUITED, SUITED.replace("\n// Why", "\n\n// Why")))), stray);
  assert.deepEqual(linkErrors(suited((text) => text.replace("// Suite:", "//Suite:"))), stray);
  assert.deepEqual(linkErrors(suited((text) => text.replace("suites/greeting.md\n", "suites/farewell.md\n"))), [
    `${CASES}: "greets" belongs to suites/farewell.md: no suite is stated there`,
  ]);
  assert.deepEqual(
    linkErrors(suited((text) => text.replace("// Suite: suites/greeting.md", `// Suite: ${GREETING}`))),
    [`${CASES}: "greets" belongs to ${GREETING}: not a suite's place, which is suites/<name>.md`],
  );
  // A name Windows reserves for a device cannot be kept there, whatever its extension.
  assert.deepEqual(linkErrors(suited((text) => text.replace("suites/greeting.md\n", "suites/con.md\n"))), [
    `${CASES}: "greets" belongs to suites/con.md: a suite's name "con" is reserved on Windows`,
  ]);
  // Its concern, not its cases, gives a suite its meaning: one whose last case left it is still stated, and holds.
  assert.deepEqual(linkErrors(suited((text) => text.replace("// Suite: suites/greeting.md\n", ""))), []);
  const misnamed = suited();
  fs.writeFileSync(path.join(misnamed, "suites", "Farewell.md"), "# Farewell\n");
  assert.deepEqual(linkErrors(misnamed), ["suites/Farewell.md: not a suite's place, which is suites/<name>.md"]);
  const linked = suited();
  fs.renameSync(path.join(linked, "suites"), path.join(linked, "stated"));
  // A junction, so a directory link can be made on every platform without special rights.
  fs.symlinkSync(path.join(linked, "stated"), path.join(linked, "suites"), "junction");
  assert.deepEqual(linkErrors(linked), [
    `${CASES}: "greets" belongs to suites/greeting.md: a suite stated through a link`,
    "suites/greeting.md: a suite stated through a link",
  ]);
});

// Why: brain/learning/genesis/26/09/27/06/nodes/suite.md
test("a skill's case belongs to none of KAAL's suites, so the skill stays independent of KAAL", () => {
  const joined = withSkill(
    'import test from "node:test";\n\n// Suite: suites/greeting.md\ntest("says hello", () => {});\n',
  );
  assert.deepEqual(linkErrors(joined), [
    `skills/demo/scripts/demo.test.ts: "says hello" is a skill's case, so it points at nothing outside its skill`,
  ]);
  const stray = withSkill(
    'import test from "node:test";\n\n// Suite: suites/greeting.md\n\ntest("says hello", () => {});\n',
  );
  assert.deepEqual(linkErrors(stray), [
    "skills/demo/scripts/demo.test.ts:3: a skill's case points at nothing outside its skill",
  ]);
});

/** The suited fixture with `lines` added to its suite, and `section` to its plan. */
function served(lines: string, section = ""): string {
  const repo = suited();
  fs.appendFileSync(path.join(repo, "suites", "greeting.md"), `\n${lines}\n`);
  if (section) fs.appendFileSync(path.join(repo, PLAN), `\n## As runs read it\n\n\`\`\`yaml\n${section}\n\`\`\`\n`);
  return repo;
}

// Why: brain/learning/genesis/26/09/27/07/nodes/plan.md
test("a suite says which plans it serves, strictly written, and only plans its state states in their own places", () => {
  assert.deepEqual(linkErrors(served(`Serves: ${PLAN}`)), []);
  assert.deepEqual(linkErrors(served(`serves: ${PLAN}`)), [
    `suites/greeting.md:5: a line that serves no plan, written as "Serves: <place>"`,
  ]);
  assert.deepEqual(linkErrors(served("Serves: plans/release.md")), [
    "suites/greeting.md: serves plans/release.md: no plan is stated there",
  ]);
  assert.deepEqual(linkErrors(served("Serves: suites/greeting.md")), [
    "suites/greeting.md: serves suites/greeting.md: not a plan's place, which is plans/<name>.md",
  ]);
  // A plan stated before anything serves it is a plan all the same.
  const forward = suited();
  fs.mkdirSync(path.join(forward, "plans"));
  fs.writeFileSync(path.join(forward, "plans", "release.md"), "# Release\n\nWhat a release must show.\n");
  assert.deepEqual(linkErrors(forward), []);
  // A suite that is a link to nothing states nothing, and is said to, as any other place that is not a suite.
  const dangling = served(`Serves: ${PLAN}`);
  fs.symlinkSync("nowhere.md", path.join(dangling, "suites", "ghost.md"));
  assert.deepEqual(linkErrors(dangling), ["suites/ghost.md: no suite is stated there"]);
  // Only the Regression Plan names commitments, whose cases say so through their links; another plan is carried by
  // the suites that serve it, so a commitment it names would be checked by nothing.
  fs.appendFileSync(
    path.join(forward, "plans", "release.md"),
    "\n## Commitments\n\n1. Adding. Stated as `src/add.ts`. Shown by the seal checks.\n",
  );
  assert.deepEqual(linkErrors(forward), [
    "plans/release.md: names commitments, which only the Regression Plan does; it is carried by the suites that serve it",
  ]);
  fs.writeFileSync(path.join(forward, "plans", "release.md"), "# Release\n\nWhat a release must show.\n");
  // A section a plan begins with is read as any other.
  fs.writeFileSync(path.join(forward, "plans", "bare.md"), "## As runs read it\n\n```yaml\nconditions: linux\n```\n");
  assert.deepEqual(linkErrors(forward), [
    "plans/bare.md: conditions: not a list of sets of conditions, each naming its conditions' values",
  ]);
  fs.writeFileSync(path.join(forward, "plans", "bare.md"), "## Commitments\n\n1. Adding. Stated in `src/add.ts`.\n");
  assert.deepEqual(linkErrors(forward), [
    "plans/bare.md: names commitments, which only the Regression Plan does; it is carried by the suites that serve it",
  ]);
  // A block with nothing in it at all requires nothing, as one that says nothing does.
  fs.writeFileSync(path.join(forward, "plans", "bare.md"), "## As runs read it\n\n```yaml\n```\n");
  assert.deepEqual(linkErrors(forward), []);
  fs.rmSync(path.join(forward, "plans", "bare.md"));
  // Where plans and suites are stated is a directory, or the state says it is not.
  const flat = regressionCandidate("kept");
  fs.writeFileSync(path.join(flat, "plans"), "not a directory\n");
  fs.writeFileSync(path.join(flat, "suites"), "not a directory\n");
  assert.deepEqual(linkErrors(flat), [
    "suites: not a directory, where KAAL states its suites",
    "plans: not a directory, where KAAL states its plans",
  ]);
  fs.writeFileSync(path.join(forward, "plans", "con.md"), "# Con\n");
  assert.deepEqual(linkErrors(forward), [`plans/con.md: a plan's name "con" is reserved on Windows`]);
});

// Why: brain/learning/genesis/26/09/27/07/nodes/plan.md
test("a plan that says how runs read it says it so they can, with its data inside its state, and requires as proof every check it says shows a commitment", () => {
  assert.deepEqual(linkErrors(served("", "conditions:\n  - { platform: linux }\n  - { platform: win32 }")), []);
  // A block that says nothing, or only comments, requires nothing.
  assert.deepEqual(linkErrors(served("", "# nothing yet")), []);
  assert.deepEqual(linkErrors(served("", "conditions: linux")), [
    `${PLAN}: conditions: not a list of sets of conditions, each naming its conditions' values`,
  ]);
  assert.deepEqual(linkErrors(served("", "suites: [suites/greeting.md]")), [`${PLAN}: runs read no suites of a plan`]);
  // A condition is named as a run can be given it, name=value, so a name is a plain word.
  for (const name of ['""', "a=b", "two words"])
    assert.deepEqual(
      linkErrors(served("", `conditions:\n  - { ${name}: linux }`)),
      [
        `${PLAN}: conditions: ${JSON.stringify(name === '""' ? "" : name)} is no name a run can be given as a condition`,
      ],
      name,
    );
  // What runs read is a mapping of what they read: anything else would read as requiring nothing.
  for (const block of ["false", "42", "[]", "null"])
    assert.deepEqual(
      linkErrors(served("", block)),
      [`${PLAN}: As runs read it holds no mapping of what runs read`],
      block,
    );
  assert.deepEqual(linkErrors(served("", "data: plan-data")), [
    `${PLAN}: data: plan-data is no directory inside the state`,
  ]);
  // Nothing a plan says runs read is ever null, and its data is a place of its own in the state, never the state itself.
  assert.deepEqual(linkErrors(served("", "proof: null")), [`${PLAN}: proof: not proofs by name`]);
  for (const data of ['""', ".", "./", "src/.."])
    assert.deepEqual(
      linkErrors(served("", `data: ${data}`)),
      [
        `${PLAN}: data: ${JSON.parse(data.startsWith('"') ? data : JSON.stringify(data))} is not a place of its own in the state`,
      ],
      data,
    );
  const checked = served("", "proof:\n  the seal checks:\n    - { platform: linux }");
  assert.deepEqual(linkErrors(checked), []);
  const unchecked = served("", "conditions: []");
  const plan = path.join(unchecked, PLAN);
  fs.writeFileSync(
    plan,
    fs
      .readFileSync(plan, "utf8")
      .replace("`src/add.ts`. Shown by its cases.", "`src/add.ts`. Shown by its cases and the seal checks."),
  );
  assert.deepEqual(linkErrors(unchecked), [
    `${PLAN}: says the seal checks show a commitment, but does not require them as proof`,
  ]);
});
