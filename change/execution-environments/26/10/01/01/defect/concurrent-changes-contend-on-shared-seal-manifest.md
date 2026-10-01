---
id: concurrent-changes-contend-on-shared-seal-manifest
holds: Independent Changes can be integrated in either order without one having
  to rewrite shared seal state produced by another independent Change.
---

Observed in the sibling pull requests #154, #156 and #157, each a Change born independently against the same kaal/adapters flight. Each Change, once sealed, added its own sealed occurrence and so edited the same root seals.json. After #156 merged, the sibling pull requests still open had to reconcile their copies of seals.json before they could integrate, and so did #157 again after #154 merged: a content conflict in seals.json, resolved by keeping both lineages' entries. Their semantic Change material was independent; the contention came from the centralized shared seal manifest. Recorded as observation only: no cause is asserted beyond that shared file, and no repair.
