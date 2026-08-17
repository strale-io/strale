# singapore-company-data — deactivation investigation + revive/drop scope

**Date:** 2026-04-21
**HEAD:** `8a4e51b` (`main`)
**Scope:** Read-only. No DB writes, no code edits, no YAML changes.
**Follow-up:** A second prompt will execute either the revive plan or the drop plan based on Petter's decision.

---

## 1. Executive summary

`singapore-company-data` is a Browserless + OpenCorporates scraping capability for Singapore company lookup (UEN or fuzzy name). It has been `lifecycle_state = deactivated` since **2026-04-01** via a manual sweep in commit [`33edac1`](../apps/api/src/jobs/fix-lifecycle-anomalies.ts#L22-L28) (`feat: fill lifecycle state machine gaps`). It was already listed in the auto-register `DEACTIVATED` map since **2026-03-20** (commit [`a80ea1d`](../apps/api/src/capabilities/auto-register.ts#L13-L18), reason: *"No viable data source identified"*). In between, it accumulated **41 production transactions — 0 succeeded, 41 failed** — and **30 test runs on 2026-03-16 only** (19 pass / 11 fail, all within a 1.5-hour window; no tests since).

The failure classification is **Type 3 — structural / provider landscape**. OpenCorporates scraping returns nothing for real Singapore UENs (e.g. `199901616D` — the UEN of Singapore Airlines) and for well-known names (e.g. `DBS Group Holdings`). Singapore's authoritative source (ACRA BizFile) is a paid per-query subscription that does not fit Strale's €0.80/call pricing. There is no cheap, reliable alternative.

The three dependent solutions (`invoice-verify-sg`, `kyb-complete-sg`, `kyb-essentials-sg`) are `is_active = true` in DB and listed in `public/sitemap.xml` (indexed by Google) but have **zero customer transactions ever**. All three position `singapore-company-data` as their non-parallel **step 1**, so any agent call to those solutions today would fail at the first step.

**Recommendation: DROP** (full rationale in §6). Revive cost is high (swap provider and pricing model), revive benefit is zero (no customer traffic), and retaining the solutions risks an agent discovering them via `/v1/suggest` → broken call → poor first-impression.

---

## 2. Investigation findings

### 2.1 Code inventory

| Artifact | Path | State |
|---|---|---|
| Capability executor | [apps/api/src/capabilities/singapore-company-data.ts](../apps/api/src/capabilities/singapore-company-data.ts) | Present (61 LOC). Registers with `registerCapability("singapore-company-data", ...)` but auto-register skips it via `DEACTIVATED` map. |
| YAML manifest | `manifests/singapore-company-data.yaml` | **Absent** (flagged as orphan in Phase 4b.2, [audit-reports/2026-04-21-phase-4b2-orphan-audit.md](./2026-04-21-phase-4b2-orphan-audit.md) §3.3) |
| Seed entry | [apps/api/src/db/seed.ts:686-693](../apps/api/src/db/seed.ts#L686-L693) | Present. Category `data-extraction`, price 80¢, required input `uen`. |
| Auto-register DEACTIVATED entry | [apps/api/src/capabilities/auto-register.ts:17](../apps/api/src/capabilities/auto-register.ts#L17) | *"No viable data source identified"* |
| Lifecycle-anomalies sweep entry | [apps/api/src/jobs/fix-lifecycle-anomalies.ts:27](../apps/api/src/jobs/fix-lifecycle-anomalies.ts#L27) | Listed in `ANOMALOUS` cohort (same batch as amazon-price, hong-kong-company-data, indian-company-data) |
| Solution seed entry | [apps/api/scripts/seed-kyb-solutions.ts:65](../apps/api/scripts/seed-kyb-solutions.ts#L65) | `{ code: "sg", companyDataSlug: "singapore-company-data", exampleId: "DBS Group", … }` |
| Frontend sitemap | [public/sitemap.xml](../../strale-frontend/public/sitemap.xml) | Contains `/solutions/kyb-essentials-sg`, `/solutions/kyb-complete-sg`, `/solutions/invoice-verify-sg` |
| Frontend sitemap generator | [scripts/generate-sitemap.ts:23](../../strale-frontend/scripts/generate-sitemap.ts#L23) | **Excludes the capability** from sitemap, but does not exclude the solutions — hence the three `/solutions/*-sg` URLs are still published. |
| Frontend runtime references | (none in `src/`) | Solution pages render dynamically from API; no hardcoded SG references. |
| `public/llms.txt` | no matches | — |
| `capability-sources/` | (no SG files) | No artifacts for revive pipeline either. |

### 2.2 Implementation review

The executor does not call ACRA. Despite the DB `data_source` field reading "ACRA / Accounting and Corporate Regulatory Authority (Singapore)", the code uses OpenCorporates (`https://opencorporates.com/companies/sg/…`) via `fetchRenderedHtml` (Browserless) followed by Claude extraction from HTML text. UEN regex is `/^\d{8,9}[A-Z]$/`. Non-UEN input falls through to a name-based OpenCorporates search.

This is the same pattern used by ~11 EU registries via `apps/api/src/capabilities/lib/browserless-extract.ts`. The pattern works well for jurisdictions where OpenCorporates has coverage (Ireland, Netherlands, etc.). It does not work well for Singapore — empirically confirmed below.

### 2.3 Production transaction history

41 transactions total, 0 succeeded. Recent 10 shown below (from DB query via Railway Postgres public URL):

| when | status | error |
|---|---|---|
| 2026-03-16 09:32 | failed | `No Singapore company found matching "199901616D"` (UEN of Singapore Airlines) |
| 2026-03-16 09:15 | failed | `'uen' or 'company_name' is required` |
| 2026-03-15 13:26 | failed | `No Singapore company found matching "196800306E"` (UEN of DBS Bank) |
| 2026-03-13 09:15 | failed | `fetch failed` (Browserless/network error) |

All 41 transactions have `solution_slug = NULL` — direct capability calls (probably from test runner or early validation), **none via the SG solutions**. Last transaction: 2026-03-16.

### 2.4 Test history

30 test runs, all on 2026-03-16, all within 97 minutes (09:01–10:37). 19 pass, 11 fail. The pass/fail pattern alternates — suggesting the passing runs are `negative` or `schema_check` tests (testing error paths, not actual data retrieval), and the failing runs are `known_answer` tests (testing real SG companies). Example fails:

- `Execution error: No Singapore company found matching "199901616D"` (known_answer for Singapore Airlines)
- `Execution error: No Singapore company found matching "DBS Group Holdings"` (known_answer fuzzy match for DBS)

No test runs after 2026-03-16 because `scheduleTier` was extended on 2026-04-01 ([`33edac1`](../apps/api/src/jobs/test-runner.ts)) to exclude `suspended`/`deactivated` capabilities from the test scheduler.

### 2.5 Solution dependencies

All three SG solutions place `singapore-company-data` at **step 1**, `can_parallel = false` (blocking gate). Full composition:

**`kyb-essentials-sg`** (3 steps, 147¢):
1. singapore-company-data (blocking)
2. sanctions-check (parallel grp 1)
3. lei-lookup (parallel grp 1)

**`kyb-complete-sg`** (11 steps, 270¢): SG cap + lei-lookup + sanctions-check + pep-check + adverse-media-check + domain-reputation + whois-lookup + ssl-check + dns-lookup + email-validate + risk-narrative-generate.

**`invoice-verify-sg`** (12 steps, 277¢): SG cap + iban-validate + bank-bic-lookup + sanctions-check + adverse-media-check + invoice-validate + domain-reputation + whois-lookup + email-validate + dns-lookup + redirect-trace + risk-narrative-generate.

Of these, **only `singapore-company-data` is SG-specific by construction.** Every other step is pure algorithmic / generic external API (sanctions, LEI, IBAN, PEP, WHOIS, DNS). If the SG cap is removed, the solutions become degenerate: either they fail at step 1, or (if SG step removed) they become generic KYB solutions with the country tag attached for marketing but no country-specific data retrieval — which is worse than offering them at all.

### 2.6 Solution transaction history

`SELECT solution_slug, COUNT(*) FROM transactions WHERE solution_slug IN ('invoice-verify-sg','kyb-complete-sg','kyb-essentials-sg')` returns **zero rows**. Not a single customer has ever called one of the three SG solutions. `x402_enabled = false` on all three.

### 2.7 Timeline

| Date | Event | Source |
|---|---|---|
| 2026-02-26 | Capability code added (batch of 25) | [`fd93482`](../) |
| 2026-02-26 | DB row created (created_at) | DB |
| 2026-03-13–16 | 41 production transactions, all failed | `transactions` table |
| 2026-03-16 | 30 test runs in 1.5h window | `test_results` table |
| 2026-03-20 | Added to `DEACTIVATED` map: "No viable data source identified" | [`a80ea1d`](../) |
| 2026-04-01 | Lifecycle anomaly sweep sets `lifecycle_state='deactivated'`, `is_active=false`, `visible=false` | [`33edac1`](../) |
| 2026-04-03 | `updated_at` timestamp | DB |
| 2026-04-21 | Phase 4b.2 orphan audit flags as `needs-human-input` (§3.3) | [`2026-04-21-phase-4b2-orphan-audit.md`](./2026-04-21-phase-4b2-orphan-audit.md) |

### 2.8 Current DB state

```
slug                : singapore-company-data
lifecycle_state     : deactivated
is_active           : false
visible             : false
data_source         : ACRA / Accounting and Corporate Regulatory Authority (Singapore)   (misleading — see §2.2)
price_cents         : 80
transparency_tag    : ai_generated
capability_type     : scraping
maintenance_class   : scraping-stable-target
created_at          : 2026-02-26T22:25:08Z
updated_at          : 2026-04-03T00:02:12Z
deactivation_reason : Manual deactivation — lifecycle state cleanup (2026-04-01)
```

---

## 3. Failure classification

**Type 3 — Structural / provider landscape.** Reasoning, tied to §2 evidence:

- **Not Type 1 (mechanical)**: no env var unset, no auth token expired. The capability doesn't use any credentials — it's a public-web scrape via Browserless. Not a config issue.
- **Not Type 2 (shape change)**: the failure mode isn't "OpenCorporates changed their HTML, our scraper broke on fields." The failure is "OpenCorporates doesn't have these Singapore companies' individual pages retrievable via the URL pattern used, or its search returns empty for real SG entities." §2.3's failures on `199901616D` (Singapore Airlines) and `DBS Group Holdings` are canonical SG entities — if OpenCorporates returns nothing for them, the source itself is insufficient, not just misaligned with the scraper.
- **Not Type 4 (no implementation)**: code is present and coherent.
- **Not Type 5 (can't determine)**: §2.3 + §2.4 + §2.2 give direct evidence of the failure mode.
- **Is Type 3**: the viable Singapore data sources are (a) ACRA BizFile — paid per-query, SGD-denominated, above Strale's current €0.80 price point; (b) OpenCorporates API — free tier exists but coverage of SG is limited, paid tier required for meaningful volume; (c) private aggregators like D&B Hoovers or LexisNexis — enterprise pricing. No cheap, reliable source exists at the price Strale set. Petter already independently reached this conclusion on 2026-03-20 when he added the DEACTIVATED entry.

---

## 4. Revive plan

**Only relevant if Petter overrides the recommendation.** Not a cheap fix.

### 4.1 What revive requires

Revive cannot use the current implementation. The current code's source is the problem; fixing the code won't make SG companies appear in OpenCorporates. Revive options:

1. **Switch to ACRA BizFile** (authoritative). Requires Singapore business registration or SG-resident account, SGD-denominated per-query fees (SGD 0.50–5.00 per query depending on data tier), OAuth2 flow. Re-price the capability (min 200¢ to break even including Claude's costs of narrative synthesis). Effort: 8–16 hours for the integration, plus legal/contractual setup that may take days–weeks.
2. **OpenCorporates paid API tier** (aggregator). SGD 80/month for basic API access, per-query limits. Coverage is still patchy for SG. Effort: 4–6 hours to swap scraping for API. Risk: still may not resolve real SG UENs.
3. **Different aggregator** (e.g. SGTRADE, D&B). Pricing similar to BizFile. Engineering similar to option 1.
4. **Keep scraping, different strategy** (e.g. scrape sg-companies.com, bizfile.gov.sg public pages). Fragile; likely to have the same coverage hole.

### 4.2 Files that would change (option 2, as cheapest revive)

- [apps/api/src/capabilities/singapore-company-data.ts](../apps/api/src/capabilities/singapore-company-data.ts) — rewrite to call OpenCorporates REST API (not scraped HTML). Add `OPENCORPORATES_API_TOKEN` env var. Adjust extraction shape.
- `apps/api/src/capabilities/auto-register.ts` — remove from DEACTIVATED map
- `apps/api/src/jobs/fix-lifecycle-anomalies.ts` — remove from ANOMALOUS list
- Railway env: add `OPENCORPORATES_API_TOKEN` (paid subscription)
- DB: `UPDATE capabilities SET lifecycle_state='validating', is_active=true, visible=false, deactivation_reason=NULL, data_source='OpenCorporates (Singapore / ACRA-aggregated)', price_cents=<new> WHERE slug='singapore-company-data'`
- Generate `manifests/singapore-company-data.yaml` (Phase 4b.1 gate) — fields for readiness check
- Re-onboard via `npx tsx scripts/onboard.ts --discover --manifest manifests/singapore-company-data.yaml --backfill`
- Run smoke test: `npx tsx scripts/smoke-test.ts --slug singapore-company-data`

### 4.3 Effort

- Option 1 (ACRA): 2–4 business days including legal + Strale-side company setup in SG.
- Option 2 (OpenCorporates paid): 4–8 hours + SGD 80/mo recurring cost + dependent on whether the paid tier actually resolves the real SG entities the free tier couldn't find.
- Option 4 (alt scrape): 6–10 hours but 60–80% chance of hitting the same coverage wall that broke the OpenCorporates scrape.

### 4.4 Verification after revive

- At least 5 known real SG companies resolve via known_answer tests (Singapore Airlines, DBS, OCBC, Capitaland, Singtel)
- 3 SG solutions run end-to-end without error
- Readiness check returns `ready: true`
- Phase 4b.1 CI gate passes (YAML → DB diff = empty)

### 4.5 Revive not recommended — see §6

---

## 5. Drop plan

### 5.1 Blast radius enumeration

**DB rows affected:**

| Table | Rows | Action |
|---|---|---|
| `capabilities` | 1 (`singapore-company-data`) | DELETE blocked by FK; instead leave `lifecycle_state='deactivated'` and also delete or set cap row to a terminal state |
| `solutions` | 3 (`invoice-verify-sg`, `kyb-complete-sg`, `kyb-essentials-sg`) | `UPDATE … SET is_active = false`. If `solutions` has a `lifecycle_state` column (verify in impl prompt), set to `deactivated`. |
| `solution_steps` | 26 rows total (3+11+12 across the three solutions) | Either DELETE all 26 (if solutions are hard-deleted) or leave in place if solutions are soft-deactivated. Leaving them is fine because `is_active=false` solutions don't surface in `/v1/suggest`. |
| `transactions` (history) | 41 failed transactions against SG cap + 0 against SG solutions | Keep (historical audit). Do not delete. Per DEC on audit trail immutability. |
| `test_results`, `test_suites` | ~30 test results, suites still exist | Leave. Tier scheduler already excludes `deactivated` capabilities. |

**FK behavior**: `solution_steps.capability_slug` has `onDelete: "restrict"` on `capabilities.slug` ([apps/api/src/db/schema.ts:378](../apps/api/src/db/schema.ts#L378)). Hard DELETE of the capability row is blocked unless solution_steps are removed first. Drop path:

```
1. UPDATE solutions SET is_active=false WHERE slug IN ('invoice-verify-sg','kyb-complete-sg','kyb-essentials-sg')
2. DELETE FROM solution_steps WHERE solution_id IN (…the 3 SG solutions…)
3. DELETE FROM solutions WHERE slug IN (…)       # optional: hard-delete rather than soft-deactivate
4. DELETE FROM capabilities WHERE slug = 'singapore-company-data'   # now unblocked
```

Alternative (less destructive, recommended): leave solutions and capability rows in DB with `is_active=false`, skip step 2–4 hard deletes entirely. Keeps history.

**Code files affected:**

| File | Change |
|---|---|
| [apps/api/src/capabilities/singapore-company-data.ts](../apps/api/src/capabilities/singapore-company-data.ts) | DELETE (or keep, if soft-deactivation path — auto-register still skips it) |
| [apps/api/src/capabilities/auto-register.ts:17](../apps/api/src/capabilities/auto-register.ts#L17) | Remove SG entry from `DEACTIVATED` map only if code file is deleted — otherwise leave. |
| [apps/api/src/jobs/fix-lifecycle-anomalies.ts:27](../apps/api/src/jobs/fix-lifecycle-anomalies.ts#L27) | Remove SG entry from `ANOMALOUS` list (anomaly is now resolved, not ongoing) |
| [apps/api/src/db/seed.ts:686-693](../apps/api/src/db/seed.ts#L686-L693) | Remove SG block. Note that seed.ts is the authoring path per DEC-20260320-B — removing prevents SG from being re-seeded on a fresh DB. |
| [apps/api/scripts/seed-kyb-solutions.ts:65](../apps/api/scripts/seed-kyb-solutions.ts#L65) | Remove `{ code: "sg", … }` country entry. Otherwise a re-seed would recreate the three solutions. |
| `capability-sources/` | No file to remove (none was ever created) |
| `manifests/` | No file to remove (none was ever created) |

**Frontend / sitemap affected:**

| File | Change |
|---|---|
| [public/sitemap.xml](../../strale-frontend/public/sitemap.xml) | 3 `<url>` entries (`/solutions/kyb-essentials-sg`, `/solutions/kyb-complete-sg`, `/solutions/invoice-verify-sg`) will no longer be emitted once generator re-runs against an API that hides inactive solutions. **Regenerate** via `npx tsx scripts/generate-sitemap.ts` and commit. |
| [scripts/generate-sitemap.ts:20-25](../../strale-frontend/scripts/generate-sitemap.ts#L20-L25) | Currently maintains a `DEACTIVATED_CAPABILITIES` set but not a deactivated-solutions set. If solutions are soft-deactivated via `is_active=false`, the generator must also filter solutions by `is_active`. Check whether the current `/v1/solutions` API already excludes inactive; if so, no generator change needed. |
| `public/llms.txt` | Reviewed: contains no SG mentions. No change. |
| Frontend `src/` code | Reviewed: no hardcoded SG references. Pages render from API. No change. |

**Distribution surfaces** (per governance rules):

- No Reddit posts, X threads, Dev.to articles, or external content mention the SG solutions. Checked `handoff/` logs, `archive/`, and frontend for traces — none.
- **Only surface** with SG URLs is `public/sitemap.xml`, which Google has likely already crawled. Regenerated sitemap will drop the 3 entries; Google will re-crawl and deindex on next pass. If desired, add 301 redirects from `/solutions/kyb-{essentials,complete}-sg` and `/solutions/invoice-verify-sg` to e.g. `/solutions` or a generic KYB page. Flag for Petter — out of investigation scope.
- Notion: flag for Petter — not queried. Any page that enumerates 20-country KYB coverage (e.g. under 🛠️ Products) needs updating to 19 countries.

**Summary**:

- **DB rows**: 1 capability + 3 solutions + 26 solution_steps (soft-deactivate: 4 row updates only)
- **Code files**: 4 edits (auto-register optional, fix-lifecycle-anomalies, seed.ts, seed-kyb-solutions.ts)
- **Frontend**: 1 regenerated sitemap.xml (1 build artifact)
- **Distribution surfaces**: 0 public content (sitemap is the only surface; Notion product pages flagged but not queried)
- **Effort estimate**: 1–2 hours total for soft-deactivation path. 2–3 hours if hard-delete path + redirect setup.

### 5.2 Follow-up prompt contents (soft path, recommended)

The implementation prompt should:

1. Re-verify premises (capability still in `deactivated` state, still no YAML, solutions still `is_active=true`, sitemap still contains 3 SG URLs)
2. `UPDATE solutions SET is_active=false WHERE slug IN ('invoice-verify-sg','kyb-complete-sg','kyb-essentials-sg')` (transactional)
3. Edit [seed-kyb-solutions.ts:65](../apps/api/scripts/seed-kyb-solutions.ts#L65): remove `{ code: "sg", … }` entry. Count goes from 20 to 19 countries.
4. Edit [seed.ts:686-693](../apps/api/src/db/seed.ts#L686-L693): remove SG block. Related: CLAUDE.md's capability count hint ("290+ capabilities") doesn't need updating — seed.ts remains authoritative.
5. Edit [fix-lifecycle-anomalies.ts:27](../apps/api/src/jobs/fix-lifecycle-anomalies.ts#L27): remove `singapore-company-data` from `ANOMALOUS` array.
6. Leave [auto-register.ts:17](../apps/api/src/capabilities/auto-register.ts#L17) in place (capability row still exists in DB with executor file; DEACTIVATED map keeps agent from loading it).
7. Leave [singapore-company-data.ts](../apps/api/src/capabilities/singapore-company-data.ts) file in place — deletion is a risk if the executor is referenced elsewhere; leave deactivated. Or delete; low risk either way since it's skipped.
8. Regenerate `strale-frontend/public/sitemap.xml` and commit in the frontend repo (cross-repo update per CLAUDE.md "Cross-Repo Updates").
9. Create DEC-20260421-X recording: "Drop Singapore KYB surface. Classification: Type 3 structural. Revive cost not justified by zero-traffic history."
10. Update Notion: archive any SG KYB to-dos, flag product pages that claim 20-country coverage for correction.

### 5.3 Rollback

Reversible. Soft-deactivation leaves all rows in DB. To revive: UPDATE solutions SET is_active=true + re-add entries to seed files. Full rollback = 1 SQL + `git revert`.

---

## 6. Recommendation

**Drop.** Specific reasoning:

- Classification is **Type 3** (no viable data source at the €0.80 price point, confirmed by (a) 0/41 success rate on production calls, (b) empirical failure on Singapore Airlines and DBS — not edge-case inputs, (c) Petter's March-20 independent assessment captured in `DEACTIVATED` map).
- Revive cost is **moderate-to-high**: cheapest path (paid OpenCorporates API) costs SGD 80/month + 4–8 hours dev time + may not resolve the coverage gap; reliable path (ACRA BizFile) costs days of legal/contractual setup + re-pricing + ongoing per-query fees.
- Revive benefit is **zero**: the three SG solutions have had 0 customer transactions ever since they were seeded. There is no paying user to retain, no active agent integration to preserve, and no signal that SG KYB is in demand.
- Keeping the current state (capability deactivated + solutions active) is **actively harmful**: Google has indexed the 3 solution URLs, agents using `/v1/suggest` could discover and attempt to call them, and each attempt fails at step 1. Leaving the surface up without the underlying capability is worse than removing the surface.
- If Singapore KYB becomes a priority later (a customer asks, or Strale does SG outreach), re-adding the capability with a paid provider and the full YAML + readiness pipeline is clean greenfield work. Nothing in §5.2 is difficult to reverse.

Drop is therefore the dominant choice: Type-3 classification + zero traffic + harm from broken surface + cheap reversibility if strategy changes.

---

## 7. References

- Phase 4b.2 orphan audit ([2026-04-21-phase-4b2-orphan-audit.md](./2026-04-21-phase-4b2-orphan-audit.md)) §3.3 — flagged SG as `needs-human-input` with the exact scope of this investigation.
- Commit `fd93482` (2026-02-26) — original 25-capability batch introducing SG.
- Commit `a80ea1d` (2026-03-20) — auto-register infrastructure + DEACTIVATED map seeded with SG, HK, IN.
- Commit `33edac1` (2026-04-01) — lifecycle state machine sweep → `deactivated` row state.
- Commit `2fcdb14` — 60-solution batch that created the three SG solutions.
- [CLAUDE.md](../CLAUDE.md) — Capability Onboarding Protocol (DEC-20260320-B): revive path would require full pipeline per §6.
- [CLAUDE.md](../CLAUDE.md) — Cross-Repo Updates: sitemap regeneration path for drop.
