import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = fileURLToPath(new URL("../SKILL.md", import.meta.url));

/** This skill's SKILL.md. The skill is born from init: SKILL.md is generated from here, never edited by hand. */
export const SKILL_MD = `---
name: reviewing
description: Judge each review finding against the responsibility under review and decide, from the findings and what earlier rounds established, whether another bounded repair and review round is justified or why the review loop stops. Use when a review of candidate work has produced findings or come back clean, and whether the loop continues is not yet decided.
---

# Reviewing

Reviewing decides whether a repair and review loop continues. A reviewer, whoever or whatever it is, produces findings against candidate work, and repairing them is someone else's work. Reviewing judges each finding against the responsibility under review and against what earlier rounds established, and says whether another round is justified or why the loop stops. It runs no reviewer, makes no repair, approves nothing and keeps no record of its own.

The responsibility is what the work under review claims to hold, as the work states it, with the boundary it states, and, whatever it states, that everything which held before the work still holds. Judge against that. Never enlarge it: that a property would be desirable does not make the work owe it. Never shrink it either: a claim is withdrawn only by whatever decides the responsibility, never on the way to a stop.

One rule governs the loop: another round is justified only while it can materially increase confidence that the work holds its responsibility, without changing that responsibility. The questions below make that rule answerable.

First ask what each finding does to the responsibility. It falsifies it when it shows something the work claims not holding, including a failure the work introduced in anything that held before it, its own evidence among them. It blocks it when it shows a failure the work did not introduce and does not own that makes the evidence for the work's claim impossible to obtain while it stands: the claim is not shown false, but it cannot be shown true. Otherwise it is outside: it may be real and severe, but either holding it is not what the work claims, or the failure was already there, belongs to another owner, and the work's evidence can still be obtained despite it. A finding that asks for a property beyond the work's stated boundary is outside, even where the work could be extended to hold it. Whether a finding is valid, whose it is and what it does to the responsibility are separate questions. Severity, a reviewer's confidence and who found it are not evidence of effect: a severe failure may be outside, and a minor-looking one may falsify the central claim.

A finding counts once it is shown: reproduced, or demonstrated by evidence that makes it checkable, such as forcing the interleaving a race needs or following the code path that lets it happen. Showing it belongs to whoever keeps the evidence; Reviewing asks for it. A finding nothing can show falsifies and blocks nothing, but one not yet shown is not dismissed: it is shown first. When the doubt is about what the responsibility says rather than about what happens, because its statement neither claims nor excludes what the finding shows, that ambiguity cannot be settled by evidence and is a reason to reconsider.

An outside finding does not justify another round and is not repaired as part of this work. Say where it belongs, naming what already records it where something does; keeping it there is the using system's.

Then ask of each falsifying finding whether a bounded repair exists. A repair is bounded when it lies inside the responsibility, changing what the work does and not what it claims, and when it closes the whole class the finding is an instance of by whatever decides membership of that class, consulted rather than imitated, so that the next review can test it: any further member is either covered or directly falsifies the repair. A repair that lists the members seen so far is not bounded when the class is open, since review can only ever find one more.

A bounded repair may state a limit, but only one that what the work relies on imposes, shown by that thing offering no means by which any implementation could hold the property, and only where the work's claim still says what it said without it. A limit is itself a disposition a later finding can falsify, by showing a means that was there. A limit on what the claim is about is not a limit but a withdrawn claim.

What earlier rounds established is evidence. Every disposition, whether a class repaired, a finding outside and why, a failure blocking and whose, or a limit stated, is a claim, stated so a later finding could falsify it and kept with the work, where the using system keeps the reasoning behind it. The words of a disposition decide which class it claimed: a later finding belongs to that class when those words cover it, and is new otherwise. A finding in a class a disposition claimed closed falsifies that disposition as well as the work: whatever repaired it did not decide the class. The repair it now needs must close the class the disposition claimed, not only the member just found, by consulting what decides that class; when that is not available within the responsibility, because the class is decided by another owner, a tool, a platform or an environment the work cannot consult as one authority, no bounded repair exists.

Neither the number of rounds nor that a finding was introduced by an earlier repair is evidence by itself. A repair can introduce a new defect that has a bounded repair of its own, and a new falsifying finding with a bounded repair justifies another round after many rounds as it did after the first. What stops the loop is the absence of a bounded repair, not the length of the loop.

Then decide the loop from all the findings of the round, in this order:

- Reconsider, when some finding falsifies the responsibility and has no bounded repair, or shows its statement ambiguous. Another round against this responsibility cannot converge; the responsibility, its claim, its boundary or the approach that carries it, must change first, and repairing other findings against it gains nothing meanwhile. How it changes is for whatever decides the responsibility. Once it has changed, review begins again against the new statement.
- Continue, when some falsifying finding has a bounded repair. Hand every such finding back for repair with its disposition, and review the repaired work again: a repair is never its own confirmation.
- Blocked, when no bounded repair remains and some finding blocks. Nothing inside the responsibility can establish its claim until the blocking failure is repaired by its owner, so the loop stops without absorbing that repair, and resumes when it is made.
- Ready, when no finding falsifies or blocks. The work holds its responsibility as bounded, as far as review has tested it. Outside findings, placed where they belong, may remain. A clean review is one way to be ready, a review whose every finding is outside another; either way the review must have seen the work as it stands after its last repair.

Every loop ends in one of these; there is no undecided. Whoever decides the work may always overrule a verdict, but that is a decision made from outside Reviewing, not its way of resolving doubt.
`;

/** Generates this skill's SKILL.md at \`target\` (by default, next to this skill's scripts). */
export function init(target = SKILL): string {
  fs.writeFileSync(target, SKILL_MD);
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) init();
