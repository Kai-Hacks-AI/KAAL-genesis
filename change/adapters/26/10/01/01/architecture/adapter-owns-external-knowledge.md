---
id: adapter-owns-external-knowledge
---

Knowledge specific to an external system, whether a carrier, a host or an environment, belongs to a KAAL adapter and never to KAAL core semantics.

KAAL core states what it needs as a port, in terms that name no external system. An adapter owns how that need is realized against one particular external system, and owns every fact that is true only of that system. An adapter never defines what a core concept means: a mapping from a KAAL concept to something external is the adapter's, and the external thing is not the definition of the concept. KAAL's composition supplies an adapter inward to the core that needs it, so the dependency runs from adapter to core and core never reaches out to an adapter. Adapters are not assumed to share an interface: each boundary is found from the operation that needs it.
