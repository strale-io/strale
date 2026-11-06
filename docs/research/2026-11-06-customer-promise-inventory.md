---
doc_type: research
type: product
topic: customer-promise-inventory
question: What does Strale promise its customers, in its own words, how much harm follows if each promise is broken, how can each be proven, and what evidence do we hold today?
date: "2026-11-06"
status: current
sources:
  - https://strale.io/
  - https://strale.io/pricing
  - https://strale.io/docs
  - https://strale.io/docs/api
  - https://strale.io/docs/x402
  - https://strale.io/docs/mcp
  - https://strale.io/security
  - https://strale.io/terms
  - https://strale.io/privacy
  - https://strale.io/about
  - https://strale.io/audit
  - https://strale.io/tools
  - https://strale.io/tools/sanctions-check
  - https://strale.io/tools/env-template-generate
  - https://strale.io/solutions/kyb-complete-se
  - https://strale.io/llms.txt
  - https://api.strale.io/llms.txt
  - https://api.strale.io/v1/platform/facts
  - https://api.strale.io/.well-known/agent-card.json
  - apps/web/src/pages/index.astro
  - apps/web/src/pages/pricing.astro
  - apps/web/src/pages/terms.astro
  - apps/web/src/pages/privacy.astro
  - apps/web/src/pages/security.astro
  - apps/web/src/pages/audit.astro
  - apps/web/src/content/retention.ts
  - apps/web/src/lib/code-facts.ts
  - packages/mcp-server/src/tools.ts
  - server.json
  - README.md
  - packages/mcp-server/README.md
  - packages/sdk-typescript/README.md
  - packages/sdk-python/README.md
  - docs/api-quickstart.md
  - docs/company/claims.yaml
  - apps/api/src/lib/platform-facts.ts
  - apps/api/src/lib/execution-outcome.ts
  - apps/api/src/lib/data-retention.ts
  - apps/api/src/routes/dispute.ts
  - apps/api/src/routes/skill.ts
  - archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md
  - docs/research/2026-11-06-distribution-listings-audit.md
  - archive/receipts/README.md
decisions:
  - DEC-20260815-A
  - DEC-20260822-A
  - DEC-20260504-C
  - DEC-20261023-A
---

# Customer promise inventory, 2026-11-06

Petter asked on 2026-11-06 for an audit of "where Strale can't go wrong": what we
promise customers, how well we keep it, and a fix for what can be fixed. This file
is step one: it lists the promises. It is evidence, never authority; it changes no
claim ruling and no text on any surface. The program that works the list is
`docs/programs/promise-audit/PROGRAM.md`.

## Why now

Two findings on 2026-11-06 hit the same promise from two sides. An external
benchmark found `tech-stack-detect` returning `technologies: []` for a site it
could not read. An internal read-only audit of `apps/api/src/capabilities/*.ts`
(`archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md`) then found 38
tools (36 paid, 2 free) where an upstream failure is returned as an empty-looking
success. The billing path charges any normal return except the four shapes
`apps/api/src/lib/execution-outcome.ts` calls unbillable (null or non-object,
exactly `{error}`, `skipped: true`, `unavailable: true`). So the sentence we print
most often, "a call that fails costs nothing", is false for those tools today.

## Method and limits

- **Surfaces read.** The live pages listed in `sources`, fetched on the afternoon of
  2026-11-06 (Swedish time) with an honest user agent, and the `apps/web` source
  behind them; the MCP tool descriptions in `packages/mcp-server/src/tools.ts` and
  `server.json`; package READMEs; the API's own `llms.txt`, agent card and
  `GET /v1/platform/facts`; `docs/api-quickstart.md`; `docs/company/claims.yaml`;
  and the 358 manifests under `manifests/`, read as a class.
- **Wording is quoted** from the live page or the source, so a later edit is easy to
  detect. Where one promise appears in many places, the row names them.
- **Harm** is 1 to 5: 1 cosmetic; 2 an annoyed customer; 3 a wasted or mistaken
  action or a stale disclosure; 4 money lost or a wrong business decision, or a
  legal statement that is untrue; 5 an irreversible loss, or a compliance answer
  that is wrong in the dangerous direction (a clear when it should have been a hit).
- **Status words.** *verified*: a located test or receipt exercises exactly this
  promise at the layer where it is made. *partly verified*: part of it is exercised
  (the rule but not the failure path, a fixture but not production, one rail of
  two). *unverified*: nothing located exercises it. *known broken*: a documented
  counter-example exists, cited.
- **What this session did not do.** It re-ran no test and made no paid or
  production call; it read the repository and the public surfaces. Status therefore
  means "evidence located on 2026-11-06", not "re-proven today". Re-proving is the
  program's work, and every re-proof is a receipt under `archive/receipts/`
  (`npm run receipt -- --kind <kind> --topic <topic> --from <file|->`).
- **Wording owned by Petter.** The Terms and the Privacy Policy bind Moonlighter AB
  and are Petter's text (see the comments at the top of
  `apps/web/src/pages/terms.astro` and `privacy.astro`). Rows that find a defect
  there record it; none of this proposes an edit to be made without him.

## Count by family

| Family | Promises |
|---|---|
| money | 16 |
| compliance answer | 15 |
| evidence and provenance | 13 |
| privacy and data | 16 |
| availability and speed | 6 |
| coverage and catalogue | 9 |
| other | 6 |
| **Total** | **81** |

Status of the 81: 25 verified, 30 partly verified, 16 unverified, 10 known broken
(counted from the tables below by script on 2026-11-06; the 10 known-broken rows are
P-001, P-003, P-022, P-023, P-038, P-039, P-046, P-053, P-061 and P-069).

## How to read a row

`Where` lists every place the wording appears. `Proof` is the cheapest check that
would make the status *verified* and keep it so. `Evidence today` lists paths that
exist in this repository; test files are named, not re-run.

## 1. Money

| ID | Promise (quoted) and where | Harm | How it can be proven | Evidence today | Status |
|---|---|---|---|---|---|
| P-001 | "Failed calls are not charged. If a capability execution fails on our side or returns a structured error before the upstream call succeeds, no fee is debited." (Terms section 4). "A call that fails costs nothing." / "A tool is charged only when the call succeeds. A failed call is free." (pricing, home). "You are charged when a call succeeds. A call that fails is not charged" (docs, REST docs). "Charged only when the call succeeds." (every tool page). "Pay per successful call" (claims register, homepage hero). "A failed call is not charged" (SKILL.md, `routes/skill.ts`). | 5: money taken for no answer, and it contradicts a legal term. | Per tool, a simulated upstream failure (503, 429, timeout, blocked 200, DNS ETIMEOUT) must either throw or return a marker the billing path treats as unbillable; then, in production, count billed calls whose upstream errored near the call time. | `apps/api/src/lib/execution-outcome.guard.test.ts`, `execution-outcome.test.ts`, `routes/billing-parity.integration.test.ts`, `archive/receipts/2026-10-27-test-run-money-path.json`. The throw path is proven. | known broken: 36 paid tools bill an empty or negative "success" when the upstream fails (`archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md`, rows 1-36). |
| P-002 | "A bundled check is one price for all its steps, and if every step fails you get it back." / "failed: Every step failed. Refunded." / partial "Charged in full." (pricing, REST docs); "A bundled check is not charged when it cannot deliver; a partial result is charged." (SKILL.md). | 4: money, and the partial-charge rule is easy to misread. | Run each bundle shape with all steps forced to fail, one step failing, and a gate tripping; check the wallet and the x402 settlement. | `apps/api/src/routes/solution-execute.test.ts`, `solution-reservations.integration.test.ts`, `billing-parity.integration.test.ts`, `lib/solution-gate.test.ts`. | partly verified: the rule holds, but a step that swallows its failure counts as a success, so an all-swallowed bundle is charged. |
| P-003 | "Strale runs the tool, settles the payment once the tool returns a usable result ... A failed call is not charged." / "503 ... No payment was taken." (docs, x402). | 5: an on-chain payment cannot be clawed back. | Settlement-order test plus a reconciliation of settled payments against outcomes; the same perturbation set as P-001 on the x402 rail. | `apps/api/src/routes/x402-gateway-v2.settlement-order.test.ts`, `x402-money-path.test.ts`, `x402-settlement-characterization.test.ts`, `archive/receipts/2026-10-30-audit-x402-settlement-reconciliation.json`, `2026-10-29-test-run-h4-x402-payment-binding.json`, `2026-10-28-test-run-v1-do-x402-parity.json`. | known broken for the swallowed-failure class: "usable" is decided by `outcomeFromOutput`, which accepts the empty successes. Ordering and binding are verified. |
| P-004 | "Each API call carries the most you will pay for it. Anything pricier is refused, not charged." / "max_price_cents ... from 1 to 2000 (€20.00). Required with an API key." (pricing, REST docs). | 4: an agent could overspend. | Call a priced tool with a ceiling below its price and read `budget_exceeded` with the wallet unchanged; boundary at 1 and 2000. | `apps/api/src/routes/do.core.test.ts`, `lib/actionable-errors.test.ts`; `MAX_PRICE_CAP_CENTS` read by `apps/web/src/lib/code-facts.ts`. | verified |
| P-005 | "Each account has an hourly spend limit, €100.00 by default. Calls past it are refused with spend_cap_exceeded." (REST docs). | 3: a runaway agent. | Drive an account to the cap in a test and in production on a throwaway key; check the refusal and that no charge follows. | `apps/api/src/routes/do.spend-cap.integration.test.ts`, `do.spend-cap.test.ts`; the Date-binding incident of PR 43 (DEC-20260504-A) is the case study. | verified |
| P-006 | "Calls are paid from a prepaid wallet. When it is empty, calls are refused with insufficient_balance."; additional keys carry hourly and lifetime limits, "Refunds restore the budget of the original purchase." (REST docs, `packages/sdk-typescript/README.md`). | 4: money. | Concurrent calls against a nearly empty wallet; per-key limit enforcement. | `apps/api/src/routes/do.wallet-concurrency.integration.test.ts`, `archive/receipts/2026-10-27-test-run-api-key-spend-limits.json`, `2026-10-27-test-run-api-key-spend-limits-round-2.json`. | verified |
| P-007 | "Send an Idempotency-Key header ... Strale returns the first result with meta.idempotency_replay: true and does not run or charge the call twice." (REST docs, SDK READMEs). | 4: a double charge on retry. | Replay the same key and body after success, after a timeout and after a failure; a different body with the same key must give 409. | `apps/api/src/routes/do.idempotency.integration.test.ts`, `lib/idempotency-fingerprint.test.ts`, `lib/do/idempotency.ts`. | verified |
| P-008 | "dry_run ... Returns the tool that would run and its price. Nothing runs and nothing is charged." (REST docs, SDK READMEs). | 2: a wrong estimate. | Dry run on a paid tool and a bundle; wallet and ledger unchanged; the returned price equals the later charge. | `apps/api/src/routes/do.core.test.ts` names dry_run; no test compares the previewed price to the charged price. | partly verified |
| P-009 | "Account closure refund. If you close your account, unused wallet balance is refundable on request within 60 days of closure. After 60 days the unused balance is forfeit." (Terms section 4). | 4: money owed, in a legal term. | Close a test account with a balance, request the refund, and show the Stripe refund and ledger entry; a written procedure and an owner. | `apps/api/src/lib/account-closure.test.ts` covers closure; nothing located covers the refund itself, which is a manual step. | unverified |
| P-010 | "Top-ups are non-refundable except as set out below or as required by applicable consumer-protection law." / "The minimum is €10.00." (Terms, REST docs, `pricing-constants.ts`). | 3: a disputed top-up. | Minimum enforced at the endpoint and on Checkout; a refund-on-request path exists for the consumer-law case. | `apps/web/src/lib/code-facts.ts` reads `MIN_TOPUP_CENTS`; `apps/api/src/routes/wallet.test.ts`. The refund path is not exercised. | partly verified |
| P-011 | "Every tool has one price per call" / "The price is quoted before anything is paid" / "the quote is the price you agree to by signing it" / "The quote is valid for 300 seconds." (pricing, docs/x402, home). | 4: charged a different price than shown. | Compare listed price, the 402 quote and the settled amount across every x402 tool; the catalogue price in cents against the wallet debit across every paid tool. | `apps/api/src/routes/x402-gateway-v2.catalog.test.ts`, `archive/receipts/2026-10-29-test-run-h4-x402-payment-binding.json`, `2026-10-28-test-run-x402-discovery-coverage.json`. | partly verified: verified for x402; the wallet rail has no sweep of every tool's debit against its listed price. |
| P-012 | "No subscription and no contract." / "There are no recurring charges and no subscription." (pricing, Terms section 4, about, llms.txt). | 2: a surprise bill. | Code proof that no recurring-charge path exists (no Stripe subscription or invoice objects), plus the Stripe account showing none. | None located. | unverified |
| P-013 | "New accounts receive trial credits as announced on strale.io/pricing" / "new accounts can start with €2.00 in trial credit, no card needed" / one per email (Terms, signup page, claims register `trial-credit-amount`). | 2: a promised credit not given. | Register a fresh address and read the balance; a repeat registration must not grant it; a withheld grant says so in the response. | `apps/api/src/lib/trial-eligibility.test.ts`; the amount is read from `TRIAL_CREDITS_CENTS` (200) at build time. | verified |
| P-014 | "an asynchronous call holds its price until it finishes" and a failed async call is not charged (`routes/skill.ts`; REST docs on 202 and polling). | 3: money held on a call that never completes. | Force an async tool to fail and to time out; the hold must release. | `apps/api/src/routes/async-jobs.integration.test.ts`, `do.async.test.ts`, `do.crash-recovery.integration.test.ts`. | verified |
| P-015 | Batch: "Each completed item is charged its price; a failed item is not. Items not started within the batch's 90-second budget come back as not_run, not charged" (`docs/api-quickstart.md`). | 3: a charge for work not done. | A batch with a failing item and an over-budget tail; the totals `charged_cents` and `released_cents` against the wallet. | `apps/api/src/routes/do.batch.integration.test.ts`, `lib/do/batch.test.ts`, `archive/receipts/2026-10-29-test-run-batch-calls.json`. | verified |
| P-016 | "Free tools run without a key, 300 calls a month per IP address." / "free tools never charge" with a key (home, pricing, REST docs, llms.txt, signup, SDK READMEs). | 2: a silent charge, or a free tool that stops early. | The allowance counter over a month boundary and across IPs; a keyed call to a free tool leaves the balance unchanged. | `apps/api/src/lib/free-tier-rate-limit.test.ts`, `free-tier.test.ts`, `archive/receipts/2026-10-28-test-run-monthly-free-allowance.json`. | verified. The root `README.md` still says "an IP-based daily rate limit": stale (see T7). |

## 2. Compliance answer

These are the promises where a wrong answer in the quiet direction (clear, active,
no match) does the most harm. The Terms (section 8) disclaim that a no-match
clears anyone; that disclaimer does not excuse an answer produced by a failed
lookup.

| ID | Promise (quoted) and where | Harm | How it can be proven | Evidence today | Status |
|---|---|---|---|---|---|
| P-017 | "Screen a person or company against published sanctions lists, returning potential name matches with their source lists and countries." `sanctions-check`, EUR 0.20; every output field marked "Always" including `is_sanctioned` (tool page, manifest, agent card). | 5: a missed hit. | A reference set: at least 30 known listed names across OFAC, EU, UN and UK lists with aliases and transliterations, plus 10 clean controls including common names; assert the hits. A forced vendor failure must throw, never return `is_sanctioned: false`. | `archive/receipts/2026-09-10-test-run-known-answer-checks-mutations.json`; `docs/research/2026-04-27-screening-coverage-empirical.md`. The audit rules out a swallowed failure here (it throws). No reference-answer set with recall. | partly verified |
| P-018 | "Screen a person for potential politically exposed person matches, returning positions, countries and record sources where available." `pep-check`, EUR 0.05; "230+ territories". | 5: a missed PEP. | As P-017 with known PEPs per region, relatives and close associates, and clean controls. The manifest's own limitation says national coverage is not verified per call. | Same research file; the audit rules out a swallowed failure. | partly verified |
| P-019 | "Search adverse news about a person or company. Returns a risk level, category counts and linked headlines for review." `adverse-media-check`, EUR 0.20. | 4: a false all-clear, or a false accusation of a person. | A reference set of named persons and companies with known coverage; the Serper fallback path run on purpose; a check that `risk_level` follows the published thresholds. | The audit rules out a swallowed failure. `docs/research/2026-10-26-serp-vendor-replacement.md` concerns the fallback vendor. No reference set. | partly verified |
| P-020 | "Comprehensive verification of a Swedish company. Full compliance check including registry verification, sanctions screening, PEP screening, adverse media search, digital presence analysis, and a plain-language risk narrative." `kyb-complete-xx` (20+ countries) and "KYB Essentials", EUR 1.50 to 2.70; 96 bundled checks. | 5: a company cleared on a partial check. | End to end on a reference entity per country (active, dissolved, sanctioned director); a step failure must surface in `result.steps`. | `archive/receipts/2026-10-26-check-invoice-counterparty-check-live.json` covers the narrower invoice bundle only. | unverified at bundle level. "Comprehensive" and "Full" are our words (see implicit promises). |
| P-021 | "Check whether a company is still registered and active in its official registry, with insolvency notices where an official source exists." `company-status-check`, EUR 0.08. | 5: paying or contracting with a dissolved company. | Per registry, a live, a dissolved and a missing entity; the original registry term returned in `registry_status_raw`. | `archive/receipts/2026-10-26-test-run-registry-status-dead-entities-final.json`, `...-round-3.json`. | partly verified |
| P-022 | "Check a UK company for insolvency, bankruptcy or winding-up proceedings at Companies House. Returns the status and key dates." `insolvency-check`, EUR 0.02. | 5: a company in liquidation reported as "not found". | Reference UK companies in administration, liquidation and clean; a forced Companies House 429, 5xx and timeout. | `archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md` row 3. | known broken: a 429, 5xx or timeout returns `found:false`. |
| P-023 | "Check whether a crypto-asset service provider is authorised under MiCA in ESMA's register" (`vasp-verify`); `vasp-non-compliant-check` returns `on_non_compliant_list`. | 5: an unauthorised provider reported as not on the list, or an authorised one as not authorised. | Reference CASPs from the ESMA register, plus a forced failure of every ESMA CSV URL. | Audit rows 1 and 2. | known broken: all ESMA fetches failing returns `match_found:false, authorized:false` and `on_non_compliant_list:false`. |
| P-024 | "Company records from official sources in 25 countries ... Name, registration number and status, plus address and directors wherever the register publishes them." (home, company-data hub, about, llms.txt). | 4: a wrong or missing record in a business decision. | Per country, three reference entities (live, dissolved, name collision) run monthly against the register itself. | `docs/research/2026-05-06-live-registry-coverage-audit.md` (16 registries, May); `archive/receipts/2026-10-24-check-web-company-data-review.json`. Nothing recent across all 25. | partly verified. Individual tools have swallowed-failure rows (audit row 18, `cz-company-data`). |
| P-025 | "Look up a Swedish company at Bolagsverket by organisation number" and the other per-country tools; each tool page names its source (tool pages, claims register `official-records-company-data`). | 4: as P-024. | Known-answer per tool against the register; the test already runs for those with zero-cost sources. | Known-answer suites per manifest (`manifests/*.yaml`, `apps/api/src/lib/known-answer-checks.test.ts`); `apps/web/test/editorial.test.ts` for the "official" wording. | partly verified |
| P-026 | "Check supported VAT numbers against registry services, returning validity and available company details, with cache information when used." `vat-validate`; home example "Check this VAT number before we invoice." | 4: paying VAT on an invalid number, or refusing a valid one. | Reference valid, expired and malformed numbers per member state; VIES down must produce a stale marker or an error, never `valid:false`. | `docs/research/2026-04-28-vat-coverage-empirical.md`; the audit rules `vat-validate` out (stale-marked). | partly verified |
| P-027 | "Check a supplier's tax ID, official company status and sanctions screening before invoice payment, returning evidence for each check." `invoice-counterparty-check`, EUR 0.75. | 5: fraud on an invoice. | Reference suppliers: genuine, dissolved, sanctioned; a failing leg must show in the evidence. | `archive/receipts/2026-10-26-check-invoice-counterparty-check-live.json`, `2026-10-26-test-run-invoice-counterparty-check-verification.json`, `...-mutations.json`, `...-round-2.json`. The best-evidenced compliance bundle. | verified |
| P-028 | "Written by an AI model from the other steps' results, for a person to review. It does not make the decision." `risk-narrative-generate`; DEC-20260428-B: per-flag source citation, "screening checks found" framing, never assert a fact not in the input. | 4: an invented fact in a compliance file. | A golden set of step outputs including adversarial ones; assert every flag cites a step and no entity or fact appears that is not in the input. | `docs/dpia/risk-narrative-generate.md`; the manifest limitation about fixed assessment rules. No golden set located. | unverified |
| P-029 | "Returns a decision-ready answer about an on-chain counterparty ... verdict (proceed/review/block/insufficient_evidence), reason_codes ... a sidecar audit_url." `strale_web3_assurance` (MCP, agent card). | 4: funds sent to a flagged address. | Reference wallets and contracts: known sanctioned, known mixer-linked, clean; a forced RPC failure must give `insufficient_evidence`, not `proceed`. | None located at verdict level. | unverified |
| P-030 | "Where a capability returns an explicit decision-readiness object, you should consult that object before treating a response as actionable." (Terms section 8). | 3: a verdict acted on without its caveats. | The field exists, is populated on the tools that claim it, and is covered by a contract test. | The object appears in `apps/api/src/capabilities/vat-validate.ts` and `apps/api/src/web3-assurance/verdict.ts`; no contract test across the tools that carry it. | unverified |
| P-031 | "Capability outputs are evidence to inform your decisions, not decisions in themselves." plus the "no match does not mean clear" disclaimer (Terms section 8). | 4: a legal limit; it holds only if the product itself behaves like evidence. | Read against P-017 to P-023: a failed lookup that returns a clean-looking answer is not evidence. | Terms text. | partly verified: true of the design, broken by the P-022 and P-023 class. |

## 3. Evidence and provenance

| ID | Promise (quoted) and where | Harm | How it can be proven | Evidence today | Status |
|---|---|---|---|---|---|
| P-032 | "Strale runs it and answers. Clean, structured fields, with the source and the price on every result." (home); "return structured responses with provenance and an audit record" (Terms section 2); "Provenance included" (claims register, allowed); "provenance names the source that answered and when it was fetched" (REST docs). | 4: a result with no source, in a compliance file. | A static contract over every executor (a success carries `provenance.source` and `fetched_at`) and a production count of recent successes with null provenance, by capability. | `apps/api/src/lib/provenance-builder.test.ts`, `provenance-builder-validation.test.ts`, `capability-output-contracts.test.ts`. | partly verified |
| P-033 | "Every call is on record and can be fetched again by its transaction ID" / "The record has the status, the input and output, the price, the latency, the provenance and the audit record." (pricing, REST docs). x402 responses carry no transaction ID; "Keep _meta.payment.settlement_id". | 3: a call that cannot be shown. | Create calls on every rail, fetch each, compare to the response. | `apps/api/src/routes/transactions.test.ts`, `audit.test.ts`, `do.receipt.integration.test.ts`. | verified |
| P-034 | Each call's audit record with an integrity hash that "links it to the record before it" (security); "tamper-evident audit chains" (Privacy section 7); `meta.audit`. | 4: an audit record that cannot be trusted. | Walk the chain over a production sample and over a redacted range; mutation test: alter a row and the chain must report it. | `apps/api/src/lib/integrity-hash.test.ts`, `chain-integrity-windows.test.ts`, `chain-health-monitoring.ts`. | verified |
| P-035 | "Verified compliance record" with "Integrity", and the statements "EU AI Act Article 12 - Full execution logging with per-step timestamps and data sources", "Article 13", "Article 14", "Article 50 - AI-generated content explicitly marked per step", "GDPR Article 30", "Article 15/17" (audit page). | 4: a regulator-facing claim, which is Petter's, resting on page text. | Map each statement to the audit-body field that carries it, and show the field populated on a sample of real records. A statement with no field is a narrowing candidate. | `apps/api/src/routes/audit.test.ts`, `lib/audit-key-coverage.test.ts`, `audit-serve-coverage.test.ts`. The statements are page copy with no test tying each to a field. | unverified |
| P-036 | A shareable audit link that expires: "This link has expired. Ask whoever shared it for a new link." and "This record requires a valid access token" (audit page). | 3: a leaked link exposing a record. | Token expiry, tampering and a link for another transaction, each refused. | `apps/api/src/lib/audit-token.test.ts`, `routes/audit.test.ts`. | verified |
| P-037 | "For each answer, Strale records which source the data came from and how it was obtained." (security, sources). | 3: a source of unknown lawfulness. | `acquisition_method` and the data-access lane present in provenance on every tool (the DEC-20261023-A adoption item). | `apps/api/src/lib/data-access.test.ts`, `data-access-manifests.test.ts`; completeness across all tools not located. | partly verified |
| P-038 | Each tool page's "Source and method": the manifest `data_source`, for example "Threat intelligence feeds (multi-source scoring)" for `domain-reputation`; the `kyb-complete-se` step list prints the same source per step. | 3: a customer relies on a source we do not use. | For each tool, compare `data_source` to the hosts the executor actually calls (a static scan) and to the limitations. | The published API text was corrected (`handoff/_general/from-code/2026-11-06-publish-domain-reputation.md`, block 0143, PR 927); `archive/receipts/2026-10-31-check-h3-manifest-text-and-guaranteed-fields.json`. | known broken (fix in flight): the site still shows the old `domain-reputation` source, and `dependency-audit` says "Algorithmic (dependency tree analysis, no external data)" while its executor calls OSV.dev. |
| P-039 | "Computed by fixed rules and lookups; no AI model writes the answer." printed on every tool tagged `algorithmic` (215 live tools); "Written by an AI model ..." on the AI-tagged ones; Article 50 marking per step (audit page). | 4: AI output presented as rule output. | Static scan: no executor tagged `algorithmic` imports the Anthropic client; production check on `ai_generated` calls through the shared client. | `archive/receipts/2026-10-31-check-h5-cost-recording-production.json` records client usage; no scan against the tag. | known broken: `env-template-generate` (live) is tagged `algorithmic`, its source reads "Claude API (environment template generation)", and its page prints the "no AI model" sentence. `annual-report-extract` has the same mislabel (not live). |
| P-040 | Every output field marked "Always (present in every successful answer)" / "Usually" on each tool page. | 3: a field an agent relies on is missing. | Real-traffic monitoring of guaranteed fields. | `apps/api/src/lib/guaranteed-fields-sentinel.test.ts`, `archive/receipts/2026-10-31-check-h3-manifest-text-and-guaranteed-fields.json`. | verified |
| P-041 | "Each tool's page shows the date of its last recorded test and the share of its tests that passed on that latest run." / "Tested, with the results in the open" / "all tests passed" (security, home, tool pages). | 3: green checks that mean little. | A "passed" must mean the answer was right, not that the call returned: perturbation tests (P-001) must be red on a swallowed failure. | `apps/api/src/routes/public-trust.test.ts`, `lib/mcp-trust-contract.test.ts`. LESSONS F5 (hollow tests) is the open family. | partly verified: the display is exact; "passed" is weak for the 38 swallowed-failure tools. |
| P-042 | "A test result tells you what the tool returned on that date; it is not a score." / "A tool with no recorded test says so." (security). | 2: implied quality. | Tool pages with no test run render the "no recorded test" text. | `apps/web/test/` tool-page tests. | verified |
| P-043 | "The answer returns every step's result, so your agent can show or check each one." (bundle pages); `result.steps` keyed by tool. | 3: a hidden failed step. | A bundle with a failing step lists it in `result.errors`. | `apps/api/src/routes/solution-execute.test.ts`. | verified |
| P-044 | "Some suites call the real source; others replay a saved baseline answer ... Tools that pay a vendor per call are watched through their real traffic" (security, testing). | 3: paid tools are not probed, so a swallowed failure is never seen. | Piggyback results exist per paid tool; a swallowed failure is visible in them. | `apps/api/src/lib/piggyback-monitor.test.ts`; CLAUDE.md Principle C. | partly verified: monitoring records a swallowed failure as a success (audit, "How billing treats a capability's result"). |

## 4. Privacy and data

| ID | Promise (quoted) and where | Harm | How it can be proven | Evidence today | Status |
|---|---|---|---|---|---|
| P-045 | "Input, output, error and audit content are cleared 90 days after the call. The record of the call itself stays." (REST docs); "Call content cleared after 90 days. Call records kept for 1095 days." (security). | 4: personal data kept past the stated period. | Count calls older than 90 days that still hold content, by capability, in production; run it monthly. | `apps/api/src/lib/data-retention.test.ts`, `data-retention-coverage.test.ts`. The check "of 732,115 calls older than 90 days, 5 still held content" on 2026-10-25 is a comment in `apps/web/src/content/retention.ts`, not a receipt. | partly verified |
| P-046 | "Customer-input: stored alongside the audit record under Art. 30 for the same period as the audit itself; redacted in place when retention expires" (Privacy section 6) and "Data retention: 3 years from execution" (audit page), against 90 days of content (P-045). | 3: three surfaces give two periods; a data subject reads the longer one. | Reconcile the three; the content period and the record period are different clocks. | `apps/api/src/lib/platform-facts.ts` comment on `pii_retention_days`. | known broken: inconsistent across Privacy, audit page and Security. The Privacy text is Petter's. |
| P-047 | Erasure: "DELETE /v1/auth/me for full-account erasure ... and DELETE /v1/transactions/{id}"; "the chain hashes are untouched and every later transaction still verifies" (Privacy section 8). | 4: an unfulfilled erasure right. | End to end on a test account with transactions and a legal hold; chain verifies after. | `apps/api/src/lib/account-closure.test.ts`, `routes/account-lifecycle.integration.test.ts`. | verified |
| P-048 | "We do not use your data to train models and we do not sell it." (Terms section 6, Privacy section 2). | 4: a breach of a stated term. | The sub-processors' terms (Anthropic API, Dilisense, Browserless, Serper) carry a no-training clause; a list with the clause reference per vendor. | None located; this is contractual evidence, not code. | unverified |
| P-049 | "API keys are stored only as SHA-256 hashes. The full key is shown once ... a lost key is replaced, never recovered." (security). | 4: a key leak. | Code proof: no plaintext key column or log line; the recovery flow rotates. | `apps/api/src/lib/api-keys.test.ts`, `key-recovery.test.ts`, `log-redaction.test.ts`. | verified |
| P-050 | "Balance top-ups run through Stripe Checkout, so card details go to Stripe and never reach Strale." (security, Privacy section 2). | 4: payment-card data in scope. | No card field in any endpoint, webhook payload handling reviewed. | `apps/api/src/lib/stripe-settlement.test.ts`, `routes/webhook.integration.test.ts`. | partly verified |
| P-051 | "Your key is kept temporarily in this browser tab until you close it. It is never stored on Strale's servers, never logged, and never sent anywhere except the Strale API over HTTPS." (top-up page). | 3: a key stored or logged. | The key arrives only as a bearer header; log redaction covers it. | `apps/api/src/lib/log-redaction.test.ts`, `archive/receipts/2026-10-29-test-run-h8-log-redaction-mutations.json`. | partly verified: the sentence "never logged" holds for server logs; the browser side is untested. |
| P-052 | "Strale's API and database run in the United States. Every call is processed there, and each call's audit record names where it ran." (security); `processing_jurisdiction: US`. | 3: a wrong jurisdiction in a record. | Compare the audit-record jurisdiction with the Railway region. | `apps/api/src/lib/processing-location.test.ts`; live facts show `us-east4-eqdc4a`, jurisdiction `US`. | verified |
| P-053 | Sub-processor table: "Better Stack - Log shipping + alerting - EU - Application logs (PII redacted at source)" and "Server & security logs: 90 days" (Privacy sections 4 and 6; security vendor table, from `STATIC_FACTS`). | 3: a processor named that is not yet processing, so the disclosure is inaccurate; the reverse omission is the larger risk. | Compare the list with `GET /v1/platform/facts` (`log_sink_shipping`) and with every vendor in `STATIC_FACTS.vendors`. | Live read on 2026-11-06 at 14:07 UTC shows `log_sink_shipping: false`. Claims register `logs-processed-in-eu` is `needs_evidence` and "true only while ... log_sink_shipping true". | known broken: the list names a sink that is not shipping, and its "last reviewed 30 April 2026" predates Cobalt Intelligence, Liberty Data and GLEIF on the security page. |
| P-054 | "API keys, auth headers, customer inputs, payment payloads and email addresses are redacted before a line leaves the server." (`STATIC_FACTS.log_sink.content`, Privacy). | 3: personal data in an external log. | Mutation tests on the redactor; a read of the first real sink lines once it ships. | `apps/api/src/lib/log-redaction.test.ts`, `log-sink.test.ts`, `archive/receipts/2026-10-29-test-run-h8-log-redaction-mutations.json`. | partly verified: unit level only, sink not live. |
| P-055 | "You can ask for a person to review the result of any call made with an API key ... A person at Strale reviews every dispute." and each audit record carries a `dispute_endpoint` (security, Privacy section 7.5). | 3: a data subject's dispute goes unanswered. | A dispute round trip on a test call; the age of undecided disputes in `dispute_requests` stays below a stated bound. | `apps/api/src/routes/dispute.ts` (intake, alert, disposition fields). The module header says "Storage only in v1 ... an admin reviews disposition out-of-band". No test file for the route. | partly verified: intake exists, the human review cannot be proved from code. |
| P-056 | "We will respond within one month." to rights requests; DPA "available on request"; 30 days' email notice of material changes and of sub-processor changes (Privacy sections 1, 4, 8, 9; Terms section 11). | 3: a missed statutory period. | A log of requests with dates and replies; the DPA document; the notice mailing procedure. | `docs/dpia/` holds four DPIAs; no request log or DPA located. | unverified |
| P-057 | "Strale reads what is public, logged out. ... A refusal, a challenge page or a robots.txt rule ends the request. Strale never solves CAPTCHAs, rotates addresses or retries a blocked request another way. ... Strale identifies itself by name in each request." (security, about). | 4: a legal and reputational breach (DEC-20261023-A). | Replay against a blocking origin; the user agent on the wire; the blocklist refuses listed hosts before a fetch. | `apps/api/src/lib/robots-txt.test.ts`, `tos-blocklist.test.ts`, `safe-fetch.test.ts`, `archive/receipts/2026-10-28-test-run-fetch-hardening.json`, `2026-10-30-check-source-robots-access.json`. | partly verified |
| P-058 | "No harvesting people data. ... Personal data comes back only where a court or registry publishes it, as published, for the one request that asked." (security). | 4: DEC-20261023-A. | The tool classes that return people data (`domain-contact-extract`, screening, registries) against the rule. | `apps/api/src/lib/data-access.test.ts`; the audit lists `domain-contact-extract` among the swallowed-failure rows, a separate matter. | partly verified |
| P-059 | "When your agent asks Strale to read a page, Strale fetches that one public page for that one request." and "Those requests [for a tool no tool can do] are read every week" (security, about). | 2: a missed or misdescribed use of demand logs. | The demand log (`failed_requests`) holds no customer content beyond the task text and is read weekly (process). | The 2026-08-15 customer-data boundary (DEC-20260815-A). | unverified |
| P-060 | "The customer making the call is the controller for any personal data in it; Strale processes it on the customer's behalf." and the Art. 22 class on every audit record: `data_lookup`, `screening_signal`, `risk_synthesis` (security, Privacy section 7.5). | 3: a wrong class on a tool. | The class in the audit body equals the manifest; the highest class of a bundle's steps applies. | Manifests: 349 `data_lookup`, 8 `screening_signal`, 1 `risk_synthesis`; `docs/dpia/`. | partly verified |

## 5. Availability and speed

| ID | Promise (quoted) and where | Harm | How it can be proven | Evidence today | Status |
|---|---|---|---|---|---|
| P-061 | "When an upstream source is unavailable, we serve cached results where we have them and return a structured error otherwise." (Terms section 7). | 4: the second half is the promise a swallowed failure breaks. | The P-001 perturbation set: every network executor errors cleanly or is unbillable. | `docs/api-quickstart.md` error table; `lib/retry.ts` retries only on a throw. | known broken for the swallowed-failure class (audit, the 38 rows). |
| P-062 | "We aim to keep the Service available continuously, but we do not offer a contractual uptime SLA at this stage." (Terms section 7; the claims register forbids any uptime percentage). | 2: this is an honest disclaimer; harm only if we publish a figure. | `npm run claims:check` stays green; nothing quotes an uptime number. | `docs/company/claims.yaml` rows `uptime-sla-percentage`, `sla-commitment`, `average-latency-claim`. | verified |
| P-063 | "A key may send 10 requests a second. Past that, calls return rate_limited with a Retry-After header." (REST docs); batch "300 per minute per key". | 2: a limit different from the stated one. | A burst test on a throwaway key. | `archive/receipts/2026-10-29-test-run-do-rate-limit-per-key.json`, `apps/api/src/lib/middleware.ip-limit.test.ts`. | verified |
| P-064 | "Tools that take longer than 10 seconds run in the background. The call returns HTTP 202" ; "timeout_seconds ... Default 30, maximum 60" (REST docs); "clamped to 5-60 seconds" (`docs/api-quickstart.md`). | 2: a wrong threshold. | A slow tool crosses the stated threshold and returns 202; the clamp is observed. | `apps/api/src/routes/do.async.test.ts`, `lib/latency-estimate.test.ts`. This session did not find the 10-second constant in `lib/do/dispatch.ts` (it names `EXEC_HARD_TIMEOUT_MS`, 300000); the docs and DEC-22 ("under 5 seconds") disagree on the cut. | partly verified |
| P-065 | "When a tool's real calls fail too often, Strale takes it out of the catalogue, and it comes back once a fix passes its checks." / "Tools that stop working are taken out of the catalogue" (security, about). | 3: a broken tool stays on sale. | A tool whose real calls fail below the floor is quarantined and returns on recovery; the failure must be visible to the floor. | `apps/api/src/lib/quality-floor.test.ts`, `jobs/quality-floor.integration.test.ts`. | partly verified: a swallowed failure is recorded as success, so the floor cannot see it. |
| P-066 | Each response carries `latency_ms`; MCP "Returns ... latency"; tools show no published latency average. | 1: a wrong figure. | `latency_ms` equals the measured wall time within a tolerance. | `apps/api/src/lib/latency-estimate.test.ts` covers the estimate. | unverified (low harm; keep it unpublished) |

## 6. Coverage and catalogue

| ID | Promise (quoted) and where | Harm | How it can be proven | Evidence today | Status |
|---|---|---|---|---|---|
| P-067 | "298 tools", "25 countries", "11 free tools", "96 bundled checks", "275 tools take x402" (home, about, pricing, docs; computed at build time from the API). | 2: a stale count. | Build-time values equal `GET /v1/platform/facts` after each daily rebuild; typed counts are forbidden by the claims register. | `apps/api/src/lib/platform-facts.test.ts`; `static-distribution-counts` row; live facts on 2026-11-06 agree with the site (298, 25, 96). | verified |
| P-068 | "Every tool's price, inputs, source and limits are public on its page, and the whole catalogue is available as JSON from the API." (about). | 2: a tool with no limitation. | All manifests carry limitations (358 of 358 read on 2026-11-06) and the page renders them. | `apps/api/src/lib/manifest-completeness.test.ts`. | verified |
| P-069 | The published limitations are the honest ones. For compliance-category tools the live text can lag the repository: `sanctions-check`'s live page shows "Sanctions lists update daily from OFAC, EU, and UN", a limitation not in its manifest, because the text sync refuses compliance-category rows until Petter approves (`lib/manifest-publication-policy.ts`). | 3: stale caveats on the highest-harm tools. | Diff served limitations against manifests for every compliance, KYB, KYC and methodology tool. | Block 0143 shows the approval route used once for `domain-reputation`. | known broken (queued for Petter's approval; not yet measured across all such tools) |
| P-070 | "x402 eligible" and "275 tools and 89 bundled checks accept x402 today ... The set changes, so read it from the catalogue" (docs/x402; `all-x402-coverage` forbids universal claims). | 3: a tool listed as payable that is not. | Probe a 402 quote from each catalogue entry. | `apps/api/src/routes/x402-gateway-v2.catalog.test.ts`, `archive/receipts/2026-10-28-test-run-x402-discovery-coverage.json`. | verified |
| P-071 | "Company records from official sources in 25 countries" with the claims-register note that ES, DE, BE and BR come through vendors wrapping the register, and US is SEC filers. | 3: "official" over-read. | Every country page names its tool's actual `data_source`. | `apps/web/test/editorial.test.ts` (the claim's evidence). | partly verified |
| P-072 | Directory and registry listings: "Hundreds of pay-per-call tools for agents: company records, screening, validation, web reading." (`server.json`), Smithery, Glama, 402 Index, Bazaar. | 3: stale or untrue third-party text. | The 2026-11-06 listings audit, repeated monthly. | `docs/research/2026-11-06-distribution-listings-audit.md`. | partly verified: the audit found stale listings outside the repository. |
| P-073 | Framework and SDK packages: "langchain-strale", "crewai-strale", "pydantic-ai-strale" and the like; "native" claims need `check-framework-packages.mjs` (claims register `framework-native-integration`). | 3: the pydantic-ai incident. | `node apps/api/scripts/check-framework-packages.mjs` passes for each published package and a production smoke test follows each publish. | `archive/receipts/2026-11-06-check-npm-four-packages-production-smoke.json`, `2026-11-06-check-strale-mcp-0-2-11-production-smoke.json`. | partly verified: PyPI releases are pending. |
| P-074 | "Strale holds the provider relationships, so your agent never needs an account, a contract or a bill with any of them." (about). | 2: a tool that needs the customer's own vendor account. | No tool requires a customer-supplied third-party credential. | Manifest scan not run. | unverified |
| P-075 | "Add tools as your agent's work grows, through the connection you already have." and "New tools join the same connection" (home, about). | 1: a new tool that needs reconfiguration. | A new tool appears in `strale_search` and `/v1/capabilities` within a day of onboarding, with no client change. | `apps/api/src/lib/search/search-quality.test.ts`. | partly verified |

## 7. Other

| ID | Promise (quoted) and where | Harm | How it can be proven | Evidence today | Status |
|---|---|---|---|---|---|
| P-076 | "Questions, partnerships, a tool you need or a result that looks wrong: write to us and a person answers." / "read by a person" (about, security). Three addresses appear: `compliance@strale.io` (Terms, Privacy), `petter@strale.io` (`STATIC_FACTS.controller`), `hello@strale.io` (API `llms.txt`). | 3: a mail to a dead or unread address. | Send a test message to each and time the reply; one address per purpose. | None. | unverified |
| P-077 | "Nothing about Strale locks you in. ... can stop whenever it likes." (about). | 1: false only if an exit is blocked. | Account closure works without a lock-in term. | Terms section 10; `lib/account-closure.test.ts`. | verified |
| P-078 | "Strale is built and run by Moonlighter AB, a company incorporated in Sweden." / "organisationsnummer 559395-7979" (about, Terms). | 2: a wrong entity in a contract. | The number against the Swedish register. | None located. | unverified |
| P-079 | "Terms ... governed by the laws of Sweden ... Stockholm District Court" and a liability cap of "the greater of (a) the fees you paid us in that period or (b) EUR 1,000" (Terms sections 8, 12). | 3: a legal term. | Petter's own review; not code. | Terms text only. | unverified |
| P-080 | MCP `strale_execute`: "Paid capabilities debit from the wallet" with a default ceiling of 200 cents and "Execution fails if capability costs more"; `strale_balance` "Returns the current Strale wallet balance". | 3: a ceiling not applied. | The MCP default `max_price_cents` reaches the API; balance equals `GET /v1/wallet/balance`. | `apps/api/src/routes/mcp.test.ts`, `archive/receipts/2026-11-06-check-strale-mcp-0-2-11-production-smoke.json`. | verified |
| P-081 | The agent card and `llms.txt`: "GitHub: https://github.com/petterlindstrom79/strale" while the repository is `strale-io/strale`. | 1: a stale link. | Fetch the link. | `server.json` and `README.md` use `strale-io/strale`. | unverified (T7) |

## Per-tool promises, as a class

The 358 manifests under `manifests/` carry one description and at least one
limitation each. They are not listed here; the class view below shows what each
kind of tool promises, what its usual failure looks like, and how the class is
proven. Category counts are from the manifests; the live catalogue shows 298
active, visible tools of which 11 are free (`GET /v1/platform/facts`).

Across the manifests: 262 are tagged `algorithmic`, 89 `ai_generated`, 7 `mixed`
(the live API: 215, 78, 5 respectively). Source types: 240 `api`, 83 `computed`, 31
`scrape`, 3 `reference`, 1 `ai_assisted`. Freshness: 232 `live-fetch`, 92
`computed`, 17 `reference-data`. 349 carry the Art. 22 class `data_lookup`, 8
`screening_signal`, 1 `risk_synthesis`.

| Class (manifest categories, count) | What a description typically promises | Usual failure that breaks it | How the class is proven |
|---|---|---|---|
| Company records (`company-data` 32; `financial` 5, `finance` 3) | "Look up a company at the register by number or name", status, address, officers where published. | A register fetch fails and the answer is empty or "not found" (audit row 18, `cz-company-data`; row 20, `company-fundamentals`). | Reference entities per country (live, dissolved, collision) against the register itself (T2). |
| Screening and compliance (`compliance` 22) | Matches against sanctions, PEP, adverse media, VASP, insolvency, fines, with limitations. | A negative answer on an upstream failure (rows 1, 2, 3, 6). Compliance-category text corrections wait on Petter's approval (P-069). | Reference answers with recall, plus perturbation (T1, T2). |
| Validation (`validation` 45) | Format, checksum and registry checks for email, phone, IBAN, VAT, EORI, crypto addresses; descriptions already say "without confirming a mailbox exists" or "does not confirm an active account". | A resolver or service failure reads as invalid (rows 19, 38). The field name `valid` invites a stronger reading than the description gives. | Reference valid, invalid and borderline values; perturbation. |
| Domain, DNS, email-auth, security and monitoring (`developer-tools` 45 in part, `security` 10, `monitoring` 8, `web-intelligence` 7) | A computed read of DNS, TLS, headers, ports, SPF/DMARC, reputation, SEO. | A network error looks like a missing record or a bad score (rows 4, 9-13, 23, 25, 30, 31, 36, 37). | A DNS ETIMEOUT and a TCP refusal stub on every executor (T1). |
| Web reading and extraction (`data-extraction` 103 in part, `web-scraping` 9, `competitive-intelligence` 6, `document-extraction` 4) | Read one public page or document and return fields, per DEC-20261023-A. | A shell, cookie-wall or soft-block page returns empty fields (rows 5, 6, 14, 22, 32); the benchmark's `tech-stack-detect` case. | A `required_signal_fields` rule plus reference pages; a blocked-200 stub. |
| AI-assisted writing and analysis (`content-writing` 3, `text-processing` 4, `agent-tooling` 4, much of `data-extraction`) | A generated or extracted output, tagged `ai_generated` or `mixed`. | A wrong transparency tag (P-039); an invented detail. | A tag-versus-executor scan; golden outputs; per-flag source citation (P-028). |
| Data conversion and developer utilities (`data-processing` 19, `file-conversion` 6, `utility` 4, most `developer-tools`) | A deterministic transformation. | Low: input errors throw. | Known-answer and edge-case suites, which exist for every capability onboarded through the pipeline. |
| Crypto and on-chain (`web3` 17) | Validators, lookups, protocol fees, and the assurance verdict (P-029). | An RPC error reads as `verified:false` (row 35) or a missing leg (row 33). | Reference addresses; a forced RPC failure. |
| Trade, reference and market data (`trade` 1, `media` 1, parts of `finance`) | Duty rates, container tracking, exchange rates, holidays. | A shell page gives nulls with `anti_dumping:false` (row 22); a holiday API failure gives `is_business_day:true` (row 17). | Reference lookups; perturbation. |

## Promises made implicitly, by name and by listing

A customer, a benchmark or a directory reads a tool's name before its description.
Where our wording invites a stronger reading than the tool delivers, the gap is a
promise we did not intend to make. Each item below says where the wording lives and
what already narrows it; none changes a claim ruling.

1. **"Phone Validation" and "Email Validation".** The home page groups them under
   "Check details before acting" with "Email addresses, phone numbers, IBANs and EU
   VAT numbers", and `llms.txt` says "Check email addresses, phone numbers, IBAN
   format and EU VAT numbers". "Validation" and the output field `valid` read as
   "this number rings" and "this mailbox exists". The manifests narrow it
   ("without confirming activity", "without confirming a mailbox exists"), and
   `archive/receipts/2026-10-27-test-run-email-phone-validation-copy.json` records the
   last copy fix. The qualified "IBAN format" in `llms.txt` shows the pattern to
   copy for the other two. A directory category such as "email verification" will
   read our tool as a deliverability check; the benchmark case is that reading.
2. **"IBAN check" (home chip).** "Check" invites an account-exists reading;
   `iban-validate` is format and checksum only, and the claims register forbids
   saying otherwise. The chip text is the exposure, not the tool description.
3. **"EU VAT Validation".** Implies a live VIES answer. Results can be cached for 48
   hours and VIES can be down; the manifest says so, the title does not.
4. **"Company records from official sources in 25 countries".** Reads as 25
   national registers. Belgium is a vendor wrapper (CBEAPI.be), Spain, Germany and
   Brazil come through vendors, the US is SEC filers. The claims register already
   restricts the phrase; the home hero is where the over-read is strongest.
5. **"Sanctions Check", "PEP Check", "Screen companies and people".** Imply
   completeness. The Terms disclaim it; the tool page shows `is_sanctioned` as a
   boolean with `last_updated_at: null`.
6. **"KYB Complete ... Comprehensive verification ... Full compliance check".** Our
   own words in the bundle description, and the strongest implicit promise on the
   site: a customer will read "KYB complete" as "KYB done".
7. **"Verified compliance record".** The label on the audit page verifies the
   integrity chain, not the facts in the record; the Article statements beside it
   read as a compliance certificate.
8. **"Tested, with the results in the open" and "all tests passed" beside a tool
   name.** Read as "works on your input today". The tests are known-answer
   fixtures, health probes and real-traffic results, and "passed" is weak for the
   swallowed-failure tools (P-041).
9. **"Domain Reputation".** The name implies threat-intelligence data; the executor
   uses DNS, headers and name patterns, and the corrected text says so (fix in
   flight, P-038).
10. **"Tech Stack Detect", "MX Lookup", "Port Check", "Page Exists".** The names
    imply a read of the target; when the target cannot be read, the answer is an
    empty list, `has_mx:false` or `open:false` (audit rows 4, 14, 29, 30).
11. **x402 listings (Bazaar, 402 Index) and "pay per call".** Read as "pay only
    when the answer is good". Settlement waits for a usable result, which is the
    P-003 gap.
12. **"Insolvency Check" returning `found:false`.** Reads as "no proceedings"
    (audit row 3).

## Findings the orchestrator can act on now

These are defects found while reading, each with a repository fix path; none is
fixed in this change (docs only).

1. **P-001, P-003, P-061: wave 1 is the most urgent item in the program.** Rows 1 to
   3 of the audit (`vasp-verify`, `vasp-non-compliant-check`, `insolvency-check`)
   answer "clear" or "not found" for a failed upstream in the compliance family and
   deserve to go first. Until they ship, consider whether those three should answer
   as unavailable, which is a delisting-class decision inside the charter.
2. **P-039:** `env-template-generate` is live, tagged `algorithmic`, sourced to
   "Claude API", and its page says "no AI model writes the answer". Retag it
   `ai_generated` and publish (not a compliance-category row). `annual-report-extract`
   has the same mislabel and is not live; fix before it is relisted.
3. **P-038:** `dependency-audit` says "no external data" and "AI-based audit of
   declared dependencies" while it queries OSV.dev; correct the source text and the
   limitation.
4. **P-069:** compliance-category tools show older limitation text on the live site
   than their manifests carry. Measure the set and prepare one approval request for
   Petter, as was done for `domain-reputation`.
5. **P-053 and P-046 (Petter's text):** the Privacy Policy names Better Stack as a
   current sub-processor while production reports `log_sink_shipping: false`, its
   review date is 30 April 2026, and its retention paragraph disagrees with the
   Security page. Prepare the diff for Petter; do not edit.
6. **P-016:** the root `README.md` still says "an IP-based daily rate limit"; the
   allowance is monthly. A narrowing, so it is inside DEC-20260822-A.
7. **P-076 and P-081:** three contact addresses and a stale GitHub link in the API
   `llms.txt`.

## What the inventory does not cover

- Promises inside customer-specific agreements or emails (none are in the
  repository).
- Third-party pages Strale does not control, beyond what
  `docs/research/2026-11-06-distribution-listings-audit.md` already measured.
- The 358 individual manifests row by row; the class view stands in, and T6 of the
  program takes the highest-revenue and most-listed tools one at a time.
- Production revenue by tool: this session had no read access to it, so T6 opens
  by pulling it.

## Next

The program `docs/programs/promise-audit/PROGRAM.md` turns the status column into
work, in order of harm: money (T1), compliance answers (T2), evidence (T3), privacy
(T4), availability (T5), per-tool quality (T6), claims hygiene (T7). Every audit
result it produces is a receipt; when enough statuses change, a new dated
inventory supersedes this one.
