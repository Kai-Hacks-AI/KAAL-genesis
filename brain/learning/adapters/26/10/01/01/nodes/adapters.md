---
name: adapters
---

KAAL keeps knowledge that is specific to an external system on the adapter side of a boundary, so that KAAL core semantics stay meaningful without Git, GitHub, Windows or Linux. The invariant is that external-system-specific knowledge belongs to a KAAL adapter, not to KAAL core semantics. The placements are kept as Architecture records in the Change `adapters/26/10/01/01`; this node records what KAAL understands and why.

KAAL already held that knowledge without saying who owned it. It was in Git history and ref mechanics, in pull request admission, branch guards, checks, workflows and the sealing App, in scratch cleanup that retries on Windows in one place and not in another, in symlink, signal and named-pipe behaviour, and in portable-path rules copied into several skills. `pull-request-sealing.ts` and `seal.yml` had each already said, in a comment, that some part was "the carrier's". The evidence is that KAAL practised the boundary before it named it.

The smallest accurate model found is three kinds of external system, not one. Git is a carrier, GitHub is a host, and Windows and Linux are environments. Git and GitHub are kept apart, so a GitHub adapter is never a bucket for Git behaviour. An environment adapter is a different kind of boundary again: a generic operation stays generic. Core may state meaning that involves an environment, as linux-support and windows-support do, while the mechanics that realize it, such as mkfifo, signals and handle release, stay adapter-side and do not become KAAL meaning merely because they are platform-specific. Capability, flight and branch are three things: a branch is a carrier and host realization of concurrent work, and its name does not say which capability owns a meaning.

Core owns the need, as a port. The adapter owns the external-system knowledge. Composition supplies the adapter inward, and skills stay independent, receiving what they need from their caller and never importing each other's machinery. The same discipline covers an agent provider's quirks, which live at the boundary while canonical guidance stays provider-independent. Testing may require evidence under an opaque parameter such as environment = X and knows nothing of how X is provided.

KAAL births no adapter implementation with this learning. Scratch disposal exposed the pressure but is not therefore the first adapter, and no operation has yet earned an interface. The Defects this Change discovered are kept in it, and not repaired by it.

This node does not replace the earlier nodes on Git and GitHub independence or on the execution environments, which remain as they were learned.
