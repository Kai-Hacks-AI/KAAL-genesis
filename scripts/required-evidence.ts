import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { readChanges, ROOT as CHANGE_ROOT } from "../skills/managing-change/scripts/changes.js";
import type { PlanEntry } from "../skills/testing/scripts/supersession.js";
import { instanceId, PARAMETER, type Instance, type Parameters } from "../skills/testing/scripts/testing.js";
import { kaalRequirements } from "./requirements.js";

/**
 * KAAL's composition of Requirements with the parameters their HOW must be
 * evidenced under. A Test Case is generic HOW and carries no environment;
 * Testing compares a parameter only by equality with what a Run observed and
 * knows no name and no value; a Requirement states what must hold and never
 * what shows it. What relates them is KAAL's: a Change that decides a
 * Requirement must be evidenced under parameters keeps that decision in its
 * occurrence's `evidence/` directory, one Markdown file per decision:
 *
 *     ---
 *     requirement: linux-support
 *     parameters:
 *       platform: linux
 *     ---
 *
 *     Why this Requirement is shown under these parameters.
 *
 * It belongs to the Change, never to the Requirement, which stays as sealed,
 * and never to a Test Case, which stays generic. A Requirement may be named by
 * any number of decisions, each a parameter set, and each, with every Test
 * Case that tests the Requirement, is one required instance. A Requirement no
 * decision names is evidenced as it always was: by its Test Cases, under none.
 */

/** Where a Change occurrence keeps its decisions about the parameters a Requirement is evidenced under. */
export const EVIDENCE_DIR = "evidence";

/** One decision: `requirement` is to be evidenced under `parameters`, in `file`. */
export type RequiredEvidence = { requirement: string; parameters: Parameters; file: string };

/** Every Change's `evidence/` directory beneath the repository, in traversal order; a Change with none holds none. */
export function evidenceRoots(repo = "."): string[] {
  return readChanges(path.join(repo, CHANGE_ROOT)).changes.map((change) =>
    path.join(repo, CHANGE_ROOT, change.lineage, ...change.occurrence.split("/"), EVIDENCE_DIR),
  );
}

const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;

/** Parses one decision, or says why it is not one. `file` only names errors; `known` are the ids of the Requirements that exist. */
export function parseEvidence(text: string, file: string, known: ReadonlySet<string>): RequiredEvidence | string {
  const match = FRONTMATTER.exec(text);
  if (!match) return `${file}: missing YAML frontmatter`;
  let data: unknown;
  try {
    data = YAML.parse(match[1]);
  } catch {
    return `${file}: frontmatter is not valid YAML`;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return `${file}: frontmatter must be a mapping`;
  const { requirement, parameters } = data as { requirement?: unknown; parameters?: unknown };
  if (typeof requirement !== "string") return `${file}: requirement is required`;
  if (!known.has(requirement)) return `${file}: requirement "${requirement}" names no requirement`;
  if (
    typeof parameters !== "object" ||
    parameters === null ||
    Array.isArray(parameters) ||
    !Object.keys(parameters).length
  )
    return `${file}: parameters must be a non-empty mapping of names to values`;
  for (const [name, value] of Object.entries(parameters))
    if (!PARAMETER.test(name) || typeof value !== "string" || !PARAMETER.test(value))
      return `${file}: parameter "${name}" must be a plain name with a plain string value`;
  if (!match[2].trim()) return `${file}: a decision must state why`;
  return { requirement, parameters: parameters as Parameters, file };
}

/**
 * The decisions across all Changes, with everything that stops them being
 * decisions. The `*.md` entries directly in an `evidence/` directory are the
 * candidates, each a regular file; anything else there is not this
 * composition's. Two decisions of one Requirement under the same parameters
 * are one: an instance is never required twice.
 */
export function kaalRequiredEvidence(repo = "."): { evidence: RequiredEvidence[]; errors: string[] } {
  const { requirements, errors } = kaalRequirements(repo);
  const known = new Set(requirements.map((r) => r.id));
  const evidence = new Map<string, RequiredEvidence>();
  for (const root of evidenceRoots(repo)) {
    const stat = fs.lstatSync(root, { throwIfNoEntry: false });
    if (!stat) continue;
    if (!stat.isDirectory()) {
      errors.push(`${root}: not a directory`);
      continue;
    }
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!entry.name.endsWith(".md")) continue;
      const file = path.relative(repo, path.join(root, entry.name)).split(path.sep).join("/");
      if (!entry.isFile()) {
        errors.push(`${file}: not a regular file`);
        continue;
      }
      const read = parseEvidence(fs.readFileSync(path.join(root, entry.name), "utf8"), file, known);
      if (typeof read === "string") errors.push(read);
      else {
        const key = instanceId({ carrier: read.requirement, parameters: read.parameters });
        if (!evidence.has(key)) evidence.set(key, read);
      }
    }
  }
  return { evidence: [...evidence.values()], errors };
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The instances the Test Cases of `entries` are required under: each Test
 * Case, once per set of parameters any Requirement it is selected for is
 * evidenced under, and under none when it is selected for a Defect or for a
 * Requirement no decision names. A Test Case is a Carrier here, as Testing can
 * name only the file that executes it. Each instance once, sorted by identity.
 */
export function requiredInstances(entries: readonly PlanEntry[], evidence: readonly RequiredEvidence[]): Instance[] {
  const instances = new Map<string, Instance>();
  for (const { carrier, targets } of entries)
    for (const { kind, id } of targets) {
      const sets = kind === "requirement" ? evidence.filter((e) => e.requirement === id) : [];
      for (const parameters of sets.length ? sets.map((e) => e.parameters) : [{}]) {
        const instance = { carrier, parameters };
        instances.set(instanceId(instance), instance);
      }
    }
  return [...instances.entries()].sort(([a], [b]) => compare(a, b)).map(([, instance]) => instance);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors } = kaalRequiredEvidence();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
}
