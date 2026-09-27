---
holds: "`scripts/seal-guard.ts`: a candidate that rewrites a seal is refused, as
  KAAL's case shows by rewriting one"
observed: the case "copied out of Git, KAAL seals an accepted state, checks what
  sealing wrote, and guards seal state against a candidate" in
  scripts/without-git.test.ts, run on a state whose newest seal begins with 0,
  on Linux with Node 22
---

Replayed against a state whose newest seal began with `0` (`"seal": "0ba4ca…"`), the case failed:

```
not ok - copied out of Git, KAAL seals an accepted state, checks what sealing wrote, and guards seal state against a candidate
  expected: 1
  actual: 0
```

The case rewrites a seal in the chain heads by replacing its first hex digit with `0`. When that digit already is `0`, nothing changes, so the guard rightly lets the candidate through, and the case reports the guard as failing. Whether the case can show its claim depends on the bytes of the state it seals: any change to BRAIN has a one in sixteen chance of making it fail.
