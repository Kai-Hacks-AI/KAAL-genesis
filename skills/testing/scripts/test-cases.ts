import { parse } from "@babel/parser";
import fs from "node:fs";

/** One thing a Test Case tests: the `kind` of existing meaning, and its `id`. Testing knows neither what kinds exist nor whether an id names anything. */
export type Tests = { kind: string; id: string };

/**
 * A Test Case: one top-level `node:test` call with a literal name, in the
 * Carrier (the `*.test.*` file) named `carrier` by the caller. Its identity is
 * the carrier and the name Node reports for it. `tests` is what it states it
 * tests, in declaration order.
 */
export type TestCase = { carrier: string; name: string; tests: Tests[] };

/** A Test Case's identity: its carrier, then its name. */
export const testCaseId = (tc: Pick<TestCase, "carrier" | "name">): string => `${tc.carrier}::${tc.name}`;

/** The syntax tree, as far as the reader looks at it: nodes are objects with a `type`. */
type Node = { type: string; loc?: { start: { line: number } } | null; [key: string]: unknown };
const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as Node).type === "string";
const nodes = (value: unknown): Node[] => (Array.isArray(value) ? value.filter(isNode) : isNode(value) ? [value] : []);
const at = (node: Node): number => node.loc?.start.line ?? 0;

/** What `node:test` exports that a Case is written with: how a local name is bound to it. */
type Binding = "module" | "test" | "it" | "describe" | "suite";
const EXPORTS = new Set<string>(["test", "it", "describe", "suite"]);
const MODIFIERS = new Set(["skip", "only", "todo"]);

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
 * What a call is, by its callee: `test` for a `node:test` test (`test(...)`,
 * `it(...)` and their `skip`, `only` and `todo` forms), `other` for what else
 * of `node:test` or its look-alikes opens a context (`describe`, `suite`, a
 * `t.test(...)` subtest), nothing for any other call.
 */
function role(callee: unknown, bound: Map<string, Binding>): "test" | "other" | undefined {
  if (!isNode(callee)) return undefined;
  if (callee.type === "Identifier") {
    const binding = bound.get(callee.name as string);
    return binding === "module" || binding === "test" || binding === "it"
      ? "test"
      : binding === "describe" || binding === "suite"
        ? "other"
        : undefined;
  }
  if (callee.type !== "MemberExpression" || callee.computed) return undefined;
  const property = nameOf(callee.property);
  const object = callee.object;
  if (isNode(object) && object.type === "Identifier") {
    const binding = bound.get(object.name as string);
    if (binding === "describe" || binding === "suite") return property && MODIFIERS.has(property) ? "other" : undefined;
    if (binding) {
      if (property && MODIFIERS.has(property))
        return binding === "module" || binding === "test" || binding === "it" ? "test" : undefined;
      if (binding === "module" && (property === "test" || property === "it")) return "test";
      if (binding === "module" && (property === "describe" || property === "suite")) return "other";
    }
  }
  // A subtest or nested suite opened through some context, such as `t.test(...)`.
  return property === "test" || property === "it" || property === "describe" || property === "suite"
    ? "other"
    : undefined;
}

/** The property named `tests` of an options object, if it has one. */
const testsProperty = (options: Node): Node | undefined =>
  nodes(options.properties).find((p) => p.type !== "SpreadElement" && !p.computed && nameOf(p.key) === "tests");

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
  const top = new Map<Node, true>();
  const found: { name: string; tests: Tests[]; annotated: boolean; line: number }[] = [];
  for (const statement of nodes(program.body)) {
    const call = statement.type === "ExpressionStatement" ? statement.expression : undefined;
    if (!isNode(call) || call.type !== "CallExpression" || role(call.callee, bound) !== "test") continue;
    top.set(call, true);
    const args = nodes(call.arguments);
    const where = `${file}:${at(call)}`;
    // Options are the second argument, before the function; with a third they must be a literal object.
    const options =
      args.length >= 3 || (args.length === 2 && args[1].type === "ObjectExpression") ? args[1] : undefined;
    if (args.length >= 3 && options?.type !== "ObjectExpression") {
      errors.push(`${where}: options must be an object literal`);
      continue;
    }
    const hiding = options
      ? nodes(options.properties).find((p) => p.type === "SpreadElement" || (p.type !== "ObjectMethod" && p.computed))
      : undefined;
    if (hiding) {
      errors.push(`${where}: options must not spread or compute keys, since that could carry tests`);
      continue;
    }
    const property = options ? testsProperty(options) : undefined;
    const name = literal(args[0]);
    if (property && name === undefined) {
      errors.push(`${where}: a Test Case that states what it tests must have a literal name`);
      continue;
    }
    if (name === undefined) continue;
    const read = property ? readTests(property, file) : { tests: [], errors: [] };
    errors.push(...read.errors);
    found.push({ name, tests: read.tests, annotated: property !== undefined, line: at(call) });
  }
  // Every other call that looks like a `node:test` context and states what it tests is not a Test Case.
  (function walk(node: Node) {
    for (const value of Object.values(node))
      for (const child of nodes(value)) {
        if (child.type === "CallExpression" && !top.has(child) && role(child.callee, bound) !== undefined)
          for (const arg of nodes(child.arguments))
            if (arg.type === "ObjectExpression" && testsProperty(arg))
              errors.push(
                `${file}:${at(child)}: tests belongs on a top-level Test Case, not on a nested or other call`,
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
