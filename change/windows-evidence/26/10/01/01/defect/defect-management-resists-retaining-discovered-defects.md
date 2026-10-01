---
id: defect-management-resists-retaining-discovered-defects
holds: A Change in flight can retain a Defect it discovers even when repairing
  that Defect is outside the Change's responsibility.
---

Observed on 2026-10-01 while #146 was in flight. The Windows probe (#148) found two Defects that were valid observations, and a Defect-only child pull request, #150, was created to retain them, targeting #146 branch. Its description said it was not for merge into #146. A review of #150 found both Defects valid pure observations and noted that merging them would put a Change into the Testing pull request, which is meant to stay minimal. The agents involved treated the discovered Defects as belonging outside #146, which was not responsible for repairing them, and did not take them into the Change in flight that found them. The managing-defects skill is meant to secure that a Defect found in a Change in flight is documented; here the retention was kept apart from the Change that found it.
