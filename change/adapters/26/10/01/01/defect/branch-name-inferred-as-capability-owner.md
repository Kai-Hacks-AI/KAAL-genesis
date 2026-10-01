---
id: branch-name-inferred-as-capability-owner
holds: Which capability owns a meaning is stated meaning, never inferred from a
  branch name or from the branches earlier pull requests targeted.
---

Reported by the owner, not reproduced from a transcript here: agents working in KAAL repeatedly concluded that kaal/tracing owns Testing, because previous Testing pull requests targeted that branch, and likewise took kaal/far as the owner of FAR semantics. In the code at c119281 the branch names are themselves encoded as policy in the same scripts that hold core sealing logic: admission() in scripts/pull-request-sealing.ts reads the kaal/ prefix of a base, writebackRefusal reads claude/ and kaal/, and guard-branch.ts reads kaal/, so a branch name reads as part of KAAL's meaning to someone who reads the scripts.
