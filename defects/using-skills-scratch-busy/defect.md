---
holds: "`skills/using-skills/SKILL.md`: checking bounds a stuck init and reports
  it as an error of that skill"
observed: the case "an init that does not finish in time is stopped and
  reported, even if it ignores SIGTERM" in
  skills/using-skills/scripts/skills.test.ts, run on Windows with Node 22
  (test-windows, commit f6599f2)
tested-by:
  - "`skills/using-skills/scripts/skills.test.ts`: an init that does not finish
    in time is stopped and reported, even if it ignores SIGTERM"
  - "`skills/using-skills/scripts/skills.test.ts`: a stopped init that still
    holds its scratch copy for a moment is reported, not an error of the check"
---

Checking a skill whose init ignores SIGTERM and does not finish in time failed instead of reporting it:

```
EBUSY: resource busy or locked, rmdir '…\Temp\skill-GGBW57\ignores-sigterm'
  at birthErrors (skills/using-skills/scripts/skills.ts:167)
```

Checking stops the init with SIGKILL when it runs out of time, then removes the init's scratch directory at once. On Windows the killed process can still hold that directory as its working directory for a moment after it is stopped, so the removal fails and the error escapes the check. The same case passed in another run of the same commit under the same conditions: the removal races the release of the directory.
