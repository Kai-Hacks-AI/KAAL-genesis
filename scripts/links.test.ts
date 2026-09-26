import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { fileCases, linkErrors, PLAN } from "./links.js";
import { regressionErrors } from "./regression.js";
import { regressionCandidate, regressionTrusted } from "./test-data.js";

const REPO = fileURLToPath(new URL("../", import.meta.url));
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

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
test("links hold from the files alone: every case points at stated commitments, and several cases may prove one", () => {
  assert.deepEqual(linkErrors(regressionTrusted()), []);
  const cases = fileCases(CASES, fs.readFileSync(path.join(regressionTrusted(), CASES), "utf8"));
  assert.deepEqual(
    cases.filter((c) => c.places.includes("src/add.ts")).map((c) => c.title),
    ["adds", "adds as its fixture says"],
  );
});

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
test("a case may point at several commitments, one link each", () => {
  const repo = changed(CASES, (text) => text.replace(GREETS_LINK, `// Why: src/add.ts\n${GREETS_LINK}`));
  assert.deepEqual(linkErrors(repo), []);
  const greets = fileCases(CASES, fs.readFileSync(path.join(repo, CASES), "utf8")).find((c) => c.title === "greets");
  assert.deepEqual(greets?.places, ["src/add.ts", GREETING]);
});

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
test("a case whose link disappears is refused, and so is the commitment it leaves without a case", () => {
  const repo = changed(CASES, (text) => text.replace(`// Why: ${GREETING}\n`, ""));
  assert.deepEqual(linkErrors(repo), [
    `${CASES}: "greets" says no commitment it helps prove`,
    `${GREETING}: the plan says its cases show it, but no case points at it`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
test("a link redirected to another commitment leaves its own commitment without a case", () => {
  const repo = changed(CASES, (text) => text.replace(GREETS_LINK, GREETS_LINK.replace(GREETING, "src/add.ts")));
  assert.deepEqual(linkErrors(repo), [`${GREETING}: the plan says its cases show it, but no case points at it`]);
});

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
test("a link to a commitment the plan does not state is refused, whether or not its place exists", () => {
  for (const place of ["brain/learning/k/26/01/01/01/nodes/unknown.md", "src/greet.ts"]) {
    const repo = changed(CASES, (text) => text.replace(GREETS_LINK, GREETS_LINK.replace(GREETING, place)));
    assert.deepEqual(linkErrors(repo), [
      `${CASES}: "greets" points at ${place}, which the plan does not state`,
      `${GREETING}: the plan says its cases show it, but no case points at it`,
    ]);
  }
});

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
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

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
test("a case whose title cannot be read is refused, since no link can follow it", () => {
  const repo = changed(CASES, (text) => text.replace('test("adds", () => {', "test(`adds`, () => {"));
  assert.deepEqual(linkErrors(repo), [
    `${CASES}:7: a link that belongs to no case, written as "// Why: <place>"`,
    `${CASES}:8: a case whose title cannot be read, so no link can follow it`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
test("a commitment whose place states nothing is refused", () => {
  assert.deepEqual(linkErrors(regressionCandidate("misplaced")), [
    "brain/learning/k/26/01/01/01/nodes/parting.md: the plan names it, but nothing is stated there",
  ]);
});

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
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

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
test("a plan says what shows each commitment; only one its cases show must have a case", () => {
  const silent = changed(PLAN, (text) => text.replace("`src/add.ts`. Shown by its cases.", "`src/add.ts`."));
  assert.deepEqual(linkErrors(silent), ["src/add.ts: the plan does not say what shows it"]);
  const unknown = changed(PLAN, (text) =>
    text.replace("`src/add.ts`. Shown by its cases.", "`src/add.ts`. Shown by hope."),
  );
  assert.deepEqual(linkErrors(unknown), ["src/add.ts: the plan says hope show it, which is not a check KAAL knows"]);
  const sealed = changed(CASES, (text) => text.replace(`// Why: ${GREETING}\n`, `// Why: src/add.ts\n`));
  fs.writeFileSync(
    path.join(sealed, PLAN),
    fs
      .readFileSync(path.join(sealed, PLAN), "utf8")
      .replace(`\`${GREETING}\`. Shown by its cases.`, `\`${GREETING}\`. Shown by the seal checks.`),
  );
  assert.deepEqual(linkErrors(sealed), []);
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

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
test("a skill's case proves its own SKILL.md without a link, and never points outside its skill", () => {
  const plain = 'import test from "node:test";\n\ntest("says hello", () => {});\n';
  assert.deepEqual(linkErrors(withSkill(plain)), []);
  const linked = withSkill(plain.replace("\ntest(", `\n// Why: ${GREETING}\ntest(`));
  assert.deepEqual(linkErrors(linked), [
    `skills/demo/scripts/demo.test.ts: "says hello" is a skill's case, so it points at nothing outside its skill`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
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
});

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
test("a candidate that would leave the next main with links it cannot read is refused", () => {
  const candidate = changed(CASES, (text) => text.replace(`// Why: ${GREETING}\n`, ""));
  const errors = regressionErrors(regressionTrusted(), candidate, "b".repeat(40));
  assert.deepEqual(errors.slice(0, 2), [
    `as the next main, ${CASES}: "greets" says no commitment it helps prove`,
    `as the next main, ${GREETING}: the plan says its cases show it, but no case points at it`,
  ]);
});

// Why: brain/learning/genesis/26/09/26/02/nodes/testing.md
test("KAAL's own testing links hold from its files", () => {
  assert.deepEqual(linkErrors(REPO), []);
});
