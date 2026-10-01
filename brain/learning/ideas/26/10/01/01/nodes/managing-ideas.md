---
name: managing-ideas
---

# Managing Ideas

KAAL uses the **managing-ideas** skill so that a possibility worth remembering can survive without being mistaken for something KAAL currently believes or has committed to, rather than being lost with the conversation that raised it or quietly promoted into a plan.

An Idea is a possibility retained without commitment. It is not meaning: BRAIN holds what KAAL has learned and currently understands. It is not an observation: a Defect records that something intended to hold was seen not to. It is not a promise: a Requirement states what KAAL commits to. These records do not collapse into one another. An Idea is immutable and has a portable id. It records no state, priority, assignment, schedule or lifecycle, and later acceptance, rejection or action never rewrites it.

KAAL composes the skill with Change; neither skill knows the other. A Change that retains a possibility keeps it in its one occurrence, `change/<lineage>/YY/MM/DD/CC/idea/<id>.md`, beside whatever else that Change holds, and adds no occurrence identity of its own. `npm run ideas:check` is that composition, and finds Ideas by looking in every Change, not by a list: there is no registry of Ideas, and no `ideas/` directory.

Whatever later acts on an Idea owns that relationship and refers to the Idea by its id. KAAL has not decided how, and builds nothing for it until it needs to.

This is a harvest, not a restoration. The earlier managing-ideas of #47 and #50, carried in #62, kept each Idea as a directory holding `idea.md`, with a separate `idea` field beside its context, in a top-level `ideas/` directory, written through a staging directory so a crash left no partial record. This keeps what those established: an Idea is a possibility without commitment, immutable, stateless, and checked. It drops the rest. The id and file now follow Defects and Architecture, so one possibility is one Markdown file whose body is the possibility and its context. Creating an Idea refuses an existing file as the other skills do. The Ideas those branches recorded, and the Regression Projection work that #62 carried, are not brought along; KAAL accepts no Idea with this birth and retrofits none from history.

The skill explains how to manage Ideas. This node records why KAAL uses it.
