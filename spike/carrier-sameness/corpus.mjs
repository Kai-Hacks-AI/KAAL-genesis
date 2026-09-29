// Disposable spike: the adversarial matrix. Builds a small accepted state shaped like #62's synthetic regression
// (cases.test.ts, bye.test.ts reading fixtures, a test-data.ts loader, scripts/test-data/*), makes one candidate per
// row, observes each case file in both through the actual carrier, and judges them in three ways.
//
//   node spike/carrier-sameness/corpus.mjs [--only <row>] [--json out.json]
//
// Optional: SPIKE_TSX_OLD=<dir holding node_modules with another tsx>, SPIKE_LEXER=<dir holding node_modules with
// es-module-lexer>. Rows needing them are skipped without them.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { facts, judge, observe, ownTsx, testingSurface } from "./carrier.mjs";

const REPO = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : undefined;

const BASE = {
  "package.json": JSON.stringify(
    {
      name: "spikekaal",
      private: true,
      type: "module",
      imports: { "#data/*": "./scripts/test-data/*" },
      exports: { "./greet": "./src/greet.ts", "./package.json": "./package.json" },
    },
    null,
    2,
  ),
  "tsconfig.json": JSON.stringify(
    {
      extends: "./cfg/base.json",
      compilerOptions: { paths: { "@data/*": ["./scripts/test-data/*"], "@odd": ["./scripts/test-data/strict.ts"] } },
    },
    null,
    2,
  ),
  "cfg/base.json": JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        jsx: "react",
        jsxFactory: "h",
        strict: true,
      },
    },
    null,
    2,
  ),
  "src/greet.ts": "export const greet = (name: string): string => `hello ${name}`;\n",
  "src/greet2.ts": "export const greet = (name: string): string => `hello ${name}`;\n",
  "src/add.ts": "export const add = (a: number, b: number): number => a + b;\n",
  "src/bye.ts": "export const bye = (name: string): string => `goodbye ${name}`;\n",
  "scripts/test-data.ts": 'export const names = ["x", "y"];\n',
  "scripts/test-data/check.mjs":
    "export const verify = (actual, expected) => {\n  if (actual !== expected) throw new Error(`${actual} !== ${expected}`);\n};\n",
  "scripts/test-data/limit.ts": "export const limit = 3;\n",
  "scripts/test-data/h.ts": "export const h = (tag: string, ..._rest: unknown[]): string => tag;\n",
  "scripts/test-data/view.tsx": 'import { h } from "./h.js";\n\nexport const view = () => <b>x</b>;\n',
  "scripts/test-data/strict.ts":
    'export const check = (s: string) => {\n  if (!s.startsWith("hello")) throw new Error(s);\n};\n',
  "scripts/test-data/lax.ts": "export const check = (_s: string) => {};\n",
  "scripts/test-data/legacy.cjs": 'module.exports = { expected: "hello x" };\n',
  "scripts/test-data/decorated.ts":
    'function tagged<T>(value: T, _context: unknown): T {\n  return value;\n}\n\n@tagged\nclass Expected {\n  static readonly text = "hello x";\n}\n\nexport const expected = Expected.text;\n',
  "scripts/decorated.test.ts": `import assert from "node:assert/strict";
import test from "node:test";
import { greet } from "../src/greet.js";
import { expected } from "./test-data/decorated.js";

test("greets as a decorated loader expects", () => {
  assert.equal(greet("x"), expected);
});
`,
  "scripts/hidden.test.ts": `import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { greet } from "../src/greet.js";

const require = createRequire(import.meta.url);

test("checks oddly only when the subject is odd", async () => {
  assert.equal(greet("x"), "hello x");
  if (greet("") !== "hello ") require("@odd").check(greet(""));
  if (greet("") === "odd") (await eval('import("@odd")')).check(greet(""));
});
`,
  "scripts/fixtures/goodbyes.txt": "x|goodbye x\ny|goodbye y\n",
  "scripts/cases.test.ts": `import assert from "node:assert/strict";
import test from "node:test";
import { add } from "../src/add.js";
import { greet } from "../src/greet.js";
import { names } from "./test-data.js";
import { verify } from "./test-data/check.mjs";

// Why: src/greet.ts
test("greets", () => {
  return assert.equal(greet("x"), "hello x");
});

// Why: src/add.ts
test("adds", () => {
  verify(add(1, 2), 3);
  for (const n of names) assert.equal(add(n.length, 0), 1);
});
`,
  "scripts/bye.test.ts": `import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { bye } from "../src/bye.js";

const lines = (fixture: string) =>
  fs
    .readFileSync(new URL(fixture, import.meta.url), "utf8")
    .split("\\n")
    .filter(Boolean)
    .map((line) => line.split("|") as [string, string]);

test("says goodbye to each name its fixture lists", () => {
  for (const [name, says] of lines("./fixtures/goodbyes.txt")) assert.ok(bye(name).includes(says));
});
`,
  "scripts/resolve.test.ts": `import assert from "node:assert/strict";
import test from "node:test";
import { greet } from "spikekaal/greet";
import { limit } from "@data/limit.js";
import { verify } from "#data/check.mjs";
import { view } from "./test-data/view.js";

test("resolves its inputs as the package and its configuration say", () => {
  verify(greet("x"), "hello x");
  assert.equal(limit, 3);
  assert.equal(view(), "b");
});
`,
  "scripts/dynamic.test.ts": `import assert from "node:assert/strict";
import test from "node:test";
import { greet } from "../src/greet.js";

test("loads its checks as it runs", async () => {
  const { limit } = await import("./test-data/limit.js");
  assert.equal(limit, 3);
  const which = ["./test-data/", "strict", ".js"].join("");
  const { check } = await import(which);
  check(greet("x"));
  // Reached only where the subject greets nobody otherwise: never against the accepted state.
  if (greet("") !== "hello ") {
    const { check: odd } = await import("@odd");
    odd(greet(""));
  }
});
`,
  "scripts/cjs.test.ts": `import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { greet } from "../src/greet.js";

const require = createRequire(import.meta.url);

test("reads its expectation from a CommonJS loader", () => {
  const { expected } = require("./test-data/legacy.cjs");
  assert.equal(greet("x"), expected);
});
`,
  "scripts/eval.test.ts": `import assert from "node:assert/strict";
import test from "node:test";
import { greet } from "../src/greet.js";

test("checks what eval says", () => {
  assert.equal(greet("x"), eval('"hello " + "x"'));
});
`,
  "scripts/stack.test.ts": `import assert from "node:assert/strict";
import test from "node:test";
import { greet } from "../src/greet.js";

const line = () => Number(/stack\\.test\\.ts:(\\d+)/.exec(new Error().stack ?? "")?.[1]);

test("greets, unless it sits far down its file", () => {
  if (line() > 20) return;
  assert.equal(greet("x"), "hello x");
});
`,
};

const CASE_FILES = [
  "scripts/cases.test.ts",
  "scripts/bye.test.ts",
  "scripts/resolve.test.ts",
  "scripts/dynamic.test.ts",
  "scripts/cjs.test.ts",
  "scripts/eval.test.ts",
  "scripts/stack.test.ts",
  "scripts/decorated.test.ts",
  "scripts/hidden.test.ts",
];

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "spike-corpus-"));
let n = 0;
/** A fresh state at `<tmp>/<n>/<where>/state`, holding `files`, with node_modules linked from `modules`. */
function state(files, { where = "s", modules = path.join(REPO, "node_modules") } = {}) {
  const root = path.join(TMP, String(n++), where, "state");
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  fs.symlinkSync(modules, path.join(root, "node_modules"), "junction");
  return root;
}
const edit = (files, rel, change) => {
  const after = typeof change === "function" ? change(files[rel]) : change;
  if (after === files[rel]) throw new Error(`row edits nothing in ${rel}`);
  const out = { ...files };
  if (after === undefined) delete out[rel];
  else out[rel] = after;
  return out;
};
const json = (text, change) => JSON.stringify(change(JSON.parse(text)), null, 2);

// Every row: which case files it judges, the candidate's files, and for each file whether the testing state's
// contribution to executing it truly differs ("differs"), is identical ("identical"), or differs only by what the
// carrier erases from what executes ("erased"). A false same is "same" where the truth is "differs".
const everyFile = (truth) => Object.fromEntries(CASE_FILES.map((f) => [f, truth]));
const rows = [
  { name: "unchanged copy", klass: "unchanged", truth: everyFile("identical"), candidate: (b) => b },
  {
    name: "comment and layout in a case file",
    klass: "comments/layout",
    truth: { "scripts/cases.test.ts": "erased" },
    candidate: (b) =>
      edit(b, "scripts/cases.test.ts", (t) =>
        t
          .replace("// Why: src/greet.ts\n", "// Why: src/greet.ts\n// A comment added.\n")
          .replace("verify(add(1, 2), 3);", "verify(\n    add(1, 2),\n    3,\n  );"),
      ),
  },
  {
    name: "layout inside a statement, same lines",
    klass: "comments/layout",
    truth: { "scripts/cases.test.ts": "erased" },
    candidate: (b) =>
      edit(b, "scripts/cases.test.ts", (t) => t.replace("verify(add(1, 2), 3);", "verify(add(1,2),3);")),
  },
  {
    name: "line break after return (ASI)",
    klass: "ASI",
    truth: { "scripts/cases.test.ts": "differs" },
    candidate: (b) =>
      edit(b, "scripts/cases.test.ts", (t) => t.replace("return assert.equal", "return\n  assert.equal")),
  },
  {
    name: "line break inside the returned call",
    klass: "ASI",
    truth: { "scripts/cases.test.ts": "erased" },
    candidate: (b) =>
      edit(b, "scripts/cases.test.ts", (t) =>
        t.replace(
          'return assert.equal(greet("x"), "hello x");',
          'return assert.equal(\n    greet("x"),\n    "hello x",\n  );',
        ),
      ),
  },
  {
    name: "type-only additions (type alias, import type)",
    klass: "type erasure",
    truth: { "scripts/cases.test.ts": "erased" },
    candidate: (b) =>
      edit(b, "scripts/cases.test.ts", (t) =>
        t.replace(
          'import test from "node:test";\n',
          'import test from "node:test";\nimport type { bye } from "../src/bye.js";\ntype Who = string;\n',
        ),
      ),
  },
  {
    name: "unused TypeScript value import (elided by tsx)",
    klass: "type erasure",
    truth: { "scripts/cases.test.ts": "erased" },
    candidate: (b) =>
      edit(b, "scripts/cases.test.ts", (t) =>
        t.replace(
          'import test from "node:test";\n',
          'import test from "node:test";\nimport { bye } from "../src/bye.js";\n',
        ),
      ),
  },
  {
    name: "unused import kept under verbatimModuleSyntax",
    klass: "execution-affecting configuration",
    truth: { "scripts/cases.test.ts": "differs" },
    candidate: (b) =>
      edit(
        edit(b, "scripts/cases.test.ts", (t) =>
          t.replace(
            'import test from "node:test";\n',
            'import test from "node:test";\nimport { bye } from "../src/bye.js";\n',
          ),
        ),
        "cfg/base.json",
        (t) => json(t, (c) => ({ compilerOptions: { ...c.compilerOptions, verbatimModuleSyntax: true } })),
      ),
  },
  {
    name: "same text as JavaScript: loader renamed .ts -> .js (TS vs JS interpretation)",
    klass: "JS vs TS",
    truth: { "scripts/cases.test.ts": "differs" },
    candidate: (b) => {
      const c = edit(b, "scripts/test-data.ts", undefined);
      return {
        ...c,
        "scripts/test-data.js": 'import { bye } from "../src/bye.js";\nexport const names = ["x", "y"];\n',
      };
    },
    base: (b) =>
      edit(b, "scripts/test-data.ts", 'import { bye } from "../src/bye.js";\nexport const names = ["x", "y"];\n'),
  },
  {
    name: "jsxFactory changed in the extended base",
    klass: "TSX/JSX + extended tsconfig",
    truth: { "scripts/resolve.test.ts": "differs", "scripts/cases.test.ts": "identical" },
    candidate: (b) =>
      edit(
        edit(b, "cfg/base.json", (t) =>
          json(t, (c) => ({ compilerOptions: { ...c.compilerOptions, jsxFactory: "hh" } })),
        ),
        "scripts/test-data/h.ts",
        (t) => `${t}export const hh = (_tag: string, ..._rest: unknown[]): string => "b";\n`,
      ),
    note: "the candidate's case now fails: hh is not in scope where the factory is used",
  },
  {
    name: "strict toggled in the extended base (no effect on emitted code)",
    klass: "extended tsconfig",
    truth: everyFile("identical"),
    candidate: (b) =>
      edit(b, "cfg/base.json", (t) => json(t, (c) => ({ compilerOptions: { ...c.compilerOptions, strict: false } }))),
  },
  {
    name: "#62 open P1: missing local extended configuration",
    klass: "extended tsconfig",
    truth: {
      "scripts/resolve.test.ts": "differs",
      "scripts/cases.test.ts": "differs?",
      "scripts/bye.test.ts": "differs?",
    },
    candidate: (b) => edit(b, "cfg/base.json", undefined),
    note: "tsx drops the whole tsconfig when an extends target is missing",
  },
  {
    name: "paths alias retargeted to another loader",
    klass: "paths",
    truth: { "scripts/resolve.test.ts": "differs", "scripts/cases.test.ts": "identical" },
    candidate: (b) =>
      edit(b, "tsconfig.json", (t) =>
        json(t, (c) => ({
          ...c,
          compilerOptions: {
            ...c.compilerOptions,
            paths: { ...c.compilerOptions.paths, "@data/*": ["./scripts/test-data/alt/*"] },
          },
        })),
      ),
    extra: { "scripts/test-data/alt/limit.ts": "export const limit = 3;\n" },
  },
  {
    name: "package imports (#data/*) retargeted",
    klass: "package imports",
    truth: { "scripts/resolve.test.ts": "differs", "scripts/cases.test.ts": "identical" },
    candidate: (b) =>
      edit(b, "package.json", (t) => json(t, (p) => ({ ...p, imports: { "#data/*": "./scripts/test-data/alt/*" } }))),
    extra: { "scripts/test-data/alt/check.mjs": "export const verify = () => {};\n" },
  },
  {
    name: "#62 open P1: self-reference redirected by package exports",
    klass: "package exports",
    truth: { "scripts/resolve.test.ts": "differs", "scripts/cases.test.ts": "identical" },
    candidate: (b) =>
      edit(b, "package.json", (t) =>
        json(t, (p) => ({ ...p, exports: { ...p.exports, "./greet": "./src/greet2.ts" } })),
      ),
    note: "the case now reaches another subject module: the same claim about another subject",
  },
  {
    name: "package type module -> commonjs",
    klass: "package type",
    truth: everyFile("differs"),
    candidate: (b) => edit(b, "package.json", (t) => json(t, (p) => ({ ...p, type: "commonjs" }))),
  },
  {
    name: "static import redirected to another loader",
    klass: "module redirect",
    truth: { "scripts/cases.test.ts": "differs" },
    candidate: (b) =>
      edit(
        { ...b, "scripts/test-data/check2.mjs": "export const verify = () => {};\n" },
        "scripts/cases.test.ts",
        (t) => t.replace('"./test-data/check.mjs"', '"./test-data/check2.mjs"'),
      ),
  },
  {
    name: "import order swapped",
    klass: "static imports",
    truth: { "scripts/cases.test.ts": "differs" },
    candidate: (b) =>
      edit(b, "scripts/cases.test.ts", (t) =>
        t.replace(
          'import { add } from "../src/add.js";\nimport { greet } from "../src/greet.js";\n',
          'import { greet } from "../src/greet.js";\nimport { add } from "../src/add.js";\n',
        ),
      ),
  },
  {
    name: "loader weakened (reached by static import)",
    klass: "test-data loaders",
    truth: {
      "scripts/cases.test.ts": "differs",
      "scripts/resolve.test.ts": "differs",
      "scripts/bye.test.ts": "identical",
    },
    candidate: (b) => edit(b, "scripts/test-data/check.mjs", "export const verify = () => {};\n"),
  },
  {
    name: "value export added to a loader",
    klass: "observable exports",
    truth: { "scripts/cases.test.ts": "differs", "scripts/resolve.test.ts": "differs" },
    candidate: (b) => edit(b, "scripts/test-data/check.mjs", (t) => `${t}export const bypass = () => {};\n`),
  },
  {
    name: "type export added to a TS loader",
    klass: "observable exports",
    truth: { "scripts/cases.test.ts": "erased" },
    candidate: (b) => edit(b, "scripts/test-data.ts", (t) => `${t}export type Who = string;\n`),
  },
  {
    name: "dynamic literal import target weakened",
    klass: "dynamic literal import",
    truth: { "scripts/dynamic.test.ts": "differs", "scripts/resolve.test.ts": "differs" },
    candidate: (b) =>
      edit(b, "scripts/test-data/limit.ts", "export const limit = 3 as number;\nexport const loose = true;\n"),
  },
  {
    name: "computed import target weakened (executed on this run)",
    klass: "computed import",
    truth: { "scripts/dynamic.test.ts": "differs" },
    candidate: (b) => edit(b, "scripts/test-data/strict.ts", "export const check = (_s: string) => {};\n"),
  },
  {
    name: "FALSE-SAME ATTEMPT: conditional import retargeted by tsconfig paths to an existing weak loader",
    klass: "computed/conditional import",
    truth: { "scripts/dynamic.test.ts": "differs" },
    candidate: (b) =>
      edit(b, "tsconfig.json", (t) =>
        json(t, (c) => ({
          ...c,
          compilerOptions: {
            ...c.compilerOptions,
            paths: { ...c.compilerOptions.paths, "@odd": ["./scripts/test-data/lax.ts"] },
          },
        })),
      ),
    note: "the branch never runs against the accepted state; against a later tested state it loads lax.ts",
  },
  {
    name: "FALSE-SAME ATTEMPT: conditional require / eval'd import retargeted by tsconfig paths",
    klass: "computed/conditional import",
    truth: { "scripts/hidden.test.ts": "differs" },
    candidate: (b) =>
      edit(b, "tsconfig.json", (t) =>
        json(t, (c) => ({
          ...c,
          compilerOptions: {
            ...c.compilerOptions,
            paths: { ...c.compilerOptions.paths, "@odd": ["./scripts/test-data/lax.ts"] },
          },
        })),
      ),
    note: "neither branch runs against the accepted state",
  },
  {
    name: "CJS loader weakened (require)",
    klass: "require / CJS",
    truth: { "scripts/cjs.test.ts": "differs" },
    candidate: (b) =>
      edit(b, "scripts/test-data/legacy.cjs", 'module.exports = { expected: "hello x", loose: true };\n'),
  },
  {
    name: "direct eval text changed",
    klass: "direct eval",
    truth: { "scripts/eval.test.ts": "differs" },
    candidate: (b) =>
      edit(b, "scripts/eval.test.ts", (t) => t.replace('eval(\'"hello " + "x"\')', "eval('greet(\"x\")')")),
  },
  {
    name: "harmless helper added beside inherited cases (#62 'inert')",
    klass: "inert addition",
    truth: { "scripts/cases.test.ts": "differs" },
    candidate: (b) =>
      edit(b, "scripts/cases.test.ts", (t) =>
        t.replace("// Why: src/greet.ts", "function twice(n: number) {\n  return 2 * n;\n}\n\n// Why: src/greet.ts"),
      ),
    note: "truth 'differs' only in the strict sense: executed text differs; a human calls it harmless",
  },
  {
    name: "strengthening in a separate case file",
    klass: "strengthening",
    truth: everyFile("identical"),
    candidate: (b) => ({
      ...b,
      "scripts/more.test.ts":
        'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { greet } from "../src/greet.js";\n\ntest("greets y", () => {\n  assert.equal(greet("y"), "hello y");\n});\n',
    }),
  },
  {
    name: "strengthening in a separate file with its own new fixture",
    klass: "strengthening",
    truth: everyFile("identical"),
    candidate: (b) => ({
      ...b,
      "scripts/fixtures/more.txt": "y\n",
      "scripts/more.test.ts":
        'import assert from "node:assert/strict";\nimport fs from "node:fs";\nimport test from "node:test";\n\ntest("reads more", () => {\n  assert.ok(fs.readFileSync(new URL("./fixtures/more.txt", import.meta.url), "utf8"));\n});\n',
    }),
  },
  {
    name: "strengthening beside inherited cases in the same file",
    klass: "strengthening",
    truth: { "scripts/cases.test.ts": "differs" },
    candidate: (b) =>
      edit(
        b,
        "scripts/cases.test.ts",
        (t) => `${t}\n// Why: src/greet.ts\ntest("greets y", () => {\n  assert.equal(greet("y"), "hello y");\n});\n`,
      ),
    note: "a new case in the same module can change what its siblings do; executed text differs",
  },
  {
    name: "FALSE-SAME ATTEMPT: added case disables a sibling's check through shared module state",
    klass: "strengthening",
    truth: { "scripts/cases.test.ts": "differs" },
    candidate: (b) =>
      edit(b, "scripts/cases.test.ts", (t) =>
        t.replace('test("greets"', 'test("warms up", () => {\n  names.length = 0;\n});\n\ntest("greets"'),
      ),
  },
  {
    name: "assertion weakened in the case",
    klass: "weakening",
    truth: { "scripts/cases.test.ts": "differs" },
    candidate: (b) =>
      edit(b, "scripts/cases.test.ts", (t) =>
        t.replace('assert.equal(greet("x"), "hello x")', 'assert.ok(greet("x"))'),
      ),
  },
  {
    name: "FALSE-SAME ATTEMPT: fixture read through fs thinned",
    klass: "data outside the module graph",
    truth: { "scripts/bye.test.ts": "differs", "scripts/cases.test.ts": "identical" },
    candidate: (b) => edit(b, "scripts/fixtures/goodbyes.txt", "x|x\n"),
  },
  {
    name: "FALSE-SAME ATTEMPT: layout pushes a position-reading case past its threshold",
    klass: "comments/layout",
    truth: { "scripts/stack.test.ts": "differs" },
    candidate: (b) => edit(b, "scripts/stack.test.ts", (t) => `${"// padding\n".repeat(20)}${t}`),
    note: "tsx enables source maps: positions in stacks are the original file's",
  },
  {
    name: "subject changed (tested state), testing untouched",
    klass: "subject change",
    truth: everyFile("identical"),
    candidate: (b) => edit(b, "src/add.ts", "export const add = (a: number, b: number): number => b + a;\n"),
  },
];

// Configuration above the state root: states without a tsconfig of their own, a directory above which may hold one.
const NOCONF = (() => {
  const b = { ...BASE };
  delete b["tsconfig.json"];
  delete b["cfg/base.json"];
  b["scripts/test-data/view.tsx"] =
    'import { h } from "./h.js";\n\nconst React = { createElement: h };\nvoid React;\n\nexport const view = () => <b>x</b>;\n';
  b["scripts/resolve.test.ts"] = BASE["scripts/resolve.test.ts"].replace(
    'import { limit } from "@data/limit.js";\n',
    'import { limit } from "./test-data/limit.js";\n',
  );
  return b;
})();
const above = [
  {
    name: "tsconfig above the state root with no effect on emitted code",
    klass: "configuration above the state root",
    truth: everyFile("identical"),
    base: () => NOCONF,
    candidate: () => NOCONF,
    parent: { "tsconfig.json": '{ "compilerOptions": { "strict": true } }\n' },
  },
  {
    name: "tsconfig above the state root setting jsxFactory",
    klass: "configuration above the state root",
    truth: { "scripts/resolve.test.ts": "differs", "scripts/cases.test.ts": "identical" },
    base: () => NOCONF,
    candidate: () => NOCONF,
    parent: { "tsconfig.json": '{ "compilerOptions": { "jsxFactory": "h" } }\n' },
  },
];

const results = [];
const modes = [
  ["observed", "positions"],
  ["observed", "blind"],
  ["surface", "positions"],
  ...(process.env.SPIKE_LEXER
    ? [
        ["lexed", "positions"],
        ["strict", "positions"],
      ]
    : []),
];
function run(row, { acceptedFiles, candidateFiles, acceptedOpts = {}, candidateOpts = {}, parent, tsxFor } = {}) {
  const A = state(acceptedFiles, { where: "accepted", ...acceptedOpts });
  const C = state(candidateFiles, { where: "candidate", ...candidateOpts });
  if (parent) for (const [rel, text] of Object.entries(parent)) fs.writeFileSync(path.join(path.dirname(C), rel), text);
  const files = Object.keys(row.truth).filter((f) => f in acceptedFiles);
  for (const file of files) {
    const oa = observe(A, file);
    const oc = observe(C, file, tsxFor ? { tsx: tsxFor(A, C) } : {});
    const verdicts = {};
    for (const [mode, maps] of modes) {
      const fa = facts(oa, { maps });
      const fc = facts(oc, { maps });
      const j = judge(fa, fc, {
        mode,
        surfaces: { accepted: testingSurface(A, file), candidate: testingSurface(C, file) },
      });
      verdicts[`${mode}/${maps}`] = j;
    }
    const truth = row.truth[file];
    const falseSame = Object.fromEntries(
      Object.entries(verdicts).map(([k, v]) => [k, v.verdict === "same" && truth === "differs"]),
    );
    results.push({
      row: row.name,
      klass: row.klass,
      file,
      truth,
      runs: { accepted: `${oa.pass}/${oa.fail}`, candidate: `${oc.pass}/${oc.fail}` },
      verdicts,
      falseSame,
      note: row.note,
    });
  }
}

for (const row of rows) {
  if (only && !row.name.includes(only)) continue;
  const acceptedFiles = row.base ? row.base(BASE) : BASE;
  const candidateFiles = { ...row.candidate(acceptedFiles), ...(row.extra ?? {}) };
  run(row, { acceptedFiles, candidateFiles });
}
for (const row of above) {
  if (only && !row.name.includes(only)) continue;
  run(row, { acceptedFiles: row.base(), candidateFiles: row.candidate(), parent: row.parent });
}

// Toolchain: the candidate installs another tsx. Observed with its own install, then with the checker's.
const OLD = process.env.SPIKE_TSX_OLD;
if (OLD && (!only || "toolchain".includes(only) || only === "toolchain")) {
  const tool = {
    name: "candidate on tsx 4.19.2 / esbuild 0.23.1, observed with its own tsx",
    klass: "toolchain version",
    truth: { ...everyFile("identical"), "scripts/dynamic.test.ts": "differs" },
    note: "tsx wraps import() in an interop .then(); its parameter is named otherwise",
  };
  run(tool, { acceptedFiles: BASE, candidateFiles: BASE, candidateOpts: { modules: path.join(OLD, "node_modules") } });
  const checker = {
    name: "same candidate, observed with the checker's (accepted) tsx, as the replay runs it",
    klass: "toolchain version",
    truth: { ...everyFile("identical"), "scripts/dynamic.test.ts": "differs" },
  };
  run(checker, {
    acceptedFiles: BASE,
    candidateFiles: BASE,
    candidateOpts: { modules: path.join(OLD, "node_modules") },
    tsxFor: (A) => ownTsx(A),
  });
}

// Print the matrix.
const short = (v) =>
  v.verdict + (v.why.length ? ` (${v.why[0].slice(0, 90)}${v.why.length > 1 ? `, +${v.why.length - 1}` : ""})` : "");
for (const r of results) {
  const fs_ = Object.entries(r.falseSame)
    .filter(([, b]) => b)
    .map(([k]) => k);
  console.log(
    `\n[${r.klass}] ${r.row}\n  ${r.file}  truth=${r.truth}  runs A=${r.runs.accepted} C=${r.runs.candidate}${fs_.length ? `  FALSE SAME in ${fs_.join(", ")}` : ""}`,
  );
  for (const [k, v] of Object.entries(r.verdicts)) console.log(`    ${k.padEnd(20)} ${short(v)}`);
  if (r.note) console.log(`    note: ${r.note}`);
}
console.log(`\nplatform ${process.platform} node ${process.version}; states under ${TMP}`);
if (jsonOut)
  fs.writeFileSync(jsonOut, JSON.stringify({ platform: process.platform, node: process.version, results }, null, 2));

// A compact matrix, one line per row and case file.
console.log(
  "\nrow | file | truth | runs A C | observed/positions | observed/blind | surface | lexed | strict | false same",
);
for (const r of results) {
  const v = (k) => r.verdicts[k]?.verdict ?? "-";
  const fsm = Object.entries(r.falseSame)
    .filter(([, b]) => b)
    .map(([k]) => k.split("/")[0] + "/" + k.split("/")[1][0]);
  console.log(
    [
      r.row.slice(0, 70),
      r.file.replace("scripts/", ""),
      r.truth,
      `${r.runs.accepted} ${r.runs.candidate}`,
      v("observed/positions"),
      v("observed/blind"),
      v("surface/positions"),
      v("lexed/positions"),
      v("strict/positions"),
      fsm.join(",") || ".",
    ].join(" | "),
  );
}
