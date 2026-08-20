# 2026-08-20 — holiday-calendar / public-holiday-lookup Nager.Date 204 fix

Intent: fix the `holiday-calendar` crash on Thailand (3 failed external x402 calls 2026-08-19→20, "Unexpected end of JSON input"), add regression tests, ship, verify in prod. Quick mode. Spawned from an /activity finding.

## Root cause
Nager.Date returns **204 No Content** (empty body, `res.ok` true) for countries it recognizes but has no holiday data for. Both `holiday-calendar` and `public-holiday-lookup` called `res.json()` on the empty body. Verified: Nager's `AvailableCountries` lists 204 countries; gaps include TH, IN, MY, PK, AE, SA.

## Shipped — PR #344, merged `e825a05`, deployed + prod-verified
- `getHolidays()` (holiday-calendar.ts): 204 → structured "not covered" error, negative-cached 24h (only a true 204; empty/unparseable 200 errors uncached so transients retry). JSON.parse guarded.
- `public-holiday-lookup` had its own duplicate raw Nager fetch with the same latent crash (altitude-review finding) — now routes through the shared `getHolidays()`. Its 404 error text changed to the shared wording.
- New `holiday-calendar.test.ts` — 7 tests, both capabilities, verified fail-before/pass-after.
- Manifests: both said "any country"; now "200+ countries covered by Nager.Date" + a `warning`-severity coverage limitation naming the verified gaps.
- DB synced post-deploy: `sync-manifest-text-to-db.ts` for both slugs (descriptions + schemas) and a one-shot for `capability_limitations` (holiday-calendar's understated row updated, public-holiday-lookup's inserted). Prod catalog confirmed serving new text.

## Prod verification (DEC-20260504-C)
- No deploy-pipeline dependency (pure executor code on the auto-register import graph).
- `/health` cut over to `e825a05` ~75s after merge.
- Prod `/v1/do` TH → structured "not covered" error, **no charge** (DEC-14 honored), on BOTH capabilities. SE → 16 holidays, 2¢, 28ms.

## Loose threads
1. **Error sanitizer redacts the coverage URL**: prod customer-facing error reads "Covered countries: [service]" — the vendor-redaction sanitizer masks the machine-readable `AvailableCountries` URL, so agents can't actually follow the pointer. Platform-wide sanitizer behavior, not fought here. Consider whether coverage-list URLs deserve a sanitizer allowlist, or surface coverage in the manifest/catalog instead (partially done via the limitation text, which does include the URL).
2. **Refusal-vs-fault taxonomy (known gap, now load-bearing here)**: the "not covered" refusal counts as a capability *failure* under the armed quality floor. This PR doesn't worsen metrics (crash→refusal, same count), but observed traffic is exactly agents probing uncovered countries — if that grows, these capabilities drift toward quarantine for behaving correctly.
3. **Pre-existing, out of scope**: `business-day-check` silently degrades to weekend-only when `getHolidays` throws (bare catch); `public-holiday-lookup` interpolates non-2-letter input into the URL path (fixed host, bounded); `holiday-calendar` DB row has `dataClassification` null (one pre-existing ✗ in validate-capability).
4. `~89` executor files call raw `res.json()` with no parse guard — altitude review judged a shared `fetchJson()` helper the right long-term substrate, adopted opportunistically, not a sweep.

## Protocol reports
- /go ran: tsc ✅, vitest 7/7 ✅, smoke ✅×2, validate ✅ (1 pre-existing ✗ noted), checkReadiness ready:true ×2. Six-lens review: 0 HIGH, 3 MEDIUM (2 addressed in-PR, 1 flagged = taxonomy), LOWs addressed.
- Onboarding protocol: modified-capability gates all run (see above).
- Not a cert-audit follow-up (no finding code), but regression tests verified in both directions anyway.
