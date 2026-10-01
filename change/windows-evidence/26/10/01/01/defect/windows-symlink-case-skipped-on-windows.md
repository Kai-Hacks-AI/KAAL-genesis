---
id: windows-symlink-case-skipped-on-windows
holds: The claim that a skill's scratch copy keeps symlinks as they are, never
  pointing back into the skill, is demonstrated on Windows as well as on Linux
  by its Test Case.
---

In the code at a00daa9 (the parent of 35aac9a), the Test Case "the scratch copy keeps symlinks as they are, never pointing back into the skill" in the Carrier skills/using-skills/scripts/skills.test.ts carried { skip: process.platform === "win32" }, and its fixture, skills/using-skills/test-data/skills/linked/scripts/template, was a symlink committed to Git (mode 120000). Observed on a real Windows runner (windows-latest, node v22.23.2 win32 x64) at efb4c20 (which holds the same skills.test.ts), in run 36702604614, job 109845299309, the Carrier ran 17 tests: 15 passed and 2 were skipped (this Test Case and the named-pipe one, both skip: win32 in the code). Testing printed "fail skills/using-skills/scripts/skills.test.ts" and "does not hold" for Plan change/regression-testing/26/09/30/02/test/regression.md. The same commit was green under npm test on Windows, which accepts a skip. The Test Case did not run on Windows, so it was not observed whether the property holds there. It was observed that the Windows evidence for it did not exist. Linux ran it, with no skip.
