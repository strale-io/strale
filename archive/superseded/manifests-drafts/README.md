# manifests-drafts/ — NOT the onboarding pipeline

Draft capability manifests produced by the 2026-08-13 demand-mining analysis
(`docs/strategy/2026-08-demand-mined-build-queue.md`).

**These files are deliberately outside `manifests/`.** `apps/api/scripts/onboard.ts`
takes an explicit `--manifest <path>`, so nothing here is picked up automatically —
but do not point it at this directory either. A draft manifest is a **proposal**,
not a capability:

- No executor exists at `apps/api/src/capabilities/<slug>.ts` for any of these.
- `expected_fields` and `output_field_reliability` are **hand-written guesses**, not
  discovered from live output. The pipeline generates those with `--discover`; the
  values here will be wrong in detail.
- Each file opens with a `# DRAFT` header listing the **verification debt** that must
  be closed before the capability is built — unpublished rate limits, unconfirmed
  response fields, terms-of-use reads, and (for `mexican-company-data`) a personal-data
  judgement that is a human call, not an engineering one.

## Promotion path

1. Close the verification debt in the header. If a source turns out not to support the
   capability, delete the draft and record the decline in `docs/demand/intake-log.md`.
2. Write the executor.
3. Move the file to `manifests/`, strip the `# DRAFT` block.
4. Run the real pipeline per CLAUDE.md — `onboard.ts --discover` regenerates
   `expected_fields` and `output_field_reliability` from live output, overwriting the
   guesses here.
5. `validate-capability.ts`, `checkReadiness`, `smoke-test.ts` as normal.

## Contents

| Draft | Queue rank | Source | Verification debt |
|---|---|---|---|
| `mexican-company-data.yaml` | 1 | INEGI DENUE API (official, free, token) | Rate limits + ToS unpublished; personal-data call |
| `company-name-resolve.yaml` | 2 | Composes Serper + DNS + existing registries | Per-registry match thresholds |
| `product-offers-lookup.yaml` | 3 | Serper.dev `/shopping` (vendor already live) | Response shape not yet captured |
| `domain-email-provider-detect.yaml` | 4 | DNS MX only (zero external cost) | Provider fingerprint list needs sourcing |
| `sec-edgar-name-search.yaml` | 5 | SEC EDGAR full-text search (official, free) | Fair-access UA/rate compliance |
