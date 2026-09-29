---
excludes:
  - case: scripts/cases.test.ts
    title: greets
    because: greeting with hello is given up
  - case: scripts/shadowed.test.ts
    title: drops
    because: greeting with hello is given up here too
  - case: scripts/shadowed.test.ts
    title: adds beside a shadow
    because: the seal checks show adding without it
---
