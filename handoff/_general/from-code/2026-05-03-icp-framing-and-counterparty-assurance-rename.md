Intent: Lock down who Strale's ICP is, evaluate whether "Payee Assurance" is the right product name at €3.50/call, narrow v1 scope to the onboarding-shape product, and propagate the resulting decisions across Notion + internal code/memory surfaces.

## Outcome

**Strategic decisions agreed and logged**

- **Product renamed: Payee Assurance → Counterparty Assurance.** "Payee" framing skewed toward AP automation and excluded partner onboarding, due-diligence research, and B2B marketplace counterparty admission — three of the six segments named in DEC-20260420-H. The product page already described the output as "a complete counterparty answer" four times; the new name matches what the product actually does.
- **v1 scope narrowed to the full onboarding-shape product only.** The lighter pre-payment delta-check (CoP/VOP + sanctions refresh on every payment) is deferred indefinitely — bank-scheme floor cost (~€0.20–0.55 COGS) prevents a true micropayment tier (realistic floor €0.50–1.00 retail), and the US has no scheme-level account-name match primitive (Nacha is policy not protocol; EWS Verify / GIACT / Socure are enterprise-only with no PAYG resale at solo-founder volumes), which would have forced a EU/UK-only Payment-shape product and broken the regional parity the Onboarding-shape product preserves.
- **ICP tightened from six segments to four:** AP automation agents, partner onboarding agents, due-diligence research agents, B2B marketplace counterparty admission. Sales qualification, consumer-side marketplace seller admission, and recurring-payment delta-checks are deferred (need a thinner product tier than v1 ships). Web3 counterparty checks reassigned to the existing Web3 Assurance product page.
- **Use cases (v1):** (1) onboarding new customer/supplier/marketplace vendor with repeat-business expectation; (2) periodic refresh every 6–12 months — same product, repeated calls, with the audit trail making "when did we last verify counterparty X" a regulator-ready side-effect; (3) one-off payment to a never-seen counterparty — economically the same as onboarding, full bundle invoked at payment time. €3.50 pays back when invoice value is roughly above €3.5k.

**Notion (governance done):**

- New **DEC-20260502-A** created in Decisions DB ("Strale v1 product narrowed to Counterparty Assurance; Payee Assurance renamed; lighter Payment-shape product deferred"). Scope=global, Confidence=high, Status=active. Captures rationale, use cases, customers, deferred scope, and supersession of the relevant parts of DEC-20260420-H.
- Product page renamed (`34867c87-082c-8149-99e5-c668d7383fa7`); "Who is for" section narrowed to four segments + new "Out of scope at v1" sub-section; in-body name references updated; dated changelog prefix added.
- `Strategy → What Strale is`, `Strategy → The opportunity`, and `Products` parent page all updated to reflect the new name + tightened ICP. Dated changelog prefixes added.
- Deliberately did NOT edit DEC-20260420-H (workflow invariant — never edit existing Decisions). The new DEC supersedes the relevant parts.

**Internal code + memory sweep (deferred external surfaces per Petter):**

- Memory: 4 files updated (`project_business_registry_state.md`, `project_dilisense_reseller_status.md`, `feedback_canonicalize_cross_reference_decisions.md`, `feedback_no_tos_violating_scraping.md`). The canonicalize-feedback file retains an intentional historical note tying the renamed product to the original incident — preserves narrative integrity.
- Code: 11 internal files updated (all comment-only or internal-script-output references): `web3-assurance/evaluators/index.ts`, `capabilities/auto-register.ts` (2 refs), `capabilities/us-court-search.ts`, `capabilities/fr-bodacc-lookup.ts`, `capabilities/vat-validate.ts`, `scripts/backfill-art22-classifications.ts`, `scripts/check-vendor-roster-drift.mjs`, `scripts/empirical-screening-coverage.ts`, `scripts/empirical-vat-coverage.ts` (4 refs), `scripts/gleif-coverage-by-country.ts`, `scripts/trigger-screening-tests.ts`.
- CLAUDE.md, MEMORY.md index: clean — no references to update.

## Open

- **External-surfaces rename queued.** ~5 customer-facing backend files + 1 frontend file still reference "Payee Assurance" — `tools.ts` (MCP tool descriptions), `mcp-server-card.ts`, `llms-txt.ts`, `openapi.ts`, `web3-assurance/methodology.ts`, `strale-frontend/src/pages/Terms.tsx`. Per Petter's call, these are deferred to the website redo + Counterparty Assurance launch sweep — own PR, diff review, smoke test against public catalog/MCP. Don't batch into routine commits.
- **Historical artifacts left as-is by design.** 21 dated files (`docs/research/*`, `docs/diligence/*`, `docs/audits/*`, `handoff/_general/from-code/*`, `KYB_AGGREGATOR_RESEARCH.md`) reference Payee Assurance because that's what the product was called when the artifact was written. Same rule as Notion Journal entries — never rewrite history.
- **Uncommitted internal-rename edits** (4 capability files) — sitting on `fix/uk-cop-check-actual-api`. They're scoped to the rename sweep; commit alongside the other internal-file changes (memory, scripts, evaluator) when this branch lands or in a dedicated rename-sweep commit.

## Non-obvious learnings

- **The €3.50 price point implicitly selects the ICP.** The strategy doc lists six segments; at €3.50/call only four survive economically. Sales qualification (top-of-funnel, low value-per-lead) and consumer-marketplace seller admission (high-volume, low-AOV) get squeezed out by unit economics. Made the ICP narrowing inevitable, not a choice — surfaced in the conversation only because we forced the question of "what does €3.50 actually buy." Worth remembering when future pricing changes ripple back into the ICP framing.
- **The Payment-shape product split is structurally region-asymmetric, not just vendor-asymmetric.** EU/UK has scheme-level account-name match because PSD3 VOP (Oct 2025) and UK CoP (2024) regulators forced it; US has nothing equivalent because Nacha's 2021 Account Validation rule is policy not protocol. The closest US substitutes (EWS Verify, GIACT, Socure) are enterprise-only at solo-founder volumes — same wall already documented in the Vendor Roster v1.2 deferral. This isn't "we haven't picked a vendor yet"; it's "the regulatory primitive doesn't exist." Reframe how the deferral is communicated to future US AP-automation prospects.
- **KYB is the category Strale competes adjacent to, not the category Strale is.** Naming the product KYB (asked + answered this session) puts Strale on Middesk/Alloy/Sumsub's shelf, invites a feature-comparison war Strale loses, and contradicts the "decision-ready outcomes / not a compliance product" positioning explicit in `What Strale is`. KYB-the-shorthand is fine in SEO copy ("not a KYB tool — the decision layer your agent calls") but lethal as a product name. Counterparty Assurance preserves the strategic distinction.
- **The Notion governance "never edit existing Decisions" rule has surprisingly clean ergonomics for renames.** Wrote a new DEC that explicitly supersedes specific clauses of DEC-20260420-H rather than editing the old one. Audit trail through the rename is intact, the prior decision still records what was true on 2026-04-20, and the supersession-relation makes the trajectory legible.

## Cost

None — all Notion/code/memory edits, no API calls, no DB writes, no deploys.
