---
name: testing
---

# Testing

KAAL understands that a Requirement is tested by evidence that is sufficient for it, and that a `tests` relation is that claim: the Test Case or Test Suite that declares it asserts it is sufficient evidence for what it names. One Case can be sufficient. When what is claimed is sufficient only through several Cases together, the Suite carries the claim, for the Requirement or Requirements it names, and its Cases are the evidence that realizes it collectively; they do not each claim the whole of it. The rule is about what each claim asserts, not about how many claims there are, so independent Cases or Suites may each be sufficient for the same Requirement. Like any durable relation, it is declared by the later node toward what already exists.

So a Suite has two things: what it claims to test, its `tests`, and how that is evidenced, its Cases. An earlier understanding gave a Suite a third thing, a `concern`, defined only as a coherent testing concern. That was never a defined concept: no learning says what a concern means, and the tools merely required the field. It is not carried forward. The Suites already written keep the field as they were written, and Testing still accepts it and gives it no meaning.

Testing now reads a Suite's `tests` and no longer requires a `concern`. FAR-15's first composite Suite showed that a Plan derived from Test Cases alone never holds the Cases of a Suite that claims a Requirement, so the Plan demonstrates nothing of it. Testing now computes, from the Suites given, the Cases of those whose `tests` names a target (`suiteCasesTesting`), and KAAL's composition finds the Suites beneath each Change's `test/`, holds their `tests` to the kinds and ids a Test Case's are held to, and adds those Cases to the Plans it derives.
