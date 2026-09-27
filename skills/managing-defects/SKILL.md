---
name: managing-defects
description: Keep a persistent record of each defect, something intended to hold that was observed not to hold, and of its repair once it is repaired.
---

# Managing Defects

A defect is a persistent record that something intended to hold was observed not to hold. Keep one when an observation shows such a failure, so it is not lost when the run that showed it is gone.

The observation, the defect and its repair are distinct. The defect keeps what was observed; its repair is recorded beside it, never over it.

Each defect is a directory in a defects directory the using system chooses, named for the defect with lowercase letters, digits and single hyphens. It holds `defect.md`, and once the defect is repaired, `resolved.md`. A defect is open until it is resolved.

- `defect.md` records `holds`, what was intended to hold, and `observed`, where it was observed not to hold, as frontmatter, followed by what was observed. It never changes once written.
- `resolved.md` records `by`, what repaired the defect, as frontmatter, followed by how.

Record a defect with `scripts/record.ts <dir> <name> --holds <what should hold> --observed <where> <observation-file>`. It refuses a defect that is already recorded. Resolve one with `scripts/resolve.ts <dir> <name> --by <what repaired it> <how-file>`. It refuses a defect that is not recorded or is already resolved. Check a defects directory with `scripts/check.ts <dir>`: it reports every record that is incomplete or out of place, and otherwise lists each defect as open or resolved.
