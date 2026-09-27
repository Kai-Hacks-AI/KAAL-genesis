# Defects

Use BRAIN for why KAAL keeps defects here and what each records: `brain/learning/genesis/26/09/27/02/nodes/managing-defects.md`.

Use the `managing-defects` skill to record and check them, through `npm run defects:record` and `npm run defects:check`. A defect is sealed: its record is never written again. It names no case and no state: a case that tests a defect points at it with `// Tests: defects/<name>`.
