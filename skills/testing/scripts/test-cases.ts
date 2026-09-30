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
 */
export const NODE_TEST = {
  test: ["test", "it", "skip", "only", "todo"],
  other: ["describe", "suite"],
  ignored: ["after", "afterEach", "assert", "before", "beforeEach", "default", "mock", "run", "snapshot"],
} as const;

/** How a local name is bound to `node:test`: to the module or its default export, or to one named export. */
type Binding = "module" | "test" | "it" | "skip" | "only" | "todo" | "describe" | "suite";
const EXPORTS = new Set<string>([...NODE_TEST.test, ...NODE_TEST.other]);
/** What `describe` and `suite` offer as members: each opens a context. */
const CONTEXT_MEMBERS = new Set(["skip", "only", "todo"]);

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

/** The local names `node:test` is bound to at the top of a Carrier: imported, or required. */
function bindings(program: Node): Map<string, Binding> {
  const bound = new Map<string, Binding>();
  for (const statement of nodes(program.body)) {
    if (statement.type === "ImportDeclaration" && literal(statement.source) === "node:test") {
      if (statement.importKind === "type") continue;
      for (const s of nodes(statement.specifiers)) {
        const local = nameOf(s.local);
        if (!local || s.importKind === "type") continue;
        if (s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier") bound.set(local, "module");
        else if (s.type === "ImportSpecifier") {
          const imported = nameOf(s.imported);
          if (imported && EXPORTS.has(imported)) bound.set(local, imported as Binding);
        }
      }
    } else if (
      statement.type === "TSImportEqualsDeclaration" &&
      isNode(statement.moduleReference) &&
      literal(statement.moduleReference.expression) === "node:test"
    ) {
      const local = nameOf(statement.id);
      if (local) bound.set(local, "module");
    } else if (statement.type === "VariableDeclaration") {
      for (const d of nodes(statement.declarations)) {
        const init = d.init;
        if (
          !isNode(init) ||
          init.type !== "CallExpression" ||
          nameOf(init.callee) !== "require" ||
          literal(nodes(init.arguments)[0]) !== "node:test"
        )
          continue;
        if (isNode(d.id) && d.id.type === "Identifier") bound.set(d.id.name as string, "module");
        else if (isNode(d.id) && d.id.type === "ObjectPattern")
          for (const p of nodes(d.id.properties)) {
            const imported = nameOf(p.key);
            const local = nameOf(p.value);
            if (p.type === "ObjectProperty" && imported && local && EXPORTS.has(imported))
              bound.set(local, imported as Binding);
          }
      }
    }
  }
  return bound;
}

/**
 * What a call is, by its callee, from how `node:test` is bound: `test` for a
 * call that defines a Test Case (`test(...)`, `it(...)`, a named `skip`, `only`
 * or `todo`, and the same reached through any chain of members of `test`, `it`
 * or the module, such as `nt.test.todo(...)`), `other` for one that opens a
 * context (`describe`, `suite`, their `skip`, `only` and `todo`, and a
 * `t.test(...)` subtest), nothing for any other call. A chain is followed
 * member by member through what `node:test` offers, and is nothing where it
 * leaves it.
 */
function role(callee: unknown, bound: Map<string, Binding>): "test" | "other" | undefined {
  const chain: string[] = [];
  let root: unknown = callee;
  while (isNode(root) && root.type === "MemberExpression") {
    const property = root.computed ? undefined : nameOf(root.property);
    if (property === undefined) return undefined;
    chain.unshift(property);
    root = root.object;
  }
  if (!isNode(root) || root.type !== "Identifier") return undefined;
  const binding = bound.get(root.name as string);
  // Unbound, a chain ending in a `node:test` name is a subtest or nested suite opened through some context, such as `t.test(...)`.
  if (binding === undefined) return chain.length && EXPORTS.has(chain[chain.length - 1]) ? "other" : undefined;
  // Where the chain stands: at the module, `test` or `it` (which offer the same members); at a test to call; at a context; at one to call.
  type At = "module" | "test" | "context" | "other";
  const start: Record<Binding, At> = {
    module: "module",
    test: "module",
    it: "module",
    skip: "test",
    only: "test",
    todo: "test",
    describe: "context",
    suite: "context",
  };
  const step = (from: At, member: string): At | undefined =>
    from === "module"
      ? member === "test" || member === "it"
        ? "module"
        : member === "describe" || member === "suite"
          ? "context"
          : CONTEXT_MEMBERS.has(member)
            ? "test"
            : undefined
      : from === "context" && CONTEXT_MEMBERS.has(member)
        ? "other"
        : undefined;
  let at: At | undefined = start[binding];
  for (const member of chain) {
    at = step(at, member);
    if (!at) return undefined;
  }
  return at === "module" || at === "test" ? "test" : "other";
}

/** The member of an options object, or of any object literal, that is a plain property named `tests`. */
const isTests = (member: Node): boolean =>
  member.type === "ObjectProperty" && !member.computed && nameOf(member.key) === "tests";

/** Whether any member of the object literal is named `tests`, however it is written: property, method, accessor, computed or not. */
const mentionsTests = (object: Node): boolean =>
  nodes(object.properties).some((m) => m.type !== "SpreadElement" && nameOf(m.key) === "tests");

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
    if (member.type === "ObjectMethod" && nameOf(member.key) === "tests")
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
  const bound = bindings(program);
  const errors: string[] = [];
  /** Each recognized top-level Test Case call, with the options object its `tests` may sit in, if it has one. */
  const top = new Map<Node, Node | undefined>();
  const found: { name: string; tests: Tests[]; annotated: boolean; line: number }[] = [];
  /** Top-level tests whose name Node reports by what they are, not by a literal: known only by running them. */
  const unresolved: number[] = [];
  for (const statement of nodes(program.body)) {
    let call: unknown = statement.type === "ExpressionStatement" ? statement.expression : undefined;
    while (isNode(call) && call.type === "AwaitExpression") call = call.argument;
    if (!isNode(call) || call.type !== "CallExpression" || role(call.callee, bound) !== "test") continue;
    const args = nodes(call.arguments);
    const where = `${file}:${at(call)}`;
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
  // Any other call that states `tests` in an object literal is not a Test Case, however it is written.
  (function walk(node: Node) {
    for (const value of Object.values(node))
      for (const child of nodes(value)) {
        if (child.type === "CallExpression")
          for (const arg of nodes(child.arguments))
            if (arg.type === "ObjectExpression" && mentionsTests(arg) && !(top.has(child) && top.get(child) === arg))
              errors.push(
                `${file}:${at(child)}: tests belongs on the options of a top-level Test Case, not on another call`,
              );
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
