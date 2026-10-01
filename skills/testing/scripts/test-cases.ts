import { parse } from "@babel/parser";
import fs from "node:fs";

/** One thing a Test Case tests: the `kind` of existing meaning, and its `id`. Testing knows neither what kinds exist nor whether an id names anything. */
export type Tests = { kind: string; id: string };

/**
 * A traceable Test Case: one canonical declaration in the Carrier (the
 * `*.test.*` file) named `carrier` by the caller. Its identity is the carrier
 * and the declared `name`. `tests` is what it declares it tests, in
 * declaration order.
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

/** A string literal's value: written out, never a template, never computed. */
const stringLiteral = (node: unknown): string | undefined =>
  isNode(node) && node.type === "StringLiteral" ? (node.value as string) : undefined;

/** The name of a plain, non-computed property: an identifier or a string literal. */
const keyName = (member: Node): string | undefined =>
  member.type !== "ObjectProperty" || member.computed
    ? undefined
    : isNode(member.key) && member.key.type === "Identifier"
      ? (member.key.name as string)
      : stringLiteral(member.key);

/** A name that can stand as a kind or an id: non-blank, no whitespace. */
const plain = (name: string | undefined): name is string => name !== undefined && name !== "" && !/\s/.test(name);

/** What the `tests` value at `value` declares, or why it is not a literal of `{ kind: ["id", ...] }`. */
function readTests(value: unknown, where: string): { tests: Tests[]; errors: string[] } {
  const tests: Tests[] = [];
  const errors: string[] = [];
  if (!isNode(value) || value.type !== "ObjectExpression")
    return { tests, errors: [`${where}: tests must be an object literal of kinds, each a list of ids`] };
  const kinds = new Set<string>();
  for (const property of nodes(value.properties)) {
    const kind = keyName(property);
    if (!plain(kind)) {
      errors.push(`${where}: a kind must be a plain name, never computed, spread or blank`);
      continue;
    }
    if (kinds.has(kind)) {
      errors.push(`${where}: tests names kind ${kind} twice`);
      continue;
    }
    kinds.add(kind);
    const list = property.value;
    if (!isNode(list) || list.type !== "ArrayExpression") {
      errors.push(`${where}: tests ${kind} must be a list of ids`);
      continue;
    }
    const elements = list.elements as unknown[];
    if (!elements.length) errors.push(`${where}: tests ${kind} must name at least one id`);
    const seen = new Set<string>();
    for (const element of elements) {
      const id = stringLiteral(element);
      if (!plain(id)) errors.push(`${where}: tests ${kind} ids must be string literals without whitespace`);
      else if (seen.has(id)) errors.push(`${where}: tests ${kind} "${id}" twice`);
      else {
        seen.add(id);
        tests.push({ kind, id });
      }
    }
  }
  if (!kinds.size && !errors.length) errors.push(`${where}: tests must name at least one kind`);
  return { tests, errors };
}

/** The local names the Carrier gives the default export of `node:test` by a value import: `import test from "node:test"`. */
function defaultImports(program: Node): Set<string> {
  const names = new Set<string>();
  for (const statement of nodes(program.body)) {
    if (statement.type !== "ImportDeclaration" || stringLiteral(statement.source) !== "node:test") continue;
    if (statement.importKind === "type" || statement.importKind === "typeof") continue;
    for (const specifier of nodes(statement.specifiers))
      if (
        specifier.type === "ImportDefaultSpecifier" &&
        isNode(specifier.local) &&
        specifier.local.type === "Identifier"
      )
        names.add(specifier.local.name as string);
  }
  return names;
}

/**
 * The traceable Test Cases of the Carrier whose source is `text`, read from
 * its syntax, never by executing it. A Test Case declares what it tests by one
 * canonical statement at the top of the Carrier:
 *
 *     import test from "node:test";
 *     test("works offline", { tests: { requirement: ["works-offline"] } }, () => {});
 *
 * that is, a direct call of the local name of the Carrier's value default
 * import of `node:test`, with exactly three arguments, none spread: a
 * non-empty string literal name, an object literal holding a plain `tests`
 * property, and anything as the third. `tests` is a literal object of kinds,
 * each a non-empty list of distinct string-literal ids. The declaration says
 * that the Test Case of that name tests those things. It does not say that
 * Node registered or ran the call: that is for a Run to show.
 *
 * Refused: a Carrier that does not parse; a canonical declaration whose `tests`
 * is not that literal, or is stated twice in its options; two declarations of
 * one name, which make the identity ambiguous. Anything else, including any
 * other use of `node:test`, any other call and any other property named
 * `tests`, is ordinary syntax outside this: neither read nor refused. `file`
 * names the Carrier, in errors and in each identity, and nothing else:
 * whether the source is TypeScript is the extension of `physical`, the path it
 * was read from, which is `file` unless given.
 */
export function parseTestCases(text: string, file: string, physical = file): { cases: TestCase[]; errors: string[] } {
  let program: Node;
  try {
    program = parse(text, {
      sourceType: "unambiguous",
      plugins: /\.[cm]?ts$/.test(physical) ? ["typescript"] : [],
      allowAwaitOutsideFunction: true,
    }).program as unknown as Node;
  } catch (e) {
    return { cases: [], errors: [`${file}: unparseable carrier (${e instanceof Error ? e.message : String(e)})`] };
  }
  const locals = defaultImports(program);
  const errors: string[] = [];
  const declared: { name: string; line: number; tests?: Tests[] }[] = [];
  for (const statement of nodes(program.body)) {
    const call = statement.type === "ExpressionStatement" ? statement.expression : undefined;
    if (!isNode(call) || call.type !== "CallExpression") continue;
    const callee = call.callee;
    if (!isNode(callee) || callee.type !== "Identifier" || !locals.has(callee.name as string)) continue;
    const args = nodes(call.arguments);
    if (args.length !== 3 || args.some((a) => a.type === "SpreadElement")) continue;
    const name = stringLiteral(args[0]);
    if (!name || args[1].type !== "ObjectExpression") continue;
    const stated = nodes(args[1].properties).filter((p) => keyName(p) === "tests");
    if (!stated.length) continue;
    const where = `${file}:${at(call)}`;
    if (stated.length > 1) {
      errors.push(`${where}: tests is stated twice`);
      declared.push({ name, line: at(call) });
      continue;
    }
    const read = readTests(stated[0].value, where);
    errors.push(...read.errors);
    declared.push({ name, line: at(call), tests: read.errors.length ? undefined : read.tests });
  }
  // Two declarations of one name make its identity ambiguous, so it names no Test Case.
  const counts = new Map<string, number>();
  for (const { name } of declared) counts.set(name, (counts.get(name) ?? 0) + 1);
  for (const d of declared)
    if (counts.get(d.name)! > 1) errors.push(`${file}:${d.line}: Test Case "${d.name}" is traced more than once`);
  const cases = declared
    .filter((d) => d.tests && counts.get(d.name) === 1)
    .map((d) => ({ carrier: file, name: d.name, tests: d.tests! }));
  return { cases, errors };
}

/** The traceable Test Cases of the Carrier at `file`, or why it cannot be read. Errors and identities name it `name`, by default `file`. */
export function readTestCases(file: string, name = file): { cases: TestCase[]; errors: string[] } {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    return { cases: [], errors: [`${name}: unreadable carrier (${e instanceof Error ? e.message : String(e)})`] };
  }
  return parseTestCases(text, name, file);
}

/**
 * The identities of the Test Cases, among those given, that test `id` of
 * `kind`, in the order given, computed from what the Test Cases themselves
 * declare. There is no other record of it, so it is never stale, and a Test
 * Case tests only what it names: nothing is inferred from what the named
 * meaning is related to.
 */
export function testCasesTesting(cases: TestCase[], kind: string, id: string): string[] {
  return cases.filter((c) => c.tests.some((t) => t.kind === kind && t.id === id)).map(testCaseId);
}
