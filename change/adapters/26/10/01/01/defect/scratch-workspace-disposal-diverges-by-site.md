---
id: scratch-workspace-disposal-diverges-by-site
holds: Disposing a scratch workspace behaves the same wherever KAAL creates one,
  on every supported platform.
---

In the code at c119281, scratch directories made with fs.mkdtempSync are removed in three places with different mechanics: skills/testing/scripts/testing.ts (runCase) calls fs.rmSync with maxRetries: 10 and retryDelay: 100; skills/using-skills/scripts/skills.ts (birthErrors) and scripts/change-seals.ts (headsFromText) call fs.rmSync with recursive and force only, no retry. On Windows the first retries an EBUSY and the others do not; the Defect birth-errors-throws-ebusy-on-windows observes the consequence at birthErrors. Separately, skills/using-brain/scripts/create-brain.ts, skills/using-agents/scripts/create-agents.ts and scripts/genesis.ts remove what a failed birth created with bare fs.rmSync; those are cleanup of created material, not scratch workspaces, and were not observed to fail. Read from the code; the failure was not reproduced here, on Linux or otherwise.
