import fs from "node:fs";
import path from "node:path";
import { CASE, placeError, readPlan, readSuiteFile, SUITE_FILE } from "./testing.js";

/** What a Case may test: a Suite by its place, a Requirement or a Defect by its id. */
export type Kind = "suite" | "requirement" | "defect";

/** A Suite as the graph sees it: its place, and the Plans its own file says it tests. */
export type SuiteNode = { place: string; tests: string[] };

/** A Case as the graph sees it: its place, and what its own header says it tests. */
export type CaseNode = { place: string; suites: string[]; requirements: string[]; defects: string[] };

/** The edges found in the scopes read. Every edge is stated by the child and points at an earlier parent. */
export type Graph = { suites: SuiteNode[]; cases: CaseNode[] };

/** The identities that exist, which only the using system knows. A Case's reference to any other is refused. */
export type Known = { requirements: Iterable<string>; defects: Iterable<string> };

const KINDS: Kind[] = ["suite", "requirement", "defect"];

const byteOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The edges a Case states about itself: the leading `//` lines of the file,
 * up to the first line that is not one, are its header, and each header line
 * `// @tests <suite|requirement|defect> <identity>` is one edge. Every other
 * line, inside the header or beyond it, is the Case's own and is never read.
 * A Suite is named by its place beneath the testing root; a Requirement or a
 * Defect by its id. Stating one edge twice is an error.
 */
export function readCaseEdges(text: string, place: string): { edges: Record<Kind, string[]>; errors: string[] } {
  const edges: Record<Kind, string[]> = { suite: [], requirement: [], defect: [] };
  const errors: string[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  for (const line of lines.slice(lines[0]?.startsWith("#!") ? 1 : 0)) {
    const header = /^\s*\/\/(.*)$/.exec(line);
    if (!header) break;
    const tag = /^\s*@tests(?:\s+(.*))?$/.exec(header[1]);
    if (!tag) continue;
    const [kind, id, ...rest] = (tag[1] ?? "").trim().split(/\s+/);
    if (!KINDS.includes(kind as Kind) || !id || rest.length) {
      errors.push(`${place}: "${line.trim()}" must be "// @tests <suite|requirement|defect> <identity>"`);
      continue;
    }
    const invalid = kind === "suite" ? placeError(id) : undefined;
    if (invalid) errors.push(`${place}: ${invalid}`);
    else if (edges[kind as Kind].includes(id)) errors.push(`${place}: ${kind} "${id}" is tested twice`);
    else edges[kind as Kind].push(id);
  }
  return { edges, errors };
}

/** Every directory beneath `dir`, `dir` first, and every file, as places relative to `base`, in sorted order. */
function walk(base: string, dir: string): { dirs: string[]; files: string[] } {
  const dirs: string[] = [];
  const files: string[] = [];
  const visit = (place: string) => {
    dirs.push(place);
    for (const entry of fs.readdirSync(path.join(base, ...place.split("/")), { withFileTypes: true })) {
      const at = `${place}/${entry.name}`;
      if (entry.isDirectory()) visit(at);
      else if (entry.isFile()) files.push(at);
    }
  };
  visit(dir);
  return { dirs: dirs.sort(byteOrder), files: files.sort(byteOrder) };
}

/**
 * The graph of what is born later, read from the `scopes` (places beneath
 * `root`) it is looked for in: every directory holding `suite.json` is a
 * Suite, every Case file a Case, each with the edges it states itself. A
 * scope that does not exist holds nothing, and a place in two scopes is one.
 *
 * Nothing in a scope states its children, and no list of them is kept: the
 * graph is found by reading. Every parent a child names must already exist,
 * or the edge is refused: a Plan that reads as a Plan, a Suite whose
 * `suite.json` reads, a Requirement or a Defect whose id is in `known`.
 * Parents are resolved wherever they are beneath `root`, not only in the
 * scopes, since a child may be born long after its parent.
 */
export function readGraph(root: string, scopes: string[], known: Known): { graph: Graph; errors: string[] } {
  const requirements = new Set(known.requirements);
  const defects = new Set(known.defects);
  const errors: string[] = [];
  const suites: SuiteNode[] = [];
  const cases: CaseNode[] = [];
  const places = new Set<string>();
  const plans = new Map<string, boolean>();
  const parents = new Map<string, boolean>();
  const planExists = (place: string) => {
    if (!plans.has(place)) plans.set(place, readPlan(path.join(root, ...place.split("/"))).plan !== undefined);
    return plans.get(place)!;
  };
  const suiteExists = (place: string) => {
    if (!parents.has(place)) parents.set(place, readSuiteFile(root, place).concern !== undefined);
    return parents.get(place)!;
  };
  for (const scope of scopes) {
    const invalid = placeError(scope, "scope");
    if (invalid) {
      errors.push(invalid);
      continue;
    }
    const stat = fs.lstatSync(path.join(root, ...scope.split("/")), { throwIfNoEntry: false });
    if (!stat) continue;
    if (!stat.isDirectory()) {
      errors.push(`${scope}: not a directory`);
      continue;
    }
    const { dirs, files } = walk(root, scope);
    for (const place of dirs) {
      if (places.has(place) || !fs.existsSync(path.join(root, ...place.split("/"), SUITE_FILE))) continue;
      places.add(place);
      const { tests, errors: invalid } = readSuiteFile(root, place);
      errors.push(...invalid);
      for (const plan of tests) if (!planExists(plan)) errors.push(`${place}: tests plan "${plan}", which is no Plan`);
      suites.push({ place, tests });
    }
    for (const place of files) {
      if (places.has(place) || !CASE.test(place)) continue;
      places.add(place);
      const { edges, errors: invalid } = readCaseEdges(
        fs.readFileSync(path.join(root, ...place.split("/")), "utf8"),
        place,
      );
      errors.push(...invalid);
      for (const suite of edges.suite)
        if (!suiteExists(suite)) errors.push(`${place}: tests suite "${suite}", which is no Suite`);
      for (const id of edges.requirement)
        if (!requirements.has(id)) errors.push(`${place}: tests requirement "${id}", which is no Requirement`);
      for (const id of edges.defect)
        if (!defects.has(id)) errors.push(`${place}: tests defect "${id}", which is no Defect`);
      cases.push({ place, suites: edges.suite, requirements: edges.requirement, defects: edges.defect });
    }
  }
  return { graph: { suites, cases }, errors };
}

/** The Suites that test the Plan at `plan`: every Suite whose own file names it. */
export function suitesTesting(graph: Graph, plan: string): string[] {
  return graph.suites
    .filter((suite) => suite.tests.includes(plan))
    .map((suite) => suite.place)
    .sort(byteOrder);
}

/**
 * The Cases of the Suite at `suite`: those beneath its directory, and those
 * that name it, each once. A Case that is both is one Case, not two.
 */
export function casesOf(graph: Graph, suite: string): string[] {
  return graph.cases
    .filter((c) => c.place.startsWith(`${suite}/`) || c.suites.includes(suite))
    .map((c) => c.place)
    .sort(byteOrder);
}

/** The Cases that test the Requirement or Defect with `id`: every Case whose own header names it. */
export function casesTesting(graph: Graph, kind: "requirement" | "defect", id: string): string[] {
  return graph.cases
    .filter((c) => (kind === "requirement" ? c.requirements : c.defects).includes(id))
    .map((c) => c.place)
    .sort(byteOrder);
}
