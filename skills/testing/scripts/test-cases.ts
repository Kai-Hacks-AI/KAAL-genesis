import { parse } from "@babel/parser";
import fs from "node:fs";

/** One thing a Test Case tests: the `kind` of existing meaning, and its `id`. Testing knows neither what kinds exist nor whether an id names anything. */
export type Tests = { kind: string; id: string };

/**
 * A Test Case: one top-level `node:test` call with a literal, non-empty name,
 * in the Carrier (the `*.test.*` file) named `carrier` by the caller. Its
 * identity is the carrier and the name Node reports for it. `tests` is what it states it
 * tests, in declaration order.
 */
export type TestCase = { carrier: string; name: string; tests: Tests[] };

/**
 * A Test Case's identity as one line: the JSON array of its carrier and its
 * name, with the line separators JSON leaves raw escaped too, so no name,
 * whatever characters it holds, can split it across lines or be mistaken for
 * where the carrier ends.
 */
export const testCaseId = (tc: Pick<TestCase, "carrier" | "name">): string =>
  JSON.stringify([tc.carrier, tc.name]).replace(
    /[\u0085\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );

/** A call by its syntax: `f(...)`, `f?.(...)`, or `new f(...)`: every node that applies a callee to arguments. */
const isCall = (node: Node): boolean =>
  node.type === "CallExpression" || node.type === "OptionalCallExpression" || node.type === "NewExpression";

/** The syntax tree, as far as the reader looks at it: nodes are objects with a `type`. */
type Node = { type: string; loc?: { start: { line: number } } | null; [key: string]: unknown };
const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as Node).type === "string";
const nodes = (value: unknown): Node[] => (Array.isArray(value) ? value.filter(isNode) : isNode(value) ? [value] : []);
const at = (node: Node): number => node.loc?.start.line ?? 0;

/**
 * What `node:test` offers that a Case is written with, as it classifies each
 * export and each member of `test` and `it`. A `test` call defines a Test Case;
 * an `other` call opens a context (a suite) that is not one; `ignored` defines
 * neither. A test of this skill consults the running Node and fails on any
 * export or member this does not classify, so one Node adds cannot go unread.
 * The table is what Node offers across the versions it was checked against
 * (20, 22 and 24), not what the Node that reads a Carrier offers: an entry point
 * a given Node lacks, such as `expectFailure` before Node 24, fails the Carrier
 * where it runs, which is a condition of that Run and not of reading it.
 */
export const NODE_TEST = {
  test: ["test", "it", "skip", "only", "todo", "expectFailure"],
  other: ["describe", "suite"],
  modifiers: ["skip", "only", "todo", "expectFailure"],
  ignored: [
    "after",
    "afterEach",
    "assert",
    "before",
    "beforeEach",
    "default",
    "getTestContext",
    "mock",
    "run",
    "snapshot",
  ],
} as const;

/**
 * How a local name is bound to `node:test`: to the function it exports as a
 * default (a default import, an import-equals, a `require`), to the namespace
 * of its exports, which is an object and not callable, or to one named export.
 */
type Binding =
  "module" | "namespace" | "test" | "it" | "skip" | "only" | "todo" | "expectFailure" | "describe" | "suite";
const EXPORTS = new Set<string>([...NODE_TEST.test, ...NODE_TEST.other]);
/** What `describe` and `suite`, and `test` and `it`, offer as modifiers: the same call, skipped, only, todo, or expected to fail. */
const MODIFIERS = new Set<string>(NODE_TEST.modifiers);

const nameOf = (node: unknown): string | undefined =>
  isNode(node) && node.type === "Identifier"
    ? (node.name as string)
    : isNode(node) && node.type === "StringLiteral"
      ? (node.value as string)
      : undefined;

/** A string literal's value, or a template literal's without substitutions: nothing that has to be evaluated. */
function literal(node: unknown): string | undefined {
  if (!isNode(node)) return undefined;
  if (node.type === "StringLiteral") return node.value as string;
  const quasis = node.quasis as { value: { cooked?: string | null } }[] | undefined;
  if (node.type === "TemplateLiteral" && (node.expressions as unknown[]).length === 0 && quasis?.length === 1)
    return quasis[0].value.cooked ?? undefined;
  return undefined;
}

/**
 * The local names `node:test` is bound to at the top of a Carrier: imported, or
 * required, with the ones that rest on `require` meaning the CommonJS loader.
 */
function bindings(program: Node): {
  bound: Map<string, Binding>;
  viaRequire: Set<string>;
  declared: Map<string, { index: number; line: number }>;
  recognized: Set<Node>;
} {
  const bound = new Map<string, Binding>();
  const viaRequire = new Set<string>();
  /** Where a binding that is not hoisted is declared: a call before it runs in its temporal dead zone. */
  const declared = new Map<string, { index: number; line: number }>();
  /** The specifier nodes of the declarations that bind `node:test`: the Carrier's own ways to reach it. */
  const recognized = new Set<Node>();
  for (const [index, statement] of nodes(program.body).entries()) {
    if (statement.type === "ImportDeclaration" && literal(statement.source) === "node:test") {
      recognized.add(statement.source as Node);
      if (statement.importKind === "type") continue;
      for (const s of nodes(statement.specifiers)) {
        const local = nameOf(s.local);
        if (!local || s.importKind === "type") continue;
        if (s.type === "ImportDefaultSpecifier") bound.set(local, "module");
        else if (s.type === "ImportNamespaceSpecifier") bound.set(local, "namespace");
        else if (s.type === "ImportSpecifier") {
          const imported = nameOf(s.imported);
          if (imported === "default") bound.set(local, "module");
          else if (imported && EXPORTS.has(imported)) bound.set(local, imported as Binding);
        }
      }
    } else if (
      statement.type === "TSImportEqualsDeclaration" &&
      isNode(statement.moduleReference) &&
      literal(statement.moduleReference.expression) === "node:test"
    ) {
      recognized.add((statement.moduleReference as Node).expression as Node);
      const local = nameOf(statement.id);
      if (local) {
        bound.set(local, "module");
        declared.set(local, { index, line: at(statement) });
      }
    } else if (statement.type === "VariableDeclaration" && statement.kind === "const") {
      // Only a `const` binding is trusted: a `let` or `var` can be written to later, so what it names at a call is not known.
      for (const d of nodes(statement.declarations)) {
        const init = d.init;
        if (
          !isNode(init) ||
          init.type !== "CallExpression" ||
          nameOf(init.callee) !== "require" ||
          literal(nodes(init.arguments)[0]) !== "node:test"
        )
          continue;
        recognized.add(nodes(init.arguments)[0]);
        const bind = (local: string, binding: Binding) => {
          bound.set(local, binding);
          viaRequire.add(local);
          declared.set(local, { index, line: at(statement) });
        };
        if (isNode(d.id) && d.id.type === "Identifier") bind(d.id.name as string, "module");
        else if (isNode(d.id) && d.id.type === "ObjectPattern")
          for (const p of nodes(d.id.properties)) {
            const imported = nameOf(p.key);
            const local = nameOf(p.value);
            if (p.type === "ObjectProperty" && imported && local && EXPORTS.has(imported))
              bind(local, imported as Binding);
          }
      }
    }
  }
  return { bound, viaRequire, declared, recognized };
}

/** A pattern's own names: what it declares. */
function patternNames(pattern: unknown): string[] {
  if (!isNode(pattern)) return [];
  if (pattern.type === "Identifier") return [pattern.name as string];
  if (pattern.type === "ObjectPattern")
    return nodes(pattern.properties).flatMap((p) => patternNames(p.type === "RestElement" ? p : p.value));
  if (pattern.type === "ArrayPattern") return (pattern.elements as unknown[]).flatMap(patternNames);
  if (pattern.type === "RestElement") return patternNames(pattern.argument);
  if (pattern.type === "AssignmentPattern") return patternNames(pattern.left);
  return [];
}

/**
 * Whether the Carrier declares `name` in the scope its top-level code runs in,
 * in any way a name is declared there: a lexical declaration, class, import,
 * enum, namespace or import-equals at the top (exported or not), and a `var` or
 * a function declaration at any depth short of another function, since those
 * hoist out of blocks. An ambient `declare` has no runtime effect and declares
 * nothing.
 */
function declares(program: Node, name: string): boolean {
  const here = (declaration: Node, direct: boolean): string[] => {
    if (declaration.declare === true || declaration.type === "TSDeclareFunction") return [];
    if (declaration.type === "VariableDeclaration")
      return declaration.kind === "var" || direct
        ? nodes(declaration.declarations).flatMap((d) => patternNames(d.id))
        : [];
    if (declaration.type === "FunctionDeclaration") return patternNames(declaration.id);
    if (!direct) return [];
    if (declaration.type === "ImportDeclaration")
      return nodes(declaration.specifiers).flatMap((x) => patternNames(x.local));
    return patternNames(declaration.id);
  };
  let found = false;
  const visit = (node: Node, direct: boolean) => {
    if (found) return;
    const wrapped = node.type.startsWith("Export") && isNode(node.declaration) ? node.declaration : node;
    if (here(wrapped, direct).includes(name)) {
      found = true;
      return;
    }
    // Another function's own scope is not this one; a block's `let`, `const` and `class` stay in the block.
    if (FUNCTION.has(wrapped.type)) return;
    for (const value of Object.values(wrapped))
      for (const child of nodes(value)) visit(child, direct && wrapped.type === "Program");
  };
  visit(program, true);
  return found;
}

/** One step down a syntax tree: a node, and the key under which the next one hangs on it. */
type Step = { node: Node; key: string };

const PATTERN = new Set(["ObjectPattern", "ArrayPattern", "RestElement", "AssignmentPattern"]);
const FUNCTION = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ObjectMethod",
  "ClassMethod",
]);
/** TypeScript nodes that wrap an expression, which stays a use; every other TypeScript parent holds a type, not a use. */
const WRAPS = new Set([
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "TSInstantiationExpression",
]);

/** Whether the identifier at the end of `path` only names something: a property, a label, a type, or a name being imported or exported. */
function onlyNames(path: Step[]): boolean {
  const { node: parent, key } = path[path.length - 1];
  if ((parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") && key === "property")
    return !parent.computed;
  if (["ObjectProperty", "ObjectMethod", "ClassProperty", "ClassMethod"].includes(parent.type) && key === "key")
    return !parent.computed;
  if (parent.type === "ImportSpecifier" && key === "imported") return true;
  if (parent.type === "ExportSpecifier" && key === "exported") return true;
  if (["LabeledStatement", "BreakStatement", "ContinueStatement"].includes(parent.type) && key === "label") return true;
  return parent.type.startsWith("TS") && !WRAPS.has(parent.type) && parent.type !== "TSImportEqualsDeclaration";
}

/** Whether the identifier at the end of `path` is where a name is declared, not a use: an import, a declarator, a parameter, a function or class name. */
function isDeclaration(path: Step[]): boolean {
  const { node: parent, key } = path[path.length - 1];
  if (
    ["ImportDefaultSpecifier", "ImportNamespaceSpecifier", "ImportSpecifier"].includes(parent.type) &&
    key === "local"
  )
    return true;
  if (parent.type === "TSImportEqualsDeclaration" && key === "id") return true;
  if (
    (FUNCTION.has(parent.type) || parent.type === "ClassDeclaration" || parent.type === "ClassExpression") &&
    (key === "id" || key === "params")
  )
    return true;
  if (parent.type === "CatchClause" && key === "param") return true;
  // A name in a pattern is declared when the pattern is, and written when the pattern is the target of an assignment.
  const slot =
    (parent.type === "ObjectProperty" && key === "value" && path[path.length - 2]?.node.type === "ObjectPattern") ||
    (parent.type === "ArrayPattern" && key === "elements") ||
    (parent.type === "RestElement" && key === "argument") ||
    (parent.type === "AssignmentPattern" && key === "left");
  if (parent.type === "VariableDeclarator" && key === "id") return true;
  if (!slot) return false;
  let i = path.length - 1;
  while (
    i > 0 &&
    (PATTERN.has(path[i].node.type) || (path[i].node.type === "ObjectProperty" && PATTERN.has(path[i - 1].node.type)))
  )
    i--;
  const top = path[i];
  return (
    (top.node.type === "VariableDeclarator" && top.key === "id") ||
    (FUNCTION.has(top.node.type) && top.key === "params") ||
    (top.node.type === "CatchClause" && top.key === "param")
  );
}

/** Where a chain of members stands among what `node:test` offers: its module, `test` or `it`; a test or a context to call; a part that is not a test function. */
type At = "module" | "namespace" | "test" | "context" | "other" | "free";

/** Where a name bound to `node:test` starts. */
const START: Record<Binding, At> = {
  module: "module",
  namespace: "namespace",
  test: "module",
  it: "module",
  skip: "test",
  only: "test",
  todo: "test",
  expectFailure: "test",
  describe: "context",
  suite: "context",
};

/**
 * Where `member` leads from `from`, by what `node:test` offers, or nothing if
 * it offers no such member there. The namespace, the default function, `test`
 * and `it` offer the same members, except that only the namespace has a
 * `default`; a context offers its modifiers; a test or context to call offers
 * none, and any member such as one inherited from `Function` or `Object` is
 * not `node:test`'s. Past a part that is not a test function (`mock`, `after`,
 * `assert`), nothing more is asked of the members.
 */
function next(from: At, member: string): At | undefined {
  if (from === "free") return "free";
  if (from === "context") return MODIFIERS.has(member) ? "other" : undefined;
  if (from !== "module" && from !== "namespace") return undefined;
  // Only the namespace has a `default`: it is the function, which has none.
  if (member === "default") return from === "namespace" ? "module" : undefined;
  if (member === "test" || member === "it") return "module";
  if (member === "describe" || member === "suite") return "context";
  if (MODIFIERS.has(member)) return "test";
  return (NODE_TEST.ignored as readonly string[]).includes(member) ? "free" : undefined;
}

/** Whether the members of a chain from `binding` are all ones `node:test` offers there, so calling through it cannot be a mutator it merely inherits. */
function offered(binding: Binding, chain: (string | undefined)[]): boolean {
  let at: At | undefined = START[binding];
  for (const member of chain) {
    if (at === "free") return true;
    at = member === undefined ? undefined : next(at, member);
    if (!at) return false;
  }
  return true;
}

/**
 * The members of the chain the identifier at the end of `path` is the root of,
 * if the chain is only called: `f(...)` is `[]`, `f.g.h(...)` is `["g", "h"]`,
 * a computed member that is not a literal is `undefined`. Nothing if it is not
 * called.
 */
function calledChain(path: Step[]): (string | undefined)[] | undefined {
  const chain: (string | undefined)[] = [];
  let i = path.length - 1;
  while (
    i >= 0 &&
    (path[i].node.type === "MemberExpression" || path[i].node.type === "OptionalMemberExpression") &&
    path[i].key === "object"
  ) {
    const member = path[i].node;
    chain.push(member.computed ? literal(member.property) : nameOf(member.property));
    i--;
  }
  const called =
    i >= 0 &&
    (path[i].node.type === "CallExpression" || path[i].node.type === "OptionalCallExpression") &&
    path[i].key === "callee";
  return called ? chain : undefined;
}

/**
 * Where each of `names` is first used in some way other than being called, or
 * having a member of it that `node:test` offers called: written to, a member of it written to or
 * deleted, passed, aliased, returned, re-exported, or read. Such a use could
 * change what the name is at a later call, which static reading cannot follow,
 * so a name used so is not trusted to be what `node:test` offers.
 */
function usedOtherwise(program: Node, names: Set<string>, bound: Map<string, Binding>): Map<string, number> {
  const found = new Map<string, number>();
  const visit = (node: Node, path: Step[]) => {
    if (
      node.type === "Identifier" &&
      names.has(node.name as string) &&
      path.length &&
      !onlyNames(path) &&
      !isDeclaration(path)
    ) {
      // Called, or a member of it called, through members `node:test` offers; any other member could be one it
      // merely inherits, such as `__defineGetter__`, which can change what a later call is.
      const chain = calledChain(path);
      const binding = bound.get(node.name as string);
      const ok = chain !== undefined && (binding === undefined || offered(binding, chain));
      if (!ok && !found.has(node.name as string)) found.set(node.name as string, at(node));
    }
    for (const [key, value] of Object.entries(node))
      for (const child of nodes(value)) visit(child, [...path, { node, key }]);
  };
  visit(program, []);
  return found;
}

/**
 * The string an expression is by its syntax alone: a string literal, a template
 * of such, or a `+` of such, with the program-level `const` names of those.
 * Nothing that has to be run is evaluated.
 */
function fold(node: unknown, consts: Map<string, string>): string | undefined {
  if (!isNode(node)) return undefined;
  if (node.type === "StringLiteral") return node.value as string;
  if (node.type === "Identifier") return consts.get(node.name as string);
  if (node.type === "TemplateLiteral") {
    const quasis = node.quasis as { value: { cooked?: string | null } }[];
    const parts = nodes(node.expressions);
    let out = "";
    for (const [index, quasi] of quasis.entries()) {
      if (quasi.value.cooked === undefined || quasi.value.cooked === null) return undefined;
      out += quasi.value.cooked;
      if (index < parts.length) {
        const part = fold(parts[index], consts);
        if (part === undefined) return undefined;
        out += part;
      }
    }
    return out;
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    const left = fold(node.left, consts);
    const right = fold(node.right, consts);
    return left !== undefined && right !== undefined ? left + right : undefined;
  }
  return undefined;
}

/** The program-level `const` names whose value is a string by syntax alone, in the order they are declared. */
function constants(program: Node): Map<string, string> {
  const consts = new Map<string, string>();
  for (const statement of nodes(program.body))
    if (statement.type === "VariableDeclaration" && statement.kind === "const")
      for (const d of nodes(statement.declarations)) {
        const value = isNode(d.id) && d.id.type === "Identifier" ? fold(d.init, consts) : undefined;
        if (value !== undefined) consts.set((d.id as Node).name as string, value);
      }
  return consts;
}

/**
 * Where the Carrier names `node:test` other than in the declarations that bind
 * it: another `require`, a dynamic import, a re-export, a lookup by name, with
 * the specifier written out or built from literals, templates, `+` and
 * program-level `const` names. Each reaches the same functions the bound names
 * do. A specifier built by anything else, such as a call, a join or a
 * parameter, is not evaluated.
 */
function otherRoute(program: Node, recognized: Set<Node>): number | undefined {
  const consts = constants(program);
  let line: number | undefined;
  const visit = (node: Node) => {
    if (line !== undefined) return;
    const text = ["StringLiteral", "TemplateLiteral", "BinaryExpression"].includes(node.type);
    if (text && !recognized.has(node) && fold(node, consts) === "node:test") line = at(node);
    else for (const value of Object.values(node)) for (const child of nodes(value)) visit(child);
  };
  visit(program);
  return line;
}

/**
 * A Carrier's module format as its name settles it: `.cjs` and `.cts` are
 * CommonJS, `.mjs` and `.mts` are ES modules, and `.js` and `.ts` take theirs
 * from the nearest package, which reading the Carrier is not given.
 */
const format = (file: string): "cjs" | "esm" | "package" =>
  /\.c[jt]s$/.test(file) ? "cjs" : /\.m[jt]s$/.test(file) ? "esm" : "package";

/**
 * The names `node:test` is bound to that the Carrier can be trusted to leave
 * as Node defines them, and the reason for each that cannot. The Carrier is
 * trusted only for what its own source shows: a name it uses other than by
 * calling it, any other route to `node:test` than its own declarations, and
 * `require` when it is written, redeclared or so used, are not, and all names
 * share one verdict, since they reach the same functions.
 * What happens outside the Carrier's source, such as a preload hook or another
 * module that changes `node:test`, is not seen by reading it. Scopes are not
 * tracked, so a local name shadowing one of these and used otherwise than by
 * calling it also costs the trust, which only ever refuses more.
 */
function trusted(
  program: Node,
  file: string,
): {
  bound: Map<string, Binding>;
  dropped: Map<string, string>;
  declared: Map<string, { index: number; line: number }>;
} {
  const { bound, viaRequire, declared, recognized } = bindings(program);
  const dropped = new Map<string, string>();
  const names = new Set(bound.keys());
  if (viaRequire.size) names.add("require");
  const used = usedOtherwise(program, names, bound);
  const route = otherRoute(program, recognized);
  // Every name of `node:test` reaches the same functions and members, so what is said of one is said of all.
  const [first] = [...used].filter(([name]) => name !== "require");
  const reason = first
    ? `${first[0]} is used other than by calling it, at line ${first[1]}`
    : route !== undefined
      ? `node:test is reached other than by the Carrier's own import or const require, at line ${route}`
      : undefined;
  if (reason)
    for (const name of [...bound.keys()]) {
      dropped.set(name, reason);
      bound.delete(name);
    }
  // `require` is the CommonJS loader only in a CommonJS Carrier; an ES module has none.
  const kind = format(file);
  const why =
    kind === "esm"
      ? "require is not defined in an ES module"
      : kind === "package"
        ? `the module format of a ${file.slice(file.lastIndexOf("."))} Carrier comes from its package and require is not known to be the CommonJS loader`
        : used.has("require")
          ? `require is used other than by calling it, at line ${used.get("require")}`
          : declares(program, "require")
            ? "require is declared in the Carrier"
            : undefined;
  if (why)
    for (const name of viaRequire) {
      dropped.set(name, why);
      bound.delete(name);
    }
  return { bound, dropped, declared };
}

/**
 * What a call is, by its callee, from how `node:test` is bound: `test` for a
 * call that defines a Test Case (`test(...)`, `it(...)`, a named `skip`, `only`
 * or `todo`, and the same reached through any chain of members of `test`, `it`
 * or the module, such as `nt.test.todo(...)`), `other` for one that opens a
 * context (`describe`, `suite`, their `skip`, `only` and `todo`, and a
 * `t.test(...)` subtest), nothing for any other call. A chain is followed
 * member by member through what `node:test` offers, and is nothing where it
 * leaves it; a member computed from an expression is nothing, since which
 * function it names is not known without evaluating it, and calling through
 * one costs the name its trust (see `usedOtherwise`).
 */
function role(callee: unknown, bound: Map<string, Binding>): "test" | "other" | undefined {
  // Each member of the chain by name; a computed one that is a literal names its member just as a dot does.
  const chain: (string | undefined)[] = [];
  let root: unknown = callee;
  while (isNode(root) && (root.type === "MemberExpression" || root.type === "OptionalMemberExpression")) {
    chain.unshift(root.computed ? literal(root.property) : nameOf(root.property));
    root = root.object;
  }
  if (!isNode(root) || root.type !== "Identifier") return undefined;
  const binding = bound.get(root.name as string);
  const last = chain[chain.length - 1];
  // Unbound, a chain ending in a `node:test` name is a subtest or nested suite opened through some context, such as `t.test(...)`.
  if (binding === undefined) return last !== undefined && EXPORTS.has(last) ? "other" : undefined;
  let at: At | undefined = START[binding];
  for (const member of chain) {
    // A member known only by evaluating it names no function `node:test` offers that can be told from another.
    if (member === undefined) return undefined;
    at = next(at, member);
    if (!at || at === "free") return undefined;
  }
  // The namespace is an object: calling it registers nothing.
  return at === "namespace" ? undefined : at === "module" || at === "test" ? "test" : "other";
}

/**
 * The name a member of an object literal has by its syntax alone: an
 * identifier, a string or number literal, or a computed key that is itself one
 * of the literals or a template without substitutions. A computed key built
 * from any other expression has none without evaluating it.
 */
function staticKey(member: Node): string | undefined {
  const key = member.key;
  if (!isNode(key)) return undefined;
  if (!member.computed && key.type === "Identifier") return key.name as string;
  if (key.type === "NumericLiteral") return String(key.value);
  return literal(key);
}

/** The name a callee chain starts from: `f` for `f(...)` and `f.g.h(...)`. */
function rootName(callee: unknown): string | undefined {
  let root = callee;
  while (isNode(root) && (root.type === "MemberExpression" || root.type === "OptionalMemberExpression"))
    root = root.object;
  return isNode(root) && root.type === "Identifier" ? (root.name as string) : undefined;
}

/** The member of an options object that is a plain property named `tests`. */
const isTests = (member: Node): boolean =>
  member.type === "ObjectProperty" && !member.computed && staticKey(member) === "tests";

/** Whether any member of the object literal is named `tests` by its syntax, however it is written: property, method, accessor, computed or not. */
const mentionsTests = (object: Node): boolean =>
  nodes(object.properties).some((m) => m.type !== "SpreadElement" && staticKey(m) === "tests");

/**
 * Why an options object cannot be read for `tests`, or the one plain property
 * that states it. An object literal's members are properties, methods or
 * accessors, and spreads; only plain, non-computed properties are read, so any
 * other member, which could define or override `tests`, and a second `tests`,
 * are refused.
 */
function optionsTests(options: Node): { property?: Node; error?: string } {
  let property: Node | undefined;
  for (const member of nodes(options.properties)) {
    if (member.type === "SpreadElement") return { error: "options must not spread, since that could carry tests" };
    if (member.type !== "ObjectProperty" && member.type !== "ObjectMethod")
      return { error: "options hold a member this skill does not read, which could carry tests" };
    if (member.computed) return { error: "options must not compute keys, since that could carry tests" };
    if (member.type === "ObjectMethod" && staticKey(member) === "tests")
      return { error: "tests must be a plain property, not a method or accessor" };
    if (isTests(member)) {
      if (property) return { error: "tests is stated twice" };
      property = member;
    }
  }
  return { property };
}

/** What the `tests` option at `node` states, or why it is not a literal of `{ kind: ["id", ...] }`. */
function readTests(node: Node, file: string): { tests: Tests[]; errors: string[] } {
  const tests: Tests[] = [];
  const errors: string[] = [];
  const at_ = `${file}:${at(node)}`;
  const value = node.type === "ObjectProperty" ? node.value : undefined;
  if (!isNode(value) || value.type !== "ObjectExpression")
    return { tests, errors: [`${at_}: tests must be an object literal of kinds, each a list of ids`] };
  const kinds = new Set<string>();
  for (const property of nodes(value.properties)) {
    const kind = property.type === "ObjectProperty" && !property.computed ? nameOf(property.key) : undefined;
    if (kind === undefined || !kind.trim() || /\s/.test(kind)) {
      errors.push(`${at_}: a kind must be a plain name, never computed, spread or blank`);
      continue;
    }
    if (kinds.has(kind)) {
      errors.push(`${at_}: tests names kind ${kind} twice`);
      continue;
    }
    kinds.add(kind);
    const list = property.value;
    const ids = isNode(list) && list.type === "ArrayExpression" ? (list.elements as unknown[]) : undefined;
    if (!ids) {
      errors.push(`${at_}: tests ${kind} must be a list of ids`);
      continue;
    }
    if (!ids.length) errors.push(`${at_}: tests ${kind} must name at least one id`);
    const seen = new Set<string>();
    for (const element of ids) {
      const id = literal(element);
      if (id === undefined || !id.trim() || /\s/.test(id))
        errors.push(`${at_}: tests ${kind} ids must be string literals without whitespace`);
      else if (seen.has(id)) errors.push(`${at_}: tests ${kind} "${id}" twice`);
      else {
        seen.add(id);
        tests.push({ kind, id });
      }
    }
  }
  if (!kinds.size && !errors.length) errors.push(`${at_}: tests must name at least one kind`);
  return { tests, errors };
}

/**
 * The Test Cases of the Carrier whose source is `text`, read from its syntax,
 * never by executing it: each top-level `node:test` call with a literal name.
 * A Test Case states what it tests in the literal `tests` option of that call,
 * `test("name", { tests: { requirement: ["id"] } }, () => {})`. Anything else
 * a call carries in its options is Node's and never read. Refused, never
 * inferred: a Carrier that does not parse; `tests` on a call that is not a
 * top-level Test Case, or whose name is not a literal; options that are not a
 * literal object where a call has them; a name an annotated call shares with
 * another; `tests` that is not a literal of kinds, each a non-empty list of
 * distinct ids. `file` names the Carrier, in errors and in each identity.
 */
export function parseTestCases(text: string, file: string): { cases: TestCase[]; errors: string[] } {
  const ts = /\.[cm]?ts$/.test(file);
  let program: Node;
  try {
    program = parse(text, {
      sourceType: "unambiguous",
      plugins: ts ? ["typescript"] : [],
      allowAwaitOutsideFunction: true,
    }).program as unknown as Node;
  } catch (e) {
    return { cases: [], errors: [`${file}: unparseable carrier (${e instanceof Error ? e.message : String(e)})`] };
  }
  // CommonJS has no `import` or `export` declarations: a `.cjs` Carrier with one throws before registering anything.
  if (/\.cjs$/.test(file)) {
    const esm = nodes(program.body).find((n) =>
      ["ImportDeclaration", "ExportNamedDeclaration", "ExportDefaultDeclaration", "ExportAllDeclaration"].includes(
        n.type,
      ),
    );
    if (esm) return { cases: [], errors: [`${file}:${at(esm)}: ES module syntax in a CommonJS Carrier`] };
  }
  const { bound, dropped, declared } = trusted(program, file);
  /** Why a top-level call was not recognized: it runs before the declaration that binds its callee. */
  const early = new Map<Node, string>();
  const errors: string[] = [];
  /** Each recognized top-level Test Case call, with the options object its `tests` may sit in, if it has one. */
  const top = new Map<Node, Node | undefined>();
  const found: { name: string; tests: Tests[]; annotated: boolean; line: number }[] = [];
  /** Top-level tests whose name Node reports by what they are, not by a literal: known only by running them. */
  const unresolved: number[] = [];
  for (const [index, statement] of nodes(program.body).entries()) {
    let call: unknown = statement.type === "ExpressionStatement" ? statement.expression : undefined;
    while (isNode(call) && call.type === "AwaitExpression") call = call.argument;
    if (!isNode(call) || call.type === "NewExpression" || !isCall(call) || role(call.callee, bound) !== "test")
      continue;
    const where_ = declared.get(rootName(call.callee) ?? "");
    if (where_ && where_.index >= index) {
      early.set(call, `${rootName(call.callee)} is used before its declaration at line ${where_.line}`);
      continue;
    }
    const args = nodes(call.arguments);
    const where = `${file}:${at(call)}`;
    // An argument list that is not written out cannot be read for its options; the walk below refuses it, once.
    if (args.some((a) => a.type === "SpreadElement")) {
      top.set(call, undefined);
      continue;
    }
    // Options are the second argument, before the function; with a third they must be a literal object.
    const options =
      args.length >= 3 || (args.length === 2 && args[1].type === "ObjectExpression") ? args[1] : undefined;
    top.set(call, options?.type === "ObjectExpression" ? options : undefined);
    if (args.length >= 3 && options?.type !== "ObjectExpression") {
      errors.push(`${where}: options must be an object literal`);
      continue;
    }
    const read = options ? optionsTests(options) : {};
    if (read.error) {
      errors.push(`${where}: ${read.error}`);
      continue;
    }
    const name = literal(args[0]);
    const named = name !== undefined && name !== "";
    if (read.property && !named) {
      errors.push(`${where}: a Test Case that states what it tests must have a literal, non-empty name`);
      continue;
    }
    if (!named) {
      unresolved.push(at(call));
      continue;
    }
    const parsed = read.property ? readTests(read.property, file) : { tests: [], errors: [] };
    errors.push(...parsed.errors);
    found.push({ name, tests: parsed.tests, annotated: read.property !== undefined, line: at(call) });
  }
  // Node reports a test without a literal, non-empty name as its function's name or `<anonymous>`, so such a
  // name could be any other's: traced Test Cases need every top-level test named, or their identity is not known.
  if (found.some((f) => f.annotated))
    for (const line of unresolved)
      errors.push(
        `${file}:${line}: a Carrier with traced Test Cases must give every top-level test a literal, non-empty name`,
      );
  // No other call states `tests`, however it is written. One that registers a test (`role`), anywhere, must also
  // not hide it in its options; any other is read by syntax alone, so a key computed from an expression is not evaluated.
  (function walk(node: Node) {
    for (const value of Object.values(node))
      for (const child of nodes(value)) {
        if (isCall(child)) {
          const registers = role(child.callee, bound) !== undefined;
          for (const arg of nodes(child.arguments)) {
            if (registers && arg.type === "SpreadElement") {
              errors.push(`${file}:${at(child)}: arguments must not be spread, since that could carry tests`);
              continue;
            }
            if (arg.type !== "ObjectExpression" || (top.has(child) && top.get(child) === arg)) continue;
            const hidden = registers ? optionsTests(arg).error : undefined;
            if (hidden) errors.push(`${file}:${at(child)}: ${hidden}`);
            else if (mentionsTests(arg)) {
              const root = rootName(child.callee) ?? "";
              const untrusted = early.get(child) ?? dropped.get(root);
              const why = untrusted
                ? ` (${untrusted}, so it is not trusted to be node:test)`
                : bound.get(root) === "namespace" && isNode(child.callee) && child.callee.type === "Identifier"
                  ? ` (${root} is the namespace of node:test, an object that cannot be called)`
                  : "";
              errors.push(
                `${file}:${at(child)}: tests belongs on the options of a top-level Test Case, not on another call${why}`,
              );
            }
          }
        }
        walk(child);
      }
  })(program);
  const counts = new Map<string, number>();
  for (const { name } of found) counts.set(name, (counts.get(name) ?? 0) + 1);
  for (const f of found)
    if (f.annotated && counts.get(f.name)! > 1)
      errors.push(`${file}:${f.line}: Test Case "${f.name}" is named more than once`);
  // A name shared by several names no single Test Case, so it resolves to none.
  const cases = found
    .filter((f) => counts.get(f.name) === 1)
    .map((f) => ({ carrier: file, name: f.name, tests: f.tests }));
  return { cases, errors };
}

/** The Test Cases of the Carrier at `file`, or why it cannot be read. Errors and identities name it `name`, by default `file`. */
export function readTestCases(file: string, name = file): { cases: TestCase[]; errors: string[] } {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    return { cases: [], errors: [`${name}: unreadable carrier (${e instanceof Error ? e.message : String(e)})`] };
  }
  return parseTestCases(text, name);
}

/**
 * The identities of the Test Cases, among those given, that test `id` of
 * `kind`, in the order given, computed from what the Test Cases themselves
 * state. There is no other record of it, so it is never stale, and a Test Case
 * tests only what it names: nothing is inferred from what the named meaning is
 * related to.
 */
export function testCasesTesting(cases: TestCase[], kind: string, id: string): string[] {
  return cases.filter((c) => c.tests.some((t) => t.kind === kind && t.id === id)).map(testCaseId);
}
