Intent: enforce DEC-20260420-H's "no ToS-prohibited scraping" posture across the EU commercial-KYB-aggregator cluster — deactivate the 6 country caps whose primary runtime hit ToS-prohibited aggregators, surgically strip the aggregator path on 3 more where it was a fallback/leg, and pause the 15 dependent KYB solutions.

## What landed

Commit `afcb2d2` on `main`. New decision: **DEC-20260427-I**.

### Hard deactivations (6 caps)

Added to `DEACTIVATED` map in `apps/api/src/capabilities/auto-register.ts`:

| Slug | Aggregator | KYB solutions affected |
|---|---|---|
| `dutch-company-data` | northdata.com | kyb-essentials-nl, kyb-complete-nl, invoice-verify-nl |
| `portuguese-company-data` | northdata.com | kyb-essentials-pt, kyb-complete-pt, invoice-verify-pt |
| `lithuanian-company-data` | northdata.com | (none seeded) |
| `spanish-company-data` | empresia.es + infocif.es | kyb-essentials-es, kyb-complete-es, invoice-verify-es |
| `german-company-data` | northdata.com | kyb-essentials-de, kyb-complete-de, invoice-verify-de |
| `austrian-company-data` | firmenbuch.finapu.com (+ wko.at fallback) | kyb-essentials-at, kyb-complete-at, invoice-verify-at |

### Surgical fixes (3 caps)

| Slug | Compliant primary kept | Stripped |
|---|---|---|
| `swiss-company-data` | Zefix PublicREST API | Browserless+northdata fallback (provider chain + direct executor) |
| `polish-company-data` | KRS API by 10-digit number | northdata-backed name-search |
| `officer-search` | UK Companies House + SEC EDGAR | northdata.com EU leg |

### Solutions paused (15)

`apps/api/scripts/drop-aggregator-kyb.ts` ran against prod — all 15 rows now `is_active=false`. Slugs:
`kyb-{essentials,complete}-{nl,pt,es,de,at}`, `invoice-verify-{nl,pt,es,de,at}`.

Lithuania (LT) had no seeded KYB solutions in `seed-kyb-solutions.ts` — nothing to pause. Worth noting: the `lithuanian-company-data` capability existed in the catalog but no customer-facing LT KYB solutions did.

## Reactivation pattern

Per country, in this order:

1. Wire a compliant data source into the country's `*-company-data` executor (licensed registry / multi-country aggregator).
2. Remove the slug from the `DEACTIVATED` map in [apps/api/src/capabilities/auto-register.ts](apps/api/src/capabilities/auto-register.ts).
3. `UPDATE solutions SET is_active = true WHERE slug IN ('kyb-essentials-{cc}','kyb-complete-{cc}','invoice-verify-{cc}');` — full SQL for all 15 inline in [apps/api/scripts/drop-aggregator-kyb.ts](apps/api/scripts/drop-aggregator-kyb.ts).

## Customer-facing impact

KYB Essentials / Complete / Invoice Verify still operate in: SE, NO, DK, FI, UK, FR, BE, IE, IT, CH (Zefix-credentialed), PL (KRS-number-only), HR, GR, US, CA, AU. The 6 deactivated EU countries (NL, PT, LT, ES, DE, AT) return `no_matching_capability` for the underlying `*-company-data` calls and `is_active=false` for the 15 dependent solutions.

CH still answers via Zefix when `ZEFIX_USERNAME` / `ZEFIX_PASSWORD` are set; clear error otherwise. PL still answers when caller supplies a 10-digit KRS number; clear error otherwise. `officer-search` still answers for UK / US queries; clear error for EU queries.

## Decisions logged

- **DEC-20260427-I** — Deactivate 6 commercial-KYB-aggregator-dependent country caps; strip northdata fallbacks from CH/PL/officer-search; pause 15 KYB solutions.

## Open follow-ups

- **Replacement strategy** for the 6 deactivated countries. Per-country licensed registry contract OR a single multi-country aggregator (Creditsafe, Bisnode/Dun & Bradstreet, Experian) covering most of the 6 in one pass. Not actioned this session — needs procurement decision.
- **Government UI scrapes** for BE, IE, IT, LV, JP, AU, CA company-data + customs-duty-lookup. Audit (`docs/audits/2026-04-21-allabolag-pattern-full-inventory.md`) classifies these as transport-divergence (gov UI scrapes, generally permitted under EU PSI/HVD directives). Each registry's ToS should still be confirmed case-by-case before treating as fully compliant — separate sweep.
- **Lithuania orphan capability.** `lithuanian-company-data` had no seeded solutions. Worth understanding why before reactivation: either solutions were intentionally not seeded, or this is a gap.
- **Solution composition referencing officer-search.** A `startup-pulse`-style multi-step research solution composes `officer-search` as one parallel step. Now that EU coverage is gone, that step will throw `no officers found` for non-UK/US queries inside the solution. Output degrades gracefully (other steps still run).
