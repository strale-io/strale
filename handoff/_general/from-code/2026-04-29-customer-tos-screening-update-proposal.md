# Proposed Customer ToS update — screening/regulatory clarifications

**Status:** DRAFT for Petter's review. Not edited live in `strale-frontend/src/pages/Terms.tsx`. Customer-facing legal copy should not be unilaterally edited by a CTO/code agent without Petter's eye + (where relevant) counsel review.

**Date:** 2026-04-29

**Scope:** items §6 (Your data and ours), §8 (Warranty and liability) of `Terms.tsx`. Last updated 27 April 2026; bump to 29 April 2026 if Petter accepts.

**Why:** Per DEC-20260429-A close-out, sanctions/PEP/adverse-media screening is wrapped-vendor (Dilisense Tier-2). Strale's contractual recourse against Dilisense is capped at 12 months of fees we pay them (Reseller SA §11). That ceiling propagates to customer recourse against Strale for upstream-data accuracy issues. The existing Terms cap Strale's aggregate liability at greater of (a) 12-month fees paid OR (b) EUR 1,000 (§8) and disclaim warranties broadly (§7, §8) — which IS already structurally adequate. The gap worth closing is making explicit that **screening outputs do not satisfy regulatory determinations and a 'no match' result is not a guarantee of clean status.**

This is a small, narrowly-scoped insertion. It does not weaken any existing clause.

---

## Proposed edit 1 — §6 (Your data and ours), append a paragraph

**After** the existing third paragraph beginning "Data fetched from public registries…" add:

> For capabilities that wrap third-party screening providers (currently: Dilisense for sanctions, PEP, and adverse-media checks; Serper for adverse-media fallback), the upstream provider's own service terms govern our access to their data. Their liability to us is contractually limited; those limitations may constrain our practical recourse, and therefore yours, in the event of upstream data error, omission, or outage. Provenance fields on each response identify the upstream provider so you can apply your own due-diligence judgement.

## Proposed edit 2 — §8 (Warranty and liability), insert a new paragraph between current paragraph 2 and paragraph 3

**Before** the existing "To the maximum extent permitted by law, our aggregate liability arising out of or related to these terms in any 12-month period is limited to…" paragraph, insert:

> **Compliance and screening capabilities specifically.** Capabilities marketed for compliance use — including sanctions screening (`sanctions-check`), politically-exposed-persons screening (`pep-check`), and adverse-media screening (`adverse-media-check`) — return evidence about the matches found in upstream data sources at the moment of the call. They are not regulatory determinations. A "no match" or "is_sanctioned: false" response does not mean the subject is free of sanctions, PEP status, or adverse coverage; it means the upstream provider's index, as configured at that moment, did not surface a match for the query as written. You remain responsible for: (a) querying with appropriate name variants, (b) applying your organisation's risk appetite and additional controls, and (c) any regulatory determination you are required to make. Where applicable law requires human review of an automated decision (e.g. EU AML Directive, UK MLR 2017 Regulation 28A, GDPR Art. 22), that review is your obligation, not ours.

---

## What this does NOT change

- Aggregate liability cap (§8 paragraph 3) — unchanged.
- Indemnification (§9) — unchanged.
- Acceptable-use clauses around AI-assisted outputs (§5) — unchanged; the existing AI-output language already covers `risk-narrative-generate` and similar, and the new screening-specific paragraph above is parallel rather than competing.
- "Last updated" date — bump to 29 April 2026 if Petter accepts.

## How to apply

When ready, paste the two paragraphs into [strale-frontend/src/pages/Terms.tsx](../../../../strale-frontend/src/pages/Terms.tsx):
- Edit 1: into the `Section id="data"` block, after the existing third `<p>`.
- Edit 2: into the `Section id="warranty"` block, between the existing second and third `<p>`.

Bump the `LAST_UPDATED` constant at the top of the file.

If you have outside counsel or a friendly compliance reviewer, this is the kind of change to surface for a pass before publishing. The two paragraphs are defensive in intent (clarifying limits, not shifting risk to the customer) but customer-facing legal copy benefits from a second pair of eyes.

## Related decisions and references

- [DEC-20260429-A](https://app.notion.com/p/35167c87082c8172bff8f3485699c961) — sanctions/PEP self-host deferred; Dilisense remains as Tier-2 vendor.
- [DEC-20260428-A](https://app.notion.com/p/35067c87082c810db6a4edf9f14b4446) — third-party scraping doctrine; Tier-2 vendor framework.
- [Mirko Reseller SA reference](2026-04-29-dilisense-reseller-correspondence.md) — §11 liability terms (12-month fees cap on Dilisense's side).
