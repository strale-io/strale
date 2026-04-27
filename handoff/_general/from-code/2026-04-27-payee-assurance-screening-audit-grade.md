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

## What still needs to happen

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

Two commits: `c1100f8` (sanctions + pep) already pushed; this commit adds adverse-media + handoff.
