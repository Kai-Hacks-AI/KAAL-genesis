# Spike: carrier-observed Case sameness

Disposable experiment, not part of KAAL. It tests one hypothesis. The carrier that executes a JS/TS Case could
answer `same | changed | unknown` for an inherited Case's executable definition by observing its own
interpretation. KAAL would then not reconstruct the inputs of that interpretation.

- `record.mjs` is a `module.registerHooks` recorder. It is passed as `--import` to the tsx CLI, which registers it after
  tsx's own loader. It logs each resolve (specifier, parent, final URL) and each load (format, and the source tsx hands
  Node).
- `carrier.mjs` holds `observe` (runs one case file the way KAAL's replay does), `facts` (places URLs, normalises carrier
  noise) and `judge` (three-valued, with modes).
- `corpus.mjs` is the adversarial matrix, shaped after #62's synthetic regression and its review findings.
- `kaal.mjs` observes KAAL's own case files across consecutive `kaal/testing` states.

```
node spike/carrier-sameness/corpus.mjs [--only <row>] [--json out.json]
SPIKE_TSX_OLD=<prefix with tsx@4.19.2> SPIKE_LEXER=<prefix with es-module-lexer> node spike/carrier-sameness/corpus.mjs
node spike/carrier-sameness/kaal.mjs out.json <accepted> <candidate> [<accepted> <candidate>]...
```

The role of a participant, testing input or tested subject, is not the carrier's to decide. Here it is supplied
from Testing's existing data boundary (`isData` in `scripts/regression.ts`) plus the case file itself.
