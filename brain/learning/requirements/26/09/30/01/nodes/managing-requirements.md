---
name: managing-requirements
---

# Managing Requirements

KAAL uses the **managing-requirements** skill so that what KAAL is required to satisfy is durable, readable meaning that Humans and agents can understand, and so other material can trace to it by a stable id. Until now a requirement lived only in a test's name, in code, in PR prose or in Git and GitHub metadata. #86 showed the gap: a Test Suite meant to demonstrate that KAAL works without Git had no Requirement to say what it demonstrates.

A Requirement says what KAAL must satisfy. BRAIN says what KAAL understands about itself, so BRAIN is not where Requirements are kept, and the skill works without BRAIN.

KAAL composes the skill with Change; neither skill knows the other. A Change that introduces Requirements keeps them in its one occurrence, `change/<lineage>/YY/MM/DD/CC/requirement/`, beside whatever else that Change holds, and adds no occurrence identity of its own. `managing-change` does not interpret them and `managing-requirements` does not know where they sit. `npm run requirements:check` is that composition.

Evidence refers to a Requirement by its id, and the reference belongs to the evidence, never the Requirement. Testing stays independent of Requirements and Requirements of Testing. A Suite that demonstrates Git independence names `git-independence`, and names `github-independence` only if its Cases genuinely demonstrate that too.

KAAL accepts two Requirements, both introduced by the Change `requirements/26/09/30/01`. **git-independence**: KAAL semantics are independent of Git. **github-independence**: KAAL semantics are independent of GitHub. Git and GitHub may carry, host, review and ship KAAL, but no fact of theirs, such as a SHA, a branch, a PR number or a merge state, defines what KAAL means. Neither supersedes anything.

KAAL keeps no Requirements instance or Strategy, as it has no repository-specific convention for Requirements yet, and keeps no lifecycle, priority, status or traceability machinery, since nothing it has needed so far requires it.

The skill explains how to manage Requirements. This node records why KAAL uses it.
