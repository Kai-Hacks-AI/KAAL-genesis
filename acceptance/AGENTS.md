# Acceptance

Use BRAIN for why KAAL keeps acceptance records here and what each means: `brain/learning/genesis/26/09/28/03/nodes/acceptance.md`.

A candidate gives up something of the accepted regression only by excluding it, in a record it adds here: `<name>.md`, whose frontmatter holds only `excludes:`, a list of entries, each naming an inherited case, by its file and title in the accepted regression (`case: <file>` with `title: <title>`), or a suite that serves the accepted Regression Plan (`suite: <place>`), and `because: <why>`. `npm run acceptance -- <accepted> [candidate]` replays the accepted regression's cases against the candidate and refuses any that does not hold unless it is excluded, and any exclusion of what the accepted regression does not have. A candidate that gives up nothing adds no record. A record the accepted state holds is history: it excludes nothing more, and is never rewritten or removed.
