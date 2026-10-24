---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Wire-shape rule for /v1/public/ops/trust/* endpoints"
moved_at: 2026-10-24
---

# Wire-shape rule for /v1/public/ops/trust/* endpoints

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

The trust endpoints (and any future endpoint surfacing money values, scores, or anything formattable) MUST emit canonical machine-readable values, NEVER pre-formatted display strings. Specifically:

- **Money** is always integer cents (`*_cents`), never a formatted string like `"€0.02"`.
- **Scores** are 0-100 integers or 0-1 decimals (be consistent within an endpoint).
- **Dates** are ISO 8601 strings.
- If you need to ship a pre-rendered display value alongside the canonical one, add a `*_formatted` field — additive, never replacing.

Why: a 2026-04-30 cert-audit finding traced the empty "SQS 0 / Price unavailable" fallback card on capability detail pages to a serializer that emitted `fallback_price: "€0.02"` (string) and dropped the integer. The frontend normalizer either had to regex-parse currency or read a fictitious `*_cents` field that defaulted to 0. Removing the formatted strings entirely was cheaper than maintaining a deprecated lossy field forever. Display formatting is the consumer's responsibility.

For wire-shape ↔ consumer-shape contracts (where backend uses one set of names and the frontend normalizer maps to different names — e.g. backend `fallback_capability` → frontend `capability_slug`), the shape-check script can't help (the names are different by design). Use a frozen-fixture contract test instead. Pattern: `strale-frontend/src/lib/api.contract.test.ts` with the fixture in `src/lib/__fixtures__/`. Re-capture the fixture when the wire shape legitimately changes (the test file's docstring has the curl command); the test fails loudly when a normalizer change drops a field or reads a wrong name.
