Intent: Inventory the US bank-verification vendor universe across two architectural tracks (ACH prenote sponsors and name-match AVS providers) so the v1 vendor selection decision can be made on structured evidence rather than ad-hoc search.

# What shipped

- **Pre-research housekeeping.** Relocated the VAT depth-test draft email (`openapi-vat-batch-email.md`, 1078 bytes, May 9) from the strale-research worktree to `C:/Users/pette/Documents/strale-drafts/`. Atomic move, mtime preserved. Advanced strale-research detached HEAD from `d938abd` to `6e82d70` (origin/main tip). Worktree governance preserved.
- **Two research passes on US bank verification vendors**, both READ-ONLY desk research (WebFetch + Notion writes only; no code touched, no commits, no sales-form submissions, no DEC drafted):
  - **Pass 1 — primary research.** 11 vendors evaluated across Track A (6 ACH prenote sponsors: Modern Treasury, Increase, Column, Dwolla, Sila, Plaid Transfer) and Track B (5 Nacha-listed name-match AVS: ValidiFI, Microbilt, TransUnion TruValidate, GIACT/LSEG, EWS/Certos). One Tier A (ValidiFI), one Tier B (Increase), three Reject, six Deferred.
  - **Pass 2 — ValidiFI-adjacent supplement.** 28 candidates enumerated across five search vectors. 16 passed the ≥2-of-5 qualifying gate. Four new Tier B candidates surfaced: Prometeo (strongest, 5/5 criteria, Nacha Preferred Partner with public US Name Match product page launched Dec 2025), Sardine, Truv, Stripe FC Ownership Match (upgrade from prior Tier C). ValidiFI's sole-Tier-A position maintained — no vendor matches all four conditions (Nacha-listed + public pricing + bank-contributed name-on-account + fintech-positioned).
- **26 Vendor Roster entries written** (11 from Pass 1 + 15 from Pass 2). Schema mapped: Categories → "IBAN / name match" (no US-specific category exists), Status → Pending eval / Deferred / Rejected per tier. Track A/B distinction encoded in the Reason/rationale prefix since the schema doesn't carry it natively.
- **Two Journal entries written** (both type=brainstorm):
  - Pass 1: https://www.notion.so/35d67c87082c81f09363c63d48195e7b
  - Pass 2: https://www.notion.so/35d67c87082c816ebf0efa4c5757f665

# Recommended v1 architecture: hybrid-pending-outreach

Outreach order:
1. **ValidiFI first** — highest expected match quality.
2. **Prometeo second** — only other Nacha-listed AVS with public US Name Match product; recent launch = favorable timing.
3. **Stripe FC Ownership Match third** — lowest paper friction given existing Strale-Stripe relationship; aggregator-class data source is the caveat.
4. **Sardine and Truv fourth** — only if first three fail or surface unacceptable terms.
5. **Track A (Increase)** — gated on in-browser TOS body fetch to confirm redistribution language. All three Track A vendors whose ToS WebFetch could fully read (Modern Treasury, Dwolla, Sila) explicitly prohibit redistribution — pattern strongly suggests Track A is structurally hard.

# What's open

Items 1–5 below need outreach or in-browser fetches the WebFetch tool couldn't complete:

1. **Increase TOS body** — in-browser fetch of `https://increase.com/terms` to extract redistribution clause language. Critical Track A gate.
2. **ValidiFI direct outreach** — pricing model, MSA redistribution clause, eligibility floor (does ValidiFI have an analog to GIACT's $10MM/1-year gate?), response payload schema. Top priority.
3. **Prometeo direct outreach** — pricing, ToS redistribution body, data-source clarification (is US Name Match bank-contributed or aggregator-mediated?).
4. **Stripe FC Ownership Match** — Strale's existing Stripe account team can likely answer preview-feature terms and pricing without a sales motion.
5. **Microbilt site access workaround** — `microbilt.com` refused WebFetch (ECONNREFUSED). In-browser fetch from non-blocked IP needed for pricing + ToS + API field schema.
6. **Nacha resource center authoritative list** — `nacha.org/content/account-validation-resource-center` returned 403 to WebFetch. In-browser fetch needed to confirm the complete current AVS Preferred Partners list.
7. **No DEC drafted** — DEC drafting remains chat/Petter's call after outreach across ValidiFI + Prometeo + Stripe FC produces commercial-terms answers.

# Non-obvious learnings

- **Redistribution prohibition is the default in Track A.** All three Track A vendors whose ToS was publicly fetchable (Modern Treasury s2.5(a), Dwolla s10, Sila s B.8.3) explicitly prohibit redistribution/sublicense/service-bureau use. The three whose ToS could NOT be fetched (Increase, Column, Plaid) remain unknown. Pre-revenue Strale should expect to negotiate a waiver, not consume a standard ToS — affects how outreach is framed.
- **The ValidiFI-EWS data path.** ValidiFI sources data partly from Early Warning. A ValidiFI contract is the only realistic near-term path to EWS-consortium data — direct EWS engagement is structurally inaccessible at current Strale scale (bank-owned; redistribution restricted to participating banks).
- **GIACT publishes its eligibility floor on the product page.** "$10MM annual revenue excluded; under 1 year operating history excluded; Money Service Bureaus (non-bank) excluded." This is the strongest signal that the bureau-scale Track B vendors (GIACT, EWS, TruValidate) are not addressable at current Strale scale. Other vendors likely have similar floors but don't publish them.
- **Nacha-listed status alone is NOT a fintech-fit signal.** Four of the seven new Nacha-listed finds in Pass 2 (Walrus Security, Trustpair, VendorInfo, Relish) are wrong-customer-profile (enterprise AP/treasury). The fintech-AVS-API population is sparse: ValidiFI, Prometeo, Plaid are the only Nacha-listed names that publicly position to fintech customers.
- **Stripe's existing relationship is a structural advantage worth weighting explicitly.** Stripe FC Ownership Match's preview-feature status is a deprecation risk, but the existing wallet-top-up commercial relationship means paper friction is materially lower than any fresh vendor — could be the lowest-friction path to a working hybrid architecture for v1 MVP.
- **The Plaid /identity/match product face was missed in Pass 1.** Pass 1 evaluated Plaid Transfer; Pass 2 surfaced Plaid Identity Verification with the /identity/match endpoint as a distinct name-match primitive. Per "ONE page per topic" governance, no new roster entry was created — flagged in Journal as a re-evaluation prompt for the existing Plaid Transfer entry when Plaid is next engaged.

# Cost

Zero direct cost. Two WebFetch-heavy subagent runs (Track A research + Track B supplement). No external API calls, no commits, no deploys. Worktree state preserved end-to-end (strale-research clean detached HEAD on origin/main at session end).
