# Change

Use `requirements/change-occurrences/requirement.md` for what KAAL keeps here: each Change an immutable occurrence, `<lineage>/<occurrence>/`, beneath the lineage it contributes to, owning only what is placed beneath it.

Birth a Change with `npm run change:birth -- <lineage>`, which prints its identity and creates its empty directory; place what the Change produces beneath it. Check the tree with `npm run change:check`. An occurrence already born is never written again: a later change births a later one.
