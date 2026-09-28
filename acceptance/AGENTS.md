# Acceptance

Use BRAIN for why KAAL keeps acceptance records here and what each means: `brain/learning/genesis/26/09/28/03/nodes/acceptance.md`.

A candidate may reduce what the accepted regression protects only where it explicitly accepts that reduction, in a record it adds here: `<name>.md`, whose frontmatter holds only `accepts:`, a list of entries, each naming one piece of protection (`commitment: <place>`, `proof: <check>` with `of: <place>`, `conditions: {…}` or `suite: <place>`) and `because: <why>`. `npm run acceptance -- <accepted> [candidate]` names what the candidate reduces and refuses any reduction no entry accepts, and any entry that accepts no reduction. A candidate that reduces nothing adds no record. A record the accepted state holds is history: it accepts nothing more, and is never rewritten.
