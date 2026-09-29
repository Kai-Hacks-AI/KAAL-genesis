# Regression Plan

## Commitments

1. Adding. Stated in `src/add.ts`. Shown by its cases and the seal checks.
3. Greeting by name. Stated in `requirements/greets-by-name/requirement.md`. Shown by its cases.
4. Greeting politely. Stated in `requirements/greets-politely/requirement.md`. Shown by its cases.

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
