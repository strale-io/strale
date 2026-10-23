---
doc_type: creative-brief
authority_scope: none
program: brand-website
status: proposed-for-founder-review
date: 2026-10-23
---

# Three-level messaging — proposed

**Status: proposed, not adopted.** This proposes the benefit, what-it-does and feature lines for the new site, in the three-level model Petter uses for Cinver. Level 1 goes in the hero and the first section below it. Level 2 goes partly on the home page. Level 3 goes on the product pages. Page references point to [SITE-STRUCTURE.md](SITE-STRUCTURE.md). Nothing here is approved for publication; [claims.yaml](../../company/claims.yaml) governs every public claim, and the proof gaps listed at the end must close before the lines that depend on them ship.

## Who it is written for

The 23 October positioning report recommends one main story: official-source answers about European companies, paid per call, with the rest of the library behind the same connection. The reader is therefore:

- **First,** a developer or technical founder building an agent that deals with companies it doesn't know: onboarding suppliers or customers, paying invoices, screening counterparties, preparing company checks for a person to approve. Typically this is at a procurement, invoicing, marketplace or fintech-onboarding product.
- **Second,** a router or marketplace operator looking for European company data it cannot easily build itself.
- **Third,** anyone who needs everyday agent tools. That is who pays today, and the library line is written for them.

Words are chosen to stay inside what the system does. "Official register" and "record" describe the system. "Verified", "compliant", "trusted" and "receipt" are avoided:

- The first three are regulator-facing or adjective claims.
- "Receipt" is already the name of an internal record that customers cannot retrieve ([LAUNCH-PROOF.md](LAUNCH-PROOF.md)). Public copy says "record of the call".

## Level 1 — what the customer gains

1. **Your agent checks a company the moment it needs to, instead of waiting for someone to look it up.**
2. **Add a country without building another registry integration.**
3. **Every answer names the register it came from, so the person who signs off can check it.**
4. **Pay per check, only when it succeeds. No contract, no minimum.**

**Hero:** line 1 is the headline, and line 2 is the supporting line. Lines 3 and 4 open the benefits section (Home §2), each paired with one concrete job. Line 3 is under the proof gap below.

**Under the library-first alternative,** Level 1 would read: *Give your agent the tools it needs (search, documents, data checks, company lookups) through one connection, paid per call.* Company checks would become one line of Level 2.

## Level 2 — what it does

1. **Looks up a company in its national register and returns the record as structured data:** name, status, registration number, address, and directors or representatives where the register publishes them. Covers 19 European countries plus six elsewhere, read live.
2. **Screens a company or a person** against sanctions lists (including US, EU, UN and UK lists) and politically exposed person lists, and searches news for adverse media.
3. **Shows ownership where it is published:** UK persons with significant control, and parent and subsidiary links from the global LEI system.
4. **Checks who sent an invoice:** whether the issuing company is in the register, whether its VAT number is registered in the EU's VIES system, whether the IBAN is well-formed, and whether the issuer appears on a sanctions list.
5. **Runs a full company check in one call:** register, VAT, sanctions, PEP, adverse media, LEI and ownership where available. It returns a plain-language summary for a person to review.
6. **Keeps a record of each call:** the input, the answer, its source and the price, retrievable later by transaction ID.
7. **Gives the same agent everyday tools as well:** web search, web pages as clean text, text from images and PDFs, email and phone checks, translation. There are about 300 tools, each priced per call.

**Home page:** lines 1–5 (Home §3) and line 7 (Home §6). Line 6 is shown through the sample record (Home §4) once qualified. Use-case pages take the line that matches their job; the hub carries lines 1–5 in full.

## Level 3 — features

1. Pay per call; charged only when the call succeeds.
2. Two ways to pay: a prepaid wallet topped up by card, or USDC per request over x402, with no account, for eligible tools.
3. One API key and one balance for every tool.
4. Connect over MCP, the REST API, TypeScript and Python SDKs, or LangChain, CrewAI, Semantic Kernel and Composio packages.
5. A price cap on every call: a call never costs more than you allow.
6. Published limitations for every tool.
7. Live coverage by country, with the source, price and last test date for each register.
8. Free tools to try without signing up.
9. Dispute a result you believe is wrong.
10. Call inputs are redacted after 90 days.

**Pages:** all ten summarised on Pricing and Docs. Lines 1, 3, 4 and 8 also appear in one line at the top of the catalogue (Tools §1). Lines 5–7 appear per tool on tool and country pages. Lines 9–10 go on Security.

## Where each line appears, and what supports it

| Line | Page and section | Evidence | Claim status |
| --- | --- | --- | --- |
| L1.1 | Home §1 hero headline; About | Registry tools are synchronous per-call lookups (`apps/api/src/capabilities/*-company-data.ts`); `/v1/do` sync path | Plain description. No speed figure: `average-latency-claim` is forbidden. |
| L1.2 | Home §1 supporting line; Company data hub intro | 25 registers behind one API key and route; facts `countries.company_data_active` | Plain description. Each country still has its own input fields: never say "identical schema". |
| L1.3 | Home §2; country pages | `provenance.source` and `fetched_at` returned by executors; "Provenance included" | `provenance-included` **allowed, qualified**: only where the route returns it (see proof gaps). |
| L1.4 | Home §2; Pricing §1–3 | `apps/api/src/routes/x402-gateway-v2.settlement-order.test.ts`; DEC-14 | `pay-per-successful-call` **allowed**. "No contract, no minimum" is a plain description of the wallet and x402 model. |
| L2.1 | Home §3; hub §2; country pages | `/v1/capabilities` output schemas (directors or representatives present for AT, CZ, DE, EE, ES, FR, GR, LV, NO, SK, UK; absent for SE, PL and others); facts `countries` | Plain description. Count read live. Name lookup works only in some countries, so say "by registration number, and by name where supported". Four sources are vendor wrappers of the register (BE, ES, DE, BR): country pages name the actual source. |
| L2.2 | Home §3; hub §3; use case "screen a counterparty" | `sanctions-check`, `pep-check`, `adverse-media-check` manifests (Dilisense; Serper fallback for adverse media) | Plain description. Show the manifest limitations, for example fuzzy name matches. Do not claim "full", "complete" or "every list". |
| L2.3 | Home §3; hub §4 | `beneficial-ownership-lookup` (Companies House PSC), `gleif-l2-ubo-lookup`, `gleif-l2-children-lookup` | Plain description. "Where it is published" is required: there is no general EU beneficial-owner register access. |
| L2.4 | Home §3; use case "check who issued an invoice"; `invoice-verify-*` pages | `invoice-verify-{cc}` steps (`/v1/solutions`) | `iban-proves-account-active` and `full-vies-verification-implied` are **forbidden**: say "well-formed", not "exists"; say "registered in VIES" only where `vat-validate` runs. Avoid the bundle's own "fraud detection" wording in marketing copy. |
| L2.5 | Home §3; hub §5; `kyb-complete-*` pages | `kyb-complete-{cc}` steps; `risk-narrative-generate` is `ai_generated` | The summary is labelled AI-generated and "for a person to review" (DEC-20260428-B; Terms, human review). Never "decides", "approves" or "compliant". |
| L2.6 | Home §4 sample record; Docs §6 | `GET /v1/transactions/:id`; `compliance.access_endpoint` in audit bodies | **Proof gap:** customer retrieval is not yet qualified ([PROOF-QUALIFICATION.md](PROOF-QUALIFICATION.md)), and x402 responses carry no transaction ID. Publish as "for calls made with an API key" only after qualification. |
| L2.7 | Home §6; Tools §1 | `/v1/capabilities` (`google-search`, `serp-analyze`, `url-to-markdown`, `image-to-text`, `pdf-extract`, `email-validate`, `phone-validate`, `translate`) | "About 300" rendered from facts `active_visible`, never typed. No "every tool tested" (`every-tool-continuously-tested`, forbidden), so the report's "continuously tested" wording is dropped. |
| L3.1 | Pricing §3 | as L1.4 | `pay-per-successful-call` **allowed**. |
| L3.2 | Pricing §4; Docs x402 | `apps/api/src/lib/x402-gateway.ts`; `/x402/catalog` | `no-account-required-x402` is **needs_evidence**, true only on x402; `all-x402-coverage` is **forbidden**, so "eligible tools" is mandatory. |
| L3.3 | Tools §1; Pricing; Docs | `/v1/do` with one key for any `capability_slug`; wallet ledger | Plain description. |
| L3.4 | Tools §1; Docs §1 | `packages/mcp-server`, `sdk-typescript`, `sdk-python`; `node apps/api/scripts/check-framework-packages.mjs` passes for those four (run 2026-10-23) | `framework-native-integration` is **needs_evidence**: list only packages that pass. Never pydantic-ai, google-adk or openai-agents. |
| L3.5 | Tool pages; Docs §5 | `max_price_cents` in `apps/api/src/routes/do.ts` (required with an API key) | Plain description. On x402 the price is the quoted per-request price; say so on Docs. |
| L3.6 | Tool and country pages | all 350 manifests carry `limitations`; `/v1/public/ops/limitations/capabilities/:slug` | Plain description. |
| L3.7 | Company data hub §2 | `/v1/public/ops/trust/capabilities/batch` (`tested`, `last_tested_at`, `pass_rate`) | Show untested registers as untested. On 2026-10-23, six of 25 had no recorded test (CZ, EE, FI, FR, NO, US), and two showed below 100%. Never a badge or a score. |
| L3.8 | Home §8; Tools filter; Pricing §5 | facts `free_tier_slugs`; IP limit in `do.ts` | Plain description. The free count is read live. |
| L3.9 | Security §7; tool pages | `POST /v1/transactions/:id/dispute` (`apps/api/src/routes/dispute.ts`) | Plain description. |
| L3.10 | Security §2 | facts `pii_retention_days` (90) | Plain description, value read live. |

## Proof gaps to close before the dependent lines ship

1. **Record retrieval (L2.6; supports L1.3).** Complete the bounded authenticated call and own-record retrieval in [PROOF-QUALIFICATION.md](PROOF-QUALIFICATION.md), using a company lookup instead of the invoice image, which fits the recommended story. Until then, Home §4 shows a labelled example, and L2.6 is not published.
2. **Source on every route (L1.3).** Fresh x402 tool responses carry provenance in `_meta`; cached x402 replays and the solution paths do not establish the same thing. Either close that gap or keep the sentence to "calls made with an API key".
3. **Denmark bundles (L2.1, hub).** `kyb-essentials-dk` and its siblings say they confirm the company "in the official registry", but they have no registry step. Correct the bundle descriptions before the hub lists them.
4. **"Official register" wording.** Add a `needs_evidence` row to `claims.yaml` for "official register" / "official-source", with evidence being each country's `data_source`. Name the actual source on the country page wherever a vendor wraps the register.

## Lines deliberately not used

- "Trust layer", "verified data", "independently tested": the retired framing, contradicted by test coverage.
- "Every tool continuously tested": forbidden.
- Customer counts and "trusted by": forbidden.
- Speed figures: forbidden.
- "Compliant", "AMLR-ready": regulator-facing, Petter's call.
- "Hundreds of tools" as a headline: the report's weakest story; it stays as Level 2 line 7.
