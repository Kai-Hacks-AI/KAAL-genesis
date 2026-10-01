---
id: birth-errors-throws-ebusy-on-windows
holds: An init that does not finish in time is stopped and reported by
  birthErrors, on every supported platform, without birthErrors itself failing.
---

Observed at 94c7fca, in run 36709180187, attempt 1, job 109866590723 (windows-latest, win32 x64). npm test failed: 196 tests, 194 passed, 1 failed, 1 skipped. The failing test was reached at skills/using-skills/scripts/skills.test.ts:120, the Test Case "an init that does not finish in time is stopped and reported, even if it ignores SIGTERM", in its call birthErrors(stuckSkill("ignores-sigterm"), 1000). birthErrors threw instead of returning the expected error: EBUSY: resource busy or locked, rmdir C:\Users\RUNNER~1\AppData\Local\Temp\skill-243CKC\ignores-sigterm, from fs.rmSync(scratch, { recursive: true, force: true }) at skills/using-skills/scripts/skills.ts:167 (the finally of birthErrors), through node:internal/fs/rimraf. Attempt 2 of the same run on the same commit passed on Windows, and Linux passed in both attempts. The failure was not reproduced on Linux and the log does not show why the directory was busy.
