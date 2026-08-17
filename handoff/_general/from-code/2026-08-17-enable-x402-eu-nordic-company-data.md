Intent: Run the incremental `/activity` check, then enable the USDC (x402) rail on the active EU/Nordic company-data registries that were showing up as `x402_not_on_rail` misses.

## Context — what the activity check surfaced

Window 2026-08-16 15:37 → 2026-08-17 08:54 CET (~17h). 38 external calls, all x402, 35 completed / 3 failed (the 3 failures were correct refusals / dead upstreams — Trustpilot ToS-block ×2, a 404 Blogger image). Zero signups, zero wallet, zero solutions, zero website searches. Two distinct machine users: a supplier-vetting agent (16× email-validate, China e-bike/PCB sourcing domains) and an SEO/betting-tips content bot (11× google-search `site:blogspot.com` + 5× image-to-text on Blogger images).

The real signal was **495 `failed_requests`, 493 of them `x402_not_on_rail`** — 13× the volume of actual paid traffic. Agents were hitting `/x402/:slug` for capabilities we sell but hadn't enabled for USDC. The loudest cluster was EU/Nordic company-data registries: danish 24, irish 17, latvian 14, lithuanian 12, plus croatian/cz/greek/slovak/slovenian demand (~85 refused registry requests in 17h against capabilities that already work on the wallet path).

## What shipped

Direct prod-DB flip (the rail is DB-driven; per CLAUDE.md `UPDATE capabilities SET x402_enabled = true` is the whole mechanism — no code/manifest change):

```
UPDATE capabilities SET x402_enabled = true, updated_at = now()
WHERE slug = ANY([9 slugs])
  AND is_active = true AND x402_enabled = false
  AND marketplace_eligible = true
  AND lifecycle_state IN ('active','probation');
```

9 rows flipped, all 5c, all `lc=active`:
**croatian · cz · danish · greek · irish · latvian · lithuanian · slovak · slovenian** -company-data.

## Verification

- **Rail surfacing:** all 9 now return `HTTP 402` (payment challenge) on `POST /x402/:slug` against prod (`strale-production.up.railway.app`), previously `404`. The gateway caches the catalog for 60s (`CACHE_TTL_MS = 60_000` in `x402-gateway-v2.ts`), so surfacing lagged the DB write by ~1 min — first probe returned 404, re-probe after ~70s returned 402 for all 9.
- **Functional health (test_results, 30d):** all 9 have recent passing runs; none are actually broken. greek 368/0, slovenian 719/0, croatian 357/1 (1 timeout), irish 716/12 (fails are correct refusals on junk input like `"461onal"`), lithuanian 716/23 + slovak 627/23 (fails are upstream timeouts), danish 106/103 (the "fails" are **test-budget throttling** — `exhausted daily test budget`, NOT breakage; 106 real passes prove it works), cz 1/0 + latvian 2/0 (low sample, paid tier rarely test-scheduled, passing).
- None of those failure modes count against the armed quality floor — it operates on real customer calls, and refusals/timeouts/budget-caps don't trip it.

## Left untouched (deliberately)

`austrian`, `dutch`, `portuguese`, `italian` company-data are EU but `is_active=false` / `lc=degraded` — flipping x402 on them does nothing (they fail the `is_active` + `lifecycle` gates in `ensureCache()`). They need repair, not a rail flip. Open thread if we want the EU registry set complete.

## Non-obvious learnings

- **The x402 rail has four gates, not the one CLAUDE.md implies.** `ensureCache()` in `apps/api/src/routes/x402-gateway-v2.ts:103` requires `x402_enabled AND is_active AND marketplace_eligible AND lifecycle_state IN ('active','probation')`. A row can read `x402_enabled = true` in the DB and still 404 on the rail. Consequence with the armed quality floor: a quarantine (lifecycle flip) silently pulls a paying slug off the rail and payers get a 404 with no "temporary" signal.
- **`company-data` slugs are split across two category values** — `company-data` and `data-extraction`. Filtering by `category = 'company-data'` misses danish/finnish/norwegian/greek/etc. Enumerate by slug (`LIKE '%company-data%'`), not category.
- **Nordics were already mostly on the rail** (SE/NO/FI/EE x402=true) — Denmark was the one Nordic gap.
- `test_results` timestamp column is `executed_at`, not `created_at` (bit me once). Pass/fail column is `passed`.
- danish's 50% test "fail" rate is a red herring — it's the free-tier daily test-budget cap, exactly the "harness doesn't measure customers" caveat in memory.

## Cost

€0 external. Read-only activity queries + one prod DB UPDATE. No capabilities were executed against paid upstreams.

## Open threads

1. **440+ other `x402_not_on_rail` misses remain** beyond the EU/Nordic registries — top non-registry offenders: product-search (57, inactive), url-to-text (52, flipped on earlier at 08:55), linkedin-url-validate (18, inactive), screenshot-url (16), employer-review-summary (15, inactive), plus kyb-complete-{dk,se,nl,pt} solutions (10–13 each, mostly inactive). Catalog-wide: 46/306 active capabilities and 26/104 active solutions are still off the USDC rail. Worth a deliberate pass deciding which to enable vs. which are inactive-for-a-reason.
2. **The 4 degraded EU registries** (austrian/dutch/portuguese/italian) — repair-or-retire decision.
3. Pre-existing: `ops/company-scaffold` is 14 commits ahead of origin (not from this session).
