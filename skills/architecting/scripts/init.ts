import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = fileURLToPath(new URL("../SKILL.md", import.meta.url));

/** This skill's SKILL.md. The skill is born from init: SKILL.md is generated from here, never edited by hand. */
export const SKILL_MD = `---
name: architecting
description: Decide where a responsibility belongs and which side states each relation, and reconsider those boundaries when evidence shows them wrong. Use when something new needs a home, or when duplication, recurring findings or awkward exceptions suggest a responsibility lives in the wrong place.
---

# Architecting

Architecting assigns responsibilities to owners and relations. A responsibility is a meaning, decision or behavior the system must state or control. Its owner is what is responsible for stating or controlling it: a capability, a module, an artifact, a record. Ownership is not authorship, a code owner, a directory, an import, or wherever the implementation happens to sit; the question is always who is responsible for this meaning.

Architecting runs in two directions of one loop. Forward, from intent: given something the system needs to mean or do, where should that responsibility live, and how does it relate to the owners already there? Backward, from evidence: given what actually happened, does each responsibility still live in the right place? Forward finds the owner; backward tests and improves it, and what it changes is built, exercised and reviewed, which yields more evidence. Architecting is not planning work or its order, and not stating what must hold: it decides structure. Refactoring changes structure while preserving meaning; architecting decides whether structure should change, and how.

Name the responsibility before any owner. Say what must be meant, decided or done, in the domain's own words. A component's name is a candidate answer, not the question: "we need a Protection object" names a shape, while "a change must say which inherited checks it deliberately gives up" names a responsibility.

Find its current owner. Look for where that meaning is already stated, controlled or read, including under other names. Often something already owns it, and a new abstraction would only duplicate it. A new owner has to earn its place with a concrete case the existing owners cannot represent; if no such case can be found, there is no new owner.

Test the boundary. An owner is well placed when it can evolve without forcing its neighbors to change, and they without forcing it. A responsibility that must change on its own schedule, or be identified apart from statements that are edited in place, may need a place of its own; that is a reason for a new owner, not a rule that every concept needs one. An owner is defined by its purpose, not by what currently relates to it, so it can exist before anything does. Two owners stating one meaning, or two readers interpreting it, will drift. An owner that must know another's internals to do its job suggests a responsibility on the wrong side of their boundary.

Choose each relation's direction deliberately. A relation is stated by one side; put it on the side whose meaning includes it and whose lifecycle should carry it, so the other side can be split, replaced or shared without being edited. Do not infer direction from visual hierarchy: what sits conceptually above need not list what is below. Parts that each name the whole they serve can move, and serve several wholes, while the whole stays as it is; a whole that lists its parts must change whenever they do.

Separate the domain from its carrier. A mechanism such as a branch, a pull request, a CI job, a database row or a test runner may carry a domain concept without being it. Name the concept in its own terms, let the mechanism adapt it, and check that the concept would survive replacing the mechanism.

Work backward from concrete evidence: failures and defects, review findings that recur, tests that cluster around one concern, duplicated mechanisms, one concept represented in two places, exceptions that keep being special-cased, implementation that keeps resisting the model. Do not restructure from aesthetic preference alone. Tell pressure on a boundary from hardening within it: many findings that each make an owner handle its inputs more carefully leave the boundary as it was, and are not evidence against it. Similarity is evidence to investigate, never proof: a concern shared across owners justifies inspecting whether their implementations share one responsibility, and only if they do is consolidating them warranted. Independent owners may face the same concern and stay independent. Duplication shows that something is wrong, not where the fix belongs: before moving a responsibility to the owner the duplication suggests, ask again what the responsibility actually is.

Choose the smallest correction the evidence supports. By default prefer, in order, to clarify an existing owner's responsibility, move a relation to the side that should state it, strengthen an existing abstraction, split an overloaded one, and only then create a new owner. The order is a default, not a law: a new owner is right when a responsibility cannot be owned cleanly anywhere that exists. When an abstraction keeps needing patches, exceptions or extra cases to hold together, ask whether an existing owner already is what it is trying to be; removing an abstraction is a legitimate result. Decide, too, what should remain independent.

When the correction changes existing structure, propose it as a refactoring rather than performing it as part of the reasoning: say what meaning and commitments it must preserve, and what would show that they were.

Keep the conclusion where the system already keeps that kind of knowledge: with its current meaning if it learned what something means, with its possibilities if it is only a possibility, with its commitments if something must now hold, with its defects if something intended failed, and in its tests if it should be executable evidence. Do not create an architecture record merely to hold the answer. A conclusion with no such place is itself a finding to architect.

A result holds when each responsibility has one owner that states it, each relation is stated by one side chosen for a reason, every new owner names the case nothing else could represent, no mechanism stands in for the concept it carries, and every backward conclusion cites its evidence.
`;

/** Generates this skill's SKILL.md at `target` (by default, next to this skill's scripts). */
export function init(target = SKILL): string {
  fs.writeFileSync(target, SKILL_MD);
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) init();
