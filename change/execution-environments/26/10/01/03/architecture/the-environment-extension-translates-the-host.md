---
id: the-environment-extension-translates-the-host
---

The Environment Extension is the boundary that translates a host's runtime observation into KAAL's provider-neutral environment, and Testing receives the result as a condition.

It lives in extensions/environment, outside Testing and outside scripts/, and imports only the Skill it composes. In its boundary role it owns the provider's spelling: Node's process.platform, linux and win32, is read there and becomes the environment linux or windows, and a platform KAAL names no environment for provides none, so no required instance is ever evidenced by a guess. In its composing role, one function beside the translation hands Testing the observed conditions together with the environment it supplies, through the conditions Testing is told to run under. Testing is not changed and stays closed: it compares the name and value as opaque strings, and a Run performs the required instance its conditions provide and leaves the other unrun.

What this earned of the Extension rules. A Skill received what the Extension produced as an argument from its caller and never by importing it, so that rule held without routing around it. An Extension in one directory played both roles in one file without either role needing a rule the other forbids. Not decided and not exercised by the Extension's own code: an Extension depending on another Extension. The demonstration of this Extension in its test reads the derived instances through KAAL's Test composition in scripts/, so that dependency is the test's and is the next real case a rule for it would be earned from.

What it did not move. Testing's own observation of the Run still states the platform as Node spells it, as a fact of the Run beside the environment. That is Testing's own conditions and was left as it was, so the provider's spelling stops at the Extension for KAAL's decisions and environment, and not yet for what a Run records of itself.
