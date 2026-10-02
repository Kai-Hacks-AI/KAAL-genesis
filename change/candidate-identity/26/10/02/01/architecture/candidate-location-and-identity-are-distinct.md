---
id: candidate-location-and-identity-are-distinct
---

Where a Run executed a candidate and what the candidate was are two things, and only the second can be durable.

Testing's candidate is the working directory its Cases ran in: a location, observed by the Run and meaningful only on the host that made it. The same state executed on two hosts is two locations, and neither says what it was. What it was is an identity, which Testing cannot observe and so can only be told. A Run therefore keeps an optional candidate identity beside its location: stated by its caller, kept exactly as given, compared only by exact equality, and never interpreted, normalized or resolved, so Testing knows no kind of identity and no kind is special to it. A Run that states none is reported and read exactly as it always was, so what is already accepted, including the Runs FAR stores, which state only a placeholder for a location, is neither invalidated nor rewritten. Conditions are not the place for it: they say where a Run executed and are what instance parameters are matched against, while an identity says what was executed and matches nothing.
