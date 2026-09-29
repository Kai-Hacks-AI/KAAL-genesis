# Regression Plan

## Commitments

1. Adding. Stated in `src/add.ts`. Shown by its cases and the seal checks.
2. Greeting. Stated in `brain/learning/k/26/01/01/01/nodes/greeting.md`. Shown by its cases.
3. Greeting by name. Stated in `requirements/greets-by-name/requirement.md`. Shown by its cases.
4. Saying goodbye. Stated in `requirements/says-goodbye/requirement.md`. Shown by its cases.

## How this regression differs from the one it was derived from

Derived from: the accepted regression `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.

## As runs read it

```yaml
conditions:
  - { platform: linux }
  - { platform: win32 }
proof:
  the seal checks:
    - { platform: linux }
```
