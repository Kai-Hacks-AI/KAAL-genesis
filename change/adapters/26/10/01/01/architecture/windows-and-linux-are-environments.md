---
id: windows-and-linux-are-environments
---

Windows and Linux are execution environments, and what is specific to one of them belongs to an environment adapter, which is a different kind of boundary from a carrier or a host.

A generic operation such as disposing a scratch workspace, bounding a process, handling a symlink or a path stays generic: it does not acquire an environment's semantics because that environment needs different mechanics, and the mechanics are the adapter's. Only meaning that is itself environment-specific, such as a requirement about a POSIX named pipe, belongs with that environment's meaning. A generic Test Case that is shown under more than one environment is one Test Case, so environment-specific execution is not environment-specific Test Case identity, and a skip is not a statement that the capability does not apply.
