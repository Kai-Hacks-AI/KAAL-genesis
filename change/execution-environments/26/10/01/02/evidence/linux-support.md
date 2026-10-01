---
requirement: linux-support
parameters:
  environment: linux
---

KAAL's support for Linux is evidenced only under the execution environment `linux`: the HOW of whichever Test Case tests linux-support must have passed in a Run that provides `environment=linux`.

What realizes that condition, and how a host is observed to be Linux, is the environment adapter's. This decision names the environment in KAAL's terms and no provider's, and the Test Case stays generic.
