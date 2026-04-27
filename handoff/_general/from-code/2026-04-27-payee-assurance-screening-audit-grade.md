**Intent:** Bring sanctions-check + pep-check + adverse-media-check up to the audit-grade evidence shape Payee Assurance v1 needs. All three were previously fine for screening *coverage* but missing the metadata a compliance reviewer would demand: documented score/severity thresholds, per-source version timestamps, structured match classification, and accurate reflection of what was actually queried (vs. what matched).

## What shipped

**Three capabilities hardened to a consistent audit shape:**

| Cap | Before | After |
|---|---|---|
| sanctions-check | `lists_checked` lied on no-match calls; no version/freshness; no threshold doc; no DOB; no sectoral/SDN distinction; manifest `transparency_tag: ai_generated` (wrong) | `lists_queried` object (collection, list_count=347, version, last_updated_at), `score_threshold` (default 0.7, tunable), structured `classification` per match (primary_sanction / sectoral_sanction / linked_to_sanctioned / debarment / financial_crime / other_risk), `birth_date` input, per-match `last_updated_at`, transparency_tag → `algorithmic` |
| pep-check | Manifest asserted on `pep_matches` and `checked_sources` — fields the executor never returned (tests were either failing or trivially passing); no version metadata; no threshold | Same `lists_queried` shape, `score_threshold`, classification (pep / political_role / relative_or_associate / other_political), per-match `last_updated_at`, manifest realigned with actual executor output |
| adverse-media-check | Manifest asserted on `risk_detected`, `findings`, `searches_performed`, `disclaimer` — none of which the executor returned (catastrophic drift); transparency_tag `ai_generated` (wrong — no LLM is used) | `lists_queried` (Dilisense/adverse-media or google-serper), `risk_level_thresholds` documenting the none/low/medium/high rule, `severe_categories` array, transparency_tag → `algorithmic`, manifest fully realigned |

**Shared lib:** [apps/api/src/capabilities/lib/opensanctions-catalog.ts](../../../apps/api/src/capabilities/lib/opensanctions-catalog.ts) — 1h cache of the OpenSanctions `default` collection metadata; used by both sanctions-check and pep-check.

**Production DB synced.** Ran `sync-manifest-text-to-db.ts` for all three caps against Railway (`metro.proxy.rlwy.net`). The new input_schema and output_schema are now live in the capabilities table — MCP, x402, /v1/capabilities, and SDK auto-generation all see the new shape (subject to a 5–10min cache TTL).

**Notion canonical scope page updated.** [Payee Assurance](https://www.notion.so/34867c87082c814999e5c668d7383fa7) — the "Sanctions" sub-section under "What a call returns" now reflects the new evidence shape (lists_queried, score_threshold, classification taxonomy). Date stamp bumped to 2026-04-27.

## What this unblocks

A compliance reviewer auditing a Payee Assurance call can now see, per screen:
- Which dataset was queried, how many lists it contains, the publisher's version, and when the publisher last refreshed it.
- The documented threshold rule that decided what counts as a match (sanctions/PEP) or as severe coverage (adverse media).
- Per match: structured classification distinguishing a primary OFAC SDN block from a sectoral SSI restriction from a 50%-rule linkage from a procurement debarment.
- Per match: when that specific record was last updated by the publisher.

This is the evidence shape that survives a compliance review — and the gap that was blocking Payee Assurance v1 from being defensibly shippable.

## Empirical coverage test (added late-session)

Ran a live coverage battery to convert "asserted but unverified" coverage claims into measured per-country/per-language data. Full report: [`docs/research/2026-04-27-screening-coverage-empirical.md`](../../../docs/research/2026-04-27-screening-coverage-empirical.md). Test runner: [`apps/api/scripts/empirical-screening-coverage.ts`](../../../apps/api/scripts/empirical-screening-coverage.ts) (read keys from `STRALE_TEST_API_KEY` + `DILISENSE_API_KEY` env vars; idempotent for monthly re-runs). Cost: €6.90 wallet + ~50 Dilisense calls.

**Headline:**
- **PEP 65/65 = 100% hit rate** across EU27 + UK + NO + CH + US heads of state and central bank governors. v1 + v1.1 ready.
- **Sanctions/PEP fall through to Dilisense on every call** because `OPENSANCTIONS_API_KEY` is not configured on Railway. The audit-grade `lists_queried` shape we shipped this morning returns `version: null, last_updated_at: null` on every production call as a result. **v1 blocker, easy fix** — set the env var.
- **Adverse media native-language surfacing: 1/24** in top-10 articles. Even subjects with thousands of total_hits return English in the surfaced articles. The "EN/FR/DE only" marketing claim is the actual API behavior. **Product decision required** before v1: accept-and-disclose / supplement with second source / scope-cut.
- **Three zero-hit cases** (IT/Banca Popolare di Vicenza, GR/Folli Follie, EE/Danske Bank Estonia) likely entity-naming issues — try BPVi, Folli Follie SA, Danske Bank w/o suffix.
- **Dilisense Starter quota exhausted mid-test** at ~50 calls. 8 adverse-media countries (FR, CZ, HU, RO, BG, SK, SI, HR) untested. Confirms Mirko's Basic-tier nudge is operationally urgent, not just legal.

## v1 readiness verdict (post-empirical)

| Capability | v1 (EU27+UK+NO+CH) | v1.1 (+US) |
|---|---|---|
| sanctions-check | ✅ ready (after OS key set) | ✅ ready (after OS key set) |
| pep-check | ✅ ready (100% hit rate today) | ✅ ready |
| adverse-media-check | ⚠️ functional but native-language gap requires product decision | ✅ ready (English-language press well-covered) |

## Pre-v1 must-do (2 items remaining — was 4 at session start)

1. ~~Set `OPENSANCTIONS_API_KEY` on Railway~~ — **CLOSED.** OS dropped from v1 entirely (commit `16ca790`).
2. **Upgrade Dilisense to Basic** — Q1 quota for v1 traffic + DPA + Service Agreement.
3. ~~Make the adverse-media language-coverage decision~~ — **CLOSED.** Accept-and-disclose chosen, logged as DEC-20260427-A.
4. **Investigate the 3 zero-hits** — entity-naming variants for IT/BPVi, GR/Folli Follie, EE/Danske Bank Estonia. ~30 min of code/test work.

## What still needs to happen (pre-existing items, post-launch)

1. **Watch the next test-runner cycle.** All three caps have updated `known_answer` fixtures asserting on real fields. Tier B (24h) cadence — confirm SQS recovery for adverse-media-check (its previous fixtures asserted on fields that didn't exist; SQS may have been artificially low or high).

2. **CLAUDE.md fact drift.** CLAUDE.md still describes adverse-media-check as "Google search + Claude Haiku risk assessment" using `ANTHROPIC_API_KEY`. The current executor uses Dilisense primary + Serper fallback with deterministic keyword classification — no Claude/Anthropic. Worth a one-line correction next time CLAUDE.md is touched. (Did not edit in this session — out of scope.)

3. **Reseller upgrade dependency.** Mirko at Dilisense flagged 2026-04-27 that Strale's embedded-bundle use is reselling and Basic+ tier is required for the Service Agreement and DPA. Starter is a courtesy. Pre-launch task: upgrade to Basic, sign SA, get DPA. See `project_dilisense_reseller_status.md` in memory.

4. **Per-country PEP and per-language adverse-media coverage.** Public Dilisense docs do not break out which national PEP sources or which adverse-media languages are covered for EU27+UK+NO+CH. Open question to Dilisense in the same email thread as the reseller-tier upgrade. Until answered, adverse-media-check coverage for non-DE/FR/EN counterparties is documented in the manifest as a known limitation.

5. **Backfill for ongoing-monitoring product.** Per the Dilisense product-catalogue analysis earlier in the session: their `registerIndividual` / webhook product is the next-tier addition after v1 ships (event-driven re-screen, parallels Tipalti / AvidXchange / Plaid Monitor). Not v1, but should be on the post-launch roadmap.

## Files touched

- `apps/api/src/capabilities/sanctions-check.ts`
- `apps/api/src/capabilities/pep-check.ts`
- `apps/api/src/capabilities/adverse-media-check.ts`
- `apps/api/src/capabilities/lib/opensanctions-catalog.ts` (NEW)
- `apps/api/src/db/seed.ts` (sanctions/pep/adverse entries)
- `manifests/sanctions-check.yaml`
- `manifests/pep-check.yaml`
- `manifests/adverse-media-check.yaml`
- `docs/x402-listing.md` (example output)

Five commits this session, all pushed:
- `c1100f8` — sanctions-check + pep-check audit-grade hardening (initial OS+Dilisense dual path)
- `f00c088` — adverse-media-check audit-grade hardening + Notion canonical update + handoff
- `b7ccd6a` — empirical coverage test runner + report
- `834ac7d` — extended handoff with empirical findings
- `16ca790` — **OpenSanctions dropped, single-vendor on Dilisense for v1**

## OpenSanctions decision (late-session pivot)

After the empirical test confirmed (a) `OPENSANCTIONS_API_KEY` was never set on Railway and (b) the OS trial account had expired, the cost/benefit re-opened. Dilisense alone gave 65/65 = 100% PEP hit rate. OpenSanctions commercial pricing (€2,400+/yr Starter, reseller tier higher) didn't pencil against the marginal value over Dilisense for our use case.

**Decision: drop OpenSanctions entirely. Single-vendor on Dilisense for v1.**

Implemented in `16ca790`:
- New `lib/dilisense-sources.ts` exporting named source attribution sourced verbatim from Dilisense's published catalog (134 sanctions sources, 230+ PEP territories). Surfaces in `lists_queried.major_lists` so audit logs name the underlying lists screened.
- `sanctions-check.ts` and `pep-check.ts` simplified to Dilisense-only path.
- `score_threshold` input removed (Dilisense returns binary hits, not scored matches).
- Multi-classification taxonomy reduced to `primary_sanction` only on sanctions side (Dilisense returns flat `SANCTION` source_type; the major underlying lists are still attributed in `major_lists`).
- `lib/opensanctions-catalog.ts` deleted (dead code).
- Manifests + seed.ts realigned. Production DB synced.
- Notion Payee Assurance canonical page updated.

**Audit-shape preserved.** `lists_queried` now carries collection name, source_count, major_lists array, freshness_note attesting to publisher refresh cadence, and source_catalog_url for compliance-officer verification. The only material loss is per-list version timestamps (Dilisense doesn't expose them) — documented in manifest limitations honestly.

**Trade-offs accepted:**
- No per-list version timestamps in audit log (Dilisense limitation).
- No match score per result (binary hits — adequate for is_sanctioned / is_pep decisions).
- No sectoral/SDN distinction at output classification level (still attributable via major_lists).
- Single-source-of-truth — if Dilisense has an outage, the screening capability is unavailable. Mitigation: Basic-tier SLA + Dilisense's published 99.9% uptime claim.
