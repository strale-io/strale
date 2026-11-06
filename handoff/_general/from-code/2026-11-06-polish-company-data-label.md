Intent: correct the `polish-company-data` transparency label from `ai_generated` to `algorithmic` (Petter's decision 10 of 2026-11-06), after re-checking that no path calls a model.

- Re-check: the executor imports only the capability registry and `lib/vat-derivation.ts` (no imports, pure arithmetic); no fallback chain is registered for the slug; it is not in the Anthropic provider's lists in `dependency-manifest.ts`, so `getExecutor` never wraps it as an LLM call; the name-search path throws before any fetch. The block's test pins all four facts.
- Block 0146 (run policy once) rewrites the db-canonical `transparency_tag` for that one slug, guarded on the old value. Ledger row M089; a `known_overlaps` entry records that 0144 and 0146 write `capabilities.transparency_tag` on disjoint slugs.
- Manifest carries the same value.
- After deploy: read the tool page or `SELECT transparency_tag FROM capabilities WHERE slug = 'polish-company-data'` to confirm `algorithmic` (DEC-20260504-C).
