# Feature

This Change moves the requirement that Changes be sealed into `check-seals`, and leaves CI's sealing as the writer that meets it. A ready pull request into a `kaal/*` flight or main is red in `check-seals` while a Change it touches is unsealed, so an agent that omits sealing cannot present a mergeable Change; a draft is not held to it. Where CI can write back, `seal-pull-request` seals exactly those Changes with the existing Change Sealing and `check-seals` turns green on the sealed head; elsewhere the Changes must arrive sealed. The separate `seal-change` status is gone: there is one verdict, `check-seals`, and the writer publishes none. The sealing workflows are renamed `seal-pull-request` and `request-sealing`.

It composes; it does not seal. The rule is `unsealedErrors` in `scripts/pull-request-sealing.ts`, run by `check-seals` from the trusted checkout; what sealing means and the bytes it writes remain `scripts/change-seals.ts`.
