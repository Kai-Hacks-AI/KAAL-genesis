---
holds: "`scripts/brain-seals.ts`: KAAL's BRAIN is valid and its seals intact, as
  KAAL's cases show of KAAL's own BRAIN"
observed: the cases "the committed BRAIN is valid" and "the committed BRAIN's
  seals are intact" in scripts/brain-seals.test.ts, run from a directory holding
  no BRAIN, on Linux with Node 22
---

Run from a directory holding no BRAIN at all, both cases passed:

```
$ cd /tmp/elsewhere
$ tsx --test --test-name-pattern="^the committed BRAIN" /home/user/KAAL/scripts/brain-seals.test.ts
ok 1 - the committed BRAIN is valid
ok 2 - the committed BRAIN's seals are intact
```

The cases judge `brain/learning` relative to the directory the run starts in, not KAAL's own BRAIN, so where a case is run from chooses what it is about. Validating and checking seals report nothing for a BRAIN that is not there, so a run from anywhere else without a BRAIN proves nothing and passes, and a run from a directory holding another BRAIN judges that one instead.
