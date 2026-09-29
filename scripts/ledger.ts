import fs from "node:fs";
import path from "node:path";
import { learningOf, nodeFiles, parseNode, relativeIdentity } from "../skills/using-brain/scripts/brain.js";
import { PLAN, planCommitments, planEntries, repoCases, section } from "./links.js";

/**
 * The account a Regression Plan once gave of what it replaced and withdrew,
 * checked against BRAIN's succession. No checker reads it any more: the next
 * regression is derived from the accepted one, what a candidate gives up and
 * what it newly promises (scripts/next-regression.ts). It stays only because
 * cases the regression still keeps read it, such as those of how a plan's
 * commitments are read, and goes once a candidate gives them up.
 */

const BRAIN = "brain/learning";

export type Ledger = { base?: string; replaces: [string, string][]; withdraws: [string, string][] };

/** The accepted regression a plan says it was derived from, by identity, and what it replaces and withdraws, each with what supersedes it. */
export function planLedger(plan: string): Ledger {
  const text = section(plan, "How this regression differs from the one it was derived from");
  const pairs = (label: string): [string, string][] => {
    const line = new RegExp(`^- ${label}: (.*)$`, "m").exec(text)?.[1] ?? "";
    return [...line.matchAll(/`([^`]+)` by `([^`]+)`/g)].map((m) => [m[1]!, m[2]!]);
  };
  return {
    base: /^Derived from: the accepted regression `([0-9a-f]{64})`/m.exec(text)?.[1],
    replaces: pairs("Replaces"),
    withdraws: pairs("Withdraws"),
  };
}

type Node = { place: string; name: string; lineage: string; key: string };

function brainNodes(repo: string): Node[] {
  const root = path.join(repo, BRAIN);
  return nodeFiles(root).map((file) => {
    const { lineage, key } = learningOf(root, file);
    return { place: `${BRAIN}/${relativeIdentity(root, file)}`, name: parseNode(file).name, lineage, key };
  });
}

/** What `plan` says shows the commitment stated at `place`. */
function shownBy(plan: string, place: string): string[] {
  return planEntries(plan).find((e) => e.place === place)?.shownBy ?? [];
}

export type Classification = {
  retained: string[];
  replaced: Map<string, string>;
  withdrawn: Map<string, string>;
  errors: string[];
};

/**
 * Classifies every commitment of the trusted regression against a candidate.
 * A commitment is retained while the candidate's plan still names its place.
 * Otherwise it must have been superseded in BRAIN: a later node with the same
 * name, in the same lineage, is what KAAL means now. If the candidate's plan
 * names that node, the commitment is replaced by it; if not, it is withdrawn
 * by it. A commitment stated outside BRAIN has no succession, so it can only
 * be retained, and a retained commitment keeps everything that showed it, such
 * as its cases. Anything else is a silent escape. Every place the candidate's
 * plan names, retained or added, must not be superseded already; whether it is
 * a place at all is a question of links (see links.ts). The plan's own account of
 * what it replaces and withdraws is only checked against this, never trusted.
 */
export function classify(trusted: string, candidate: string, base: string): Classification {
  const errors: string[] = [];
  const planOf = (repo: string) =>
    fs.existsSync(path.join(repo, PLAN)) ? fs.readFileSync(path.join(repo, PLAN), "utf8") : undefined;
  const trustedPlan = planOf(trusted);
  const candidatePlan = planOf(candidate) ?? "";
  const kept = new Set(planCommitments(candidatePlan));
  const nodes = brainNodes(candidate);
  const current = (node: Node) =>
    nodes
      .filter((n) => n.name === node.name && n.lineage === node.lineage && n.key > node.key)
      .sort((a, b) => a.key.localeCompare(b.key))
      .at(-1);
  const retained: string[] = [];
  const replaced = new Map<string, string>();
  const withdrawn = new Map<string, string>();
  const candidateCases = repoCases(candidate);
  for (const place of trustedPlan ? planCommitments(trustedPlan) : []) {
    const node = nodes.find((n) => n.place === place);
    const successor = node && current(node);
    if (kept.has(place)) {
      retained.push(place);
      // A retained commitment is shown at least as it was: dropping what showed it weakens it, which only
      // superseding it in BRAIN may do. Cases in particular are what protect it in the next generation.
      const was = shownBy(trustedPlan!, place);
      const is = shownBy(candidatePlan, place);
      for (const by of was.filter((by) => !is.includes(by)))
        errors.push(`${place}: the accepted regression shows it by ${by}, but the plan no longer does`);
    } else if (!successor) {
      errors.push(`${place}: silent escape: the plan no longer names it, and nothing in BRAIN supersedes it`);
    } else if (kept.has(successor.place)) {
      replaced.set(place, successor.place);
      if (!candidateCases.some((c) => c.places.includes(successor.place)))
        errors.push(`${place}: replaced by ${successor.place}, which no case of the candidate proves`);
    } else {
      withdrawn.set(place, successor.place);
    }
  }
  // Whatever the plan names, retained or new, must be what KAAL means now: the next accepted regression's
  // plan must not name a commitment BRAIN has already superseded.
  for (const place of kept) {
    const node = nodes.find((n) => n.place === place);
    const successor = node && current(node);
    if (successor) errors.push(`${place}: the plan names it, but ${successor.place} supersedes it`);
  }
  const ledger = planLedger(candidatePlan);
  if (ledger.base !== base)
    errors.push(`${PLAN}: derived from ${ledger.base ?? "nothing"}, not from the accepted regression ${base}`);
  const same = (said: [string, string][], found: Map<string, string>) =>
    JSON.stringify([...said].sort()) === JSON.stringify([...found].sort());
  if (!same(ledger.replaces, replaced))
    errors.push(
      `${PLAN}: says it replaces ${JSON.stringify(ledger.replaces)}, but BRAIN shows ${JSON.stringify([...replaced])}`,
    );
  if (!same(ledger.withdraws, withdrawn))
    errors.push(
      `${PLAN}: says it withdraws ${JSON.stringify(ledger.withdraws)}, but BRAIN shows ${JSON.stringify([...withdrawn])}`,
    );
  return { retained, replaced, withdrawn, errors };
}
