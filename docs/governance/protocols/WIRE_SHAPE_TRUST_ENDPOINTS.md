---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Wire-shape rule for /v1/public/ops/trust/* endpoints"
---

# Wire-shape rule for /v1/public/ops/trust/* endpoints

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and protocol router can reference a
> full-body path (T6 M3 batch 7). It carries no authority of its own and must
> never be edited on its own: any change belongs in `CLAUDE.md` first, then
> re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Wire-shape rule for /v1/public/ops/trust/* endpoints

The trust endpoints (and any future endpoint surfacing money values, scores, or anything formattable) MUST emit canonical machine-readable values, NEVER pre-formatted display strings. Specifically:

- **Money** is always integer cents (`*_cents`), never a formatted string like `"€0.02"`.
- **Scores** are 0-100 integers or 0-1 decimals (be consistent within an endpoint).
- **Dates** are ISO 8601 strings.
- If you need to ship a pre-rendered display value alongside the canonical one, add a `*_formatted` field — additive, never replacing.

Why: a 2026-04-30 cert-audit finding traced the empty "SQS 0 / Price unavailable" fallback card on capability detail pages to a serializer that emitted `fallback_price: "€0.02"` (string) and dropped the integer. The frontend normalizer either had to regex-parse currency or read a fictitious `*_cents` field that defaulted to 0. Removing the formatted strings entirely was cheaper than maintaining a deprecated lossy field forever. Display formatting is the consumer's responsibility.

For wire-shape ↔ consumer-shape contracts (where backend uses one set of names and the frontend normalizer maps to different names — e.g. backend `fallback_capability` → frontend `capability_slug`), the shape-check script can't help (the names are different by design). Use a frozen-fixture contract test instead. Pattern: `strale-frontend/src/lib/api.contract.test.ts` with the fixture in `src/lib/__fixtures__/`. Re-capture the fixture when the wire shape legitimately changes (the test file's docstring has the curl command); the test fails loudly when a normalizer change drops a field or reads a wrong name.
<!-- END VERBATIM FROM CLAUDE.md -->
