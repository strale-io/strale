# Workflow Integrity Checks — Detailed Report (2026-03-21)

---

## Check 1: Orphan check (Linear → Feature Registry)
**Result:** SKIPPED — Linear not queryable
**Reason:** No Linear project/team configuration found. The protocol references Linear but the project's issue tracking appears to be handled through Notion and handoff files. Cannot verify Linear↔Feature Registry linkage.
**Recommendation:** Clarify whether Linear is actively used. If yes, configure access. If not, update PROTOCOL.md to remove Linear references.

---

## Check 2: Orphan check (Feature Registry → Linear)
**Result:** SKIPPED — Linear not queryable
**Reason:** Same as Check 1.
**Recommendation:** Same as Check 1.

---

## Check 3: Orphan check (Decisions → Feature Registry)
**Result:** FAIL
**Severity:** High
**Evidence:** Every decision fetched in detail (DEC-20260320-A, DEC-20260320-B, DEC-20260320-D, DEC-20260320-F, DEC-20260320-H, DEC-20260320-I, DEC-20260320-K, DEC-20260321-A) had **no Related Feature relation** populated. This appears to be systemic — no recent decisions are linked to Feature Registry entries.
**Recommendation:** Backfill Related Feature relations on all active decisions. Consider adding this as a required step in the decision creation workflow.

---

## Check 4: Decision review check
**Result:** FAIL
**Severity:** High
**Evidence:** Every decision fetched has `Reviewed: NO`. Decisions older than 7 days with unreviewed status include:
- DEC-20260302-A (Capability Pricing Framework) — 19 days unreviewed
- DEC-20260302-B (Capability QA Framework) — 19 days unreviewed
- DEC-20260303-D, E, G (Search/suggest decisions) — 18 days unreviewed
- DEC-20260305-A through G (Trust display, test infra, security) — 16 days unreviewed
- DEC-20260306-A through F (Test run audit, metrics, capability detail) — 15 days unreviewed
- DEC-20260307 (SQS Constitution) — 14 days unreviewed
- DEC-20260308 (Platform pricing EUR) — 13 days unreviewed
- DEC-20260309 (Legal disclaimer, Risk framework) — 12 days unreviewed
- DEC-20260311 (MCP capability graph, Agent Skills repo) — 10 days unreviewed
- All subsequent decisions through DEC-20260321-A

Total: **49+ decisions, all unreviewed.** Zero decisions have ever been marked as reviewed.
**Recommendation:** Batch-review all active decisions. Prioritize global-scope decisions first. Consider a weekly review ritual.

---

## Check 5: Journal reference check
**Result:** PARTIAL — cannot verify in full
**Severity:** N/A
**Evidence:** Journal entries were retrieved by title only. Full content (including Decision ID references) was not fetched for all 25+ recent entries. Spot-checking would require reading each entry individually.
**Recommendation:** Run a targeted check on journal entries that mention decisions in their titles (e.g., "SQS Constitution" should reference DEC-20260307).

---

## Check 6: Journal immutability check
**Result:** PARTIAL — cannot verify in full
**Severity:** N/A
**Evidence:** Notion API does not expose `Last Edited` vs `Created` timestamp comparison through search results in a way that allows bulk checking. Individual page fetches would be needed for all 25+ entries.
**Recommendation:** Spot-check the 5 most recent journal entries in a follow-up session.

---

## Check 7: CLAUDE.md sync check
**Result:** FAIL
**Severity:** High
**Evidence:** CLAUDE.md's "Active Decisions" section stops at DEC-20260307. Notion contains **at least 20+ additional active decisions** from March 8–21 that are NOT reflected in CLAUDE.md:

**Missing from CLAUDE.md (confirmed via Notion):**
- DEC-20260308: Platform pricing currency EUR
- DEC-20260309: Platform-wide legal disclaimer required
- DEC-20260309: Mandatory Capability Onboarding Risk Framework
- DEC-20260311: MCP decision-ready capability graph
- DEC-20260311: Agent Skills repo + semantic anchor enforcement
- DEC-20260314-B: Blog on Dev.to first
- DEC-20260315-A: Sprint 9F elevated to immediate priority
- DEC-20260315-B: Code pattern publishing starts Week 1
- DEC-20260315-C: CL1 publishes after Sprint 9F
- DEC-20260315-I: Upstream failures not billed
- DEC-20260317: Weekly digest + interrupt email model
- DEC-20260317: Tier 2 suspension warning window 24h
- DEC-20260317: Publication SQS threshold >=60
- DEC-20260318: ALL new capabilities must use manifest-driven pipeline
- DEC-20260318: Onboarding pipeline upgraded with --discover, --fix
- DEC-20260320-A: Capability onboarding hardening
- DEC-20260320-B: Capability Onboarding Enforcement Rule
- DEC-20260320-D: Zefix PublicREST API access granted
- DEC-20260320-E: OpenSanctions commercial pricing confirmed
- DEC-20260320-F: Raise compliance screening prices to 0.25/call
- DEC-20260320-H: Search unification: MCP + REST same engine
- DEC-20260320-I: Default sort by quality
- DEC-20260320-K: Free-tier showcase protection
- DEC-20260320: Hotfix: auto-register must filter .d.ts files
- DEC-20260320: pep-check uses transparency tag mixed
- DEC-20260320: au-company-data capability onboarded via ABR API
- DEC-20260320: KYB + Invoice Verify implementation complete
- DEC-20260321-A: Solution batch endpoint: use ORDER BY schedule_tier DESC

**Note:** Some of these (DEC-20260318 manifest pipeline, DEC-20260320-B onboarding enforcement) ARE referenced in CLAUDE.md's "Adding New Capabilities" and "Capability Onboarding Protocol" sections but are NOT listed in the Active Decisions section where they belong.

**Recommendation:** Full sync of Active Decisions section. Add all decisions from March 8 onward. Consider categorizing by date range or topic to manage the growing list.

---

## Check 8: Handoff staleness check
**Result:** FAIL
**Severity:** Medium
**Evidence:** 4 handoff files are older than 14 days:
- `2026-02-27-framework-plugins.md` — 22 days old (Feb 27)
- `2026-02-27-admin-stats-webhooks.md` — 22 days old (Feb 27)
- `2026-02-27-mcp-http-a2a.md` — 22 days old (Feb 27)
- `2026-03-03-trust-pipeline-merge.md` — 18 days old (Mar 3)

All four predate the heavy development burst that started March 13.
**Recommendation:** Review these 4 files. If their content has been absorbed into Roadmap or completed, archive them to `handoff/_archive/`. If still pending, carry forward into current work.

---

## Check 9: Glossary staleness check
**Result:** FAIL
**Severity:** Medium
**Evidence:** Glossary database search returned **zero results**. The database exists (collection ID: `4d021a66-c323-4782-924f-c5faf3ca7fb5`) but appears to have no entries. No terms are in `proposed` status because no terms exist at all.
**Recommendation:** Populate the Glossary with key terms from the project (SQS, ACI, capability, solution, trust profile, free tier, dark launch, etc.). Many of these terms have specific meanings in Strale that differ from common usage.

---

## Check 10: Glossary coverage check
**Result:** FAIL
**Severity:** Low
**Evidence:** With an empty Glossary, coverage is 0%. Key terms from recent Journal entries and Decisions (last 7 days) that should have Glossary entries include:
- SQS (Strale Quality Score)
- ACI (Autonomous Capability Intelligence)
- Dual-profile model
- Trust profile / trust badge
- Capability onboarding pipeline
- Dark launch / qualification
- Circuit breaker (SQS context)
- Fixture test / canary test
- Free tier
- Solution (bundled capability set)
- KYB (Know Your Business)

**Recommendation:** Treat this as a review list for initial Glossary population, not an error list.

---

## Check 11: Current State Summary staleness check
**Result:** PASS (with warning)
**Severity:** N/A (passes 30-day threshold)
**Evidence:** Last regenerated: 2026-03-16 (5 days ago). Within the 30-day threshold.
**Warning:** The page is self-marked as stale and significantly behind reality:
- Shows 229 capabilities vs actual 256 (+27)
- Shows 15 solutions vs actual 81 (+66)
- Does not reflect ACI deployment, KYB/Invoice Verify, compliance infrastructure, x402 gateway, or freshness decay scoring (all shipped March 19-21)

**Recommendation:** Regenerate soon. The data gap is widening rapidly with the current development pace.

---

## Check 12: Feature Registry status derivation
**Result:** SKIPPED — Linear not queryable
**Reason:** Status derivation requires comparing Feature Registry entries against their Linear issues. Linear is not accessible.
**Recommendation:** Same as Checks 1-2.

---

## Check 13: Standing delegation expiry check
**Result:** PASS
**Evidence:** No standing delegations found. No decisions with `scope: temporary` or expiry dates exist in the Decisions database. Nothing to expire.

---

## Check 14: Split-brain detection
**Result:** SKIPPED — Linear not queryable
**Reason:** Split-brain detection requires checking Feature Registry manual overrides (paused/cancelled) against Linear issues. The Feature Registry has 5 pre-pivot entries marked cancelled (2026-03-04), but without Linear access, cannot verify for contradictions.
**Recommendation:** Verify manually that cancelled features (operator-profiles, outcome-request-flow, bid-and-matching, delivery-workspace, escrow-payments) have no open Linear issues.

---

## Check 15: Backfill duplicate check
**Result:** PARTIAL
**Severity:** Low (potential)
**Evidence:** Several decisions from the same date (2026-03-20) cover related onboarding topics:
- DEC-20260320-A: "Capability onboarding hardening"
- DEC-20260320-B: "Capability Onboarding Enforcement Rule"

These have different first-50-character prefixes, so they pass the mechanical duplicate check. However, there is thematic overlap that may warrant consolidation.

Similarly on 2026-03-03, multiple homepage/suggest decisions (D, E, G + 6 others) were logged — all distinct but tightly related.
**Recommendation:** Review 2026-03-20 onboarding decisions for possible consolidation. Low priority.

---

## Summary Table

| # | Check | Result | Severity |
|---|---|---|---|
| 1 | Orphan: Linear → Feature Registry | SKIPPED | — |
| 2 | Orphan: Feature Registry → Linear | SKIPPED | — |
| 3 | Orphan: Decisions → Feature Registry | **FAIL** | High |
| 4 | Decision review check | **FAIL** | High |
| 5 | Journal reference check | PARTIAL | — |
| 6 | Journal immutability check | PARTIAL | — |
| 7 | CLAUDE.md sync check | **FAIL** | High |
| 8 | Handoff staleness check | **FAIL** | Medium |
| 9 | Glossary staleness check | **FAIL** | Medium |
| 10 | Glossary coverage check | **FAIL** | Low |
| 11 | Current State Summary staleness | **PASS** (warning) | — |
| 12 | Feature Registry status derivation | SKIPPED | — |
| 13 | Standing delegation expiry | **PASS** | — |
| 14 | Split-brain detection | SKIPPED | — |
| 15 | Backfill duplicate check | PARTIAL | Low |
