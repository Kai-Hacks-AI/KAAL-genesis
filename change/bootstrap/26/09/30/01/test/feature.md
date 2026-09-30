# Feature

This Change births Change Sealing: a Change occurrence can be sealed before the evolution that carries it reaches main, with `npm run seal:change -- <lineage>/YY/MM/DD/CC...`.

It is the existing Change sealing, run over named occurrences: the same chains, units, seal format, hashing and verification. The command seals only the Changes it is named, and refuses to seal an earlier Change in the lineage that it was not also named for.

The guard accepts seal state of Changes when the resulting state is exactly valid state that Sealing could have produced: only seals added and chain heads added or extended, every existing chain kept and only extended, and every Change verifying. `seal:change` is the supported producer, not proof of provenance. Seal state of BRAIN, the lock, rewritten or deleted seals and stray seals stay refused, and no branch pattern is exempt.
