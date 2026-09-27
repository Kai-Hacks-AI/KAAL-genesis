---
by: "`skills/using-skills/scripts/skills.ts`: checking removes the scratch copy
  with retries while it is busy"
---

Checking removes the init's scratch copy with Node's own retries (`maxRetries: 10`, `retryDelay: 100`), which retry exactly while the directory is busy, so a stopped init that still holds it for a moment delays the removal instead of failing the check.

The case "a stopped init that still holds its scratch copy for a moment is reported, not an error of the check" in `skills/using-skills/scripts/skills.test.ts` makes the removal busy unless it retries, on every platform, and fails with the same EBUSY before the repair.
