# Workflow Integrity Check — 2026-03-21

## ❌ Critical (stop feature work — same session)
None

## ❌ High (action required — within 24 hours)
1. **Decisions → Feature Registry orphan (Check 3):** All recent decisions (DEC-20260320-A through DEC-20260321-A) have no Related Feature relation. This is systemic — no decisions are linked to Feature Registry entries.
2. **Decision review backlog (Check 4):** 49+ decisions have `Reviewed: NO`. All decisions since project inception are unreviewed. Oldest unreviewed: DEC-20260302-A (19 days).
3. **CLAUDE.md sync gap (Check 7):** Active Decisions section stops at DEC-20260307. At least 28 decisions from March 8–21 are missing. This causes Claude Code sessions to operate without awareness of recent decisions.

## ⚠️ Medium (review recommended — within 7 days)
1. **Handoff staleness (Check 8):** 4 handoff files older than 14 days (3 from Feb 27, 1 from Mar 3). Review for archival.
2. **Glossary empty (Check 9):** Glossary database has zero entries. Key project-specific terms (SQS, ACI, capability, solution, trust profile, dark launch, etc.) are undocumented.
3. **Current State Summary divergence (Check 11):** Technically passes 30-day threshold (last regenerated Mar 16, 5 days ago), but self-marked stale and shows 229/15 capabilities/solutions vs actual 256/81. Widening rapidly.

## ⚠️ Low (next maintenance cycle)
1. **Glossary coverage (Check 10):** 11+ key terms from recent work have no Glossary entries. Review list provided in integrity-checks-detail.md.
2. **Potential decision consolidation (Check 15):** DEC-20260320-A and DEC-20260320-B cover overlapping onboarding topics. May warrant consolidation.
3. **Handoff naming convention:** 3 recent files lack YYYY-MM-DD prefix (perf-audit-trust-badges, perf-suggest-catalog-batch-sqs, perf-suggest-catalog-trust-cache).

## ✅ Passed
- **Check 11 — Current State Summary staleness:** Within 30-day threshold (5 days old). Warning noted above.
- **Check 13 — Standing delegation expiry:** No standing delegations exist. Nothing expired.
- **Mandatory tier — Session intent declaration:** All recent sessions declare intent.
- **Mandatory tier — Handoff file creation:** 28 handoff files, 14 from last 5 days. Consistent.
- **Mandatory tier — Journal entries:** 25+ entries in last 7 days. Active logging.

## SKIPPED (tool unavailable)
- **Check 1 — Orphan: Linear → Feature Registry:** Linear not queryable
- **Check 2 — Orphan: Feature Registry → Linear:** Linear not queryable
- **Check 5 — Journal reference check:** Partial — requires individual entry content review
- **Check 6 — Journal immutability check:** Partial — requires Created vs Last Edited comparison
- **Check 12 — Feature Registry status derivation:** Linear not queryable
- **Check 14 — Split-brain detection:** Linear not queryable

## Requires Judgment (Petter review)
1. **5 deferred items** (all 18-19 days old) — reactivate, keep deferred, or cancel? Some may be resolved by recent work (freshness decay, perf audit, Browserless investigation).
2. **2 Phase 2 deferred specs** — link to Deferred DB or consider covered by KYB/Invoice Verify?
3. **Linear integration status** — is Linear actively used? 4 checks skipped due to inaccessibility.
4. **Decision review backlog strategy** — batch review all 49+, or only post-pivot?
5. **CLAUDE.md sync strategy** — add all 28+ missing decisions, or restructure/prune first?
6. **3 unprefixed handoff files** — rename for naming convention consistency?

## Accumulation Rule
Critical: 0, High: 3, Total: 3 — **Not triggered** (threshold: 5)

## Auto-fixes applied
None — this was a read-only audit.
