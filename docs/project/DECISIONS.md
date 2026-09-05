---
doc_type: generated-decision-index
authority_scope: none
status: candidate
complete: false
phase: M2
m1_template: false
authority_active: false
verified_at: 2026-09-04
generated: true
---

# Decision Index (Candidate)

> [!CAUTION]
> **M2 CANDIDATE — NOT ACTIVE PROJECT AUTHORITY.**
> Review this candidate in place. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force until M4 cutover.

**PARTIAL GENERATED VIEW — `complete: false`.** The statuses below reproduce the formal decisions; they do not activate this index as project authority. Generated from `docs/decisions/records/DEC-*.md`.

The Decision column shows the historical display ID. Internal record keys are the unambiguous graph identities used for links and relationships; they differ from display IDs only when historical IDs collide.

## Active decisions

| Decision | Internal record key | Status | Topic | Scope | Owner | Decided |
|---|---|---|---|---|---|---|
| [`DEC-20260224-P-a1b2`](../decisions/records/DEC-20260224-P-a1b2.md) — Strategic Priority Hierarchy: Marketplace > Agent Quality > Seeding Volume | `DEC-20260224-P-a1b2` | active | `strategic-priority-hierarchy` | product | petter | 2026-02-24 |
| [`DEC-20260224-P-c3d4`](../decisions/records/DEC-20260224-P-c3d4.md) — First vertical: Market research & competitive intelligence | `DEC-20260224-P-c3d4` | active | `first-vertical-market-research` | product | petter | 2026-02-24 |
| [`DEC-20260224-P-e5f6`](../decisions/records/DEC-20260224-P-e5f6.md) — Platform differentiator is specialization + accountability + productization, not AI capability | `DEC-20260224-P-e5f6` | active | `platform-differentiator-specialization-accountability` | product | petter | 2026-02-24 |
| [`DEC-20260224-P-g7h8`](../decisions/records/DEC-20260224-P-g7h8.md) — Company and platform name: Strale (strale.io) | `DEC-20260224-P-g7h8` | active | `company-platform-name-strale` | product | petter | 2026-02-24 |
| [`DEC-20260225-P-a3b4`](../decisions/records/DEC-20260225-P-a3b4.md) — Revised seed capabilities post-review: Drop screenshot-url and eu-address-validate. Add vat-validate (€0.10) and annual-report-extract (€1.00). Raise invoice-extract from €0.30 to €0.50. | `DEC-20260225-P-a3b4` | active | `revised-seed-capabilities-post-review` | technical | petter | 2026-02-25 |
| [`DEC-20260225-P-e7f8`](../decisions/records/DEC-20260225-P-e7f8.md) — Post-MVP distribution: Build LangChain StraleFallbackTool as first post-validation feature. Single tool that drops into existing agent tool arrays and activates on failure. Primary distribution mechanism. | `DEC-20260225-P-e7f8` | active | `post-mvp-langchain-fallback-tool` | product | petter | 2026-02-25 |
| [`DEC-20260225-P-g9h0`](../decisions/records/DEC-20260225-P-g9h0.md) — Provider transition: Provider-lite contractor model before full marketplace. Recruit 5-10 devs manually, they provide scripts/API keys, Strale hosts everything, monthly bank transfer payouts. No escrow, no Connect, no provider dashboard. | `DEC-20260225-P-g9h0` | active | `provider-lite-contractor-model` | product | petter | 2026-02-25 |
| [`DEC-20260225-P-i1j2`](../decisions/records/DEC-20260225-P-i1j2.md) — Capability bundles: Offer multi-step compound capabilities (e.g. EU vendor onboarding = registry + VAT + address + invoice) as single strale.do() calls at higher price points. Creates higher AOV and more compelling pitch. | `DEC-20260225-P-i1j2` | active | `capability-bundles` | product | petter | 2026-02-25 |
| [`DEC-20260225-P-k3l4`](../decisions/records/DEC-20260225-P-k3l4.md) — Positioning: Global platform, EU/Nordic capability wedge. Brand, API, SDK, docs are global from day one. First 5 capabilities lean EU/Nordic (defensible edge). Geographic expansion through monthly capability additions and eventually through external providers from other regions. Reject both 'EU-only niche' and 'pretend global coverage.' | `DEC-20260225-P-k3l4` | active | `positioning-global-eu-nordic-wedge` | product | petter | 2026-02-25 |
| [`DEC-20260225-P-m1n2`](../decisions/records/DEC-20260225-P-m1n2.md) — MAJOR PIVOT — From CI product to commerce protocol. Strale is the MCP server for agent-to-agent transactions. | `DEC-20260225-P-m1n2` | active | `pivot-ci-product-to-commerce-protocol` | product | petter | 2026-02-25 |
| [`DEC-20260225-P-m5n6`](../decisions/records/DEC-20260225-P-m5n6.md) — Fuzzy natural-language input on Swedish company lookup via a cheap LLM call | `DEC-20260225-P-m5n6` | active | `swedish-company-data-fuzzy-input` | technical | petter | 2026-02-25 |
| [`DEC-20260225-P-o7p8`](../decisions/records/DEC-20260225-P-o7p8.md) — Month 2 capability: EU public procurement / TED lookup | `DEC-20260225-P-o7p8` | active | `ted-procurement-capability` | product | petter | 2026-02-25 |
| [`DEC-20260225-P-q3r4`](../decisions/records/DEC-20260225-P-q3r4.md) — Crypto: design for it, don't build it yet. Keypair identity from day one. No blockchain, tokens, or on-chain settlement in MVP. | `DEC-20260225-P-q3r4` | active | `crypto-design-for-it-keypair-identity` | technical | petter | 2026-02-25 |
| [`DEC-20260225-P-s5t6`](../decisions/records/DEC-20260225-P-s5t6.md) — Payment architecture: Stripe top-up wallet for MVP, stablecoin rails designed in but not exposed. Hybrid model long-term. | `DEC-20260225-P-s5t6` | active | `payment-architecture-stripe-wallet-stablecoin-rails` | technical | petter | 2026-02-25 |
| [`DEC-20260225-P-u7v8`](../decisions/records/DEC-20260225-P-u7v8.md) — Backend language: TypeScript. MCP SDK is TS-native, ecosystem alignment, seamless MCP server addition later. | `DEC-20260225-P-u7v8` | active | `backend-language-typescript` | technical | petter | 2026-02-25 |
| [`DEC-20260225-P-w9x0`](../decisions/records/DEC-20260225-P-w9x0.md) — MVP seed capabilities: 5 locked in. Swedish company data (€0.80), URL screenshot (€0.05), invoice/receipt extraction (€0.30), web page structured extraction (€0.15), EU address validation (€0.10). 3 of 5 use Puppeteer. EU/Nordic data access as wedge. | `DEC-20260225-P-w9x0` | active | `mvp-seed-capabilities-five-locked-in` | technical | petter | 2026-02-25 |
| [`DEC-20260225-P-y1z2`](../decisions/records/DEC-20260225-P-y1z2.md) — External review synthesis: 8 unanimous, 8 majority changes, 7 disagreements resolved | `DEC-20260225-P-y1z2` | active | `external-review-synthesis` | product | petter | 2026-02-25 |
| [`DEC-20260226-P-q1r2`](../decisions/records/DEC-20260226-P-q1r2.md) — Strale MVP live: API on Railway, straleio@0.1.0 on npm, 5 capabilities | `DEC-20260226-P-q1r2` | active | `mvp-launch-milestone` | technical | petter | 2026-02-26 |
| [`DEC-20260226-P-s3t4`](../decisions/records/DEC-20260226-P-s3t4.md) — EU AI Act compliance hooks on transactions: audit_trail, transparency_marker, data_jurisdiction | `DEC-20260226-P-s3t4` | active | `eu-ai-act-compliance-hooks` | technical | petter | 2026-02-26 |
| [`DEC-20260226-P-u5v6`](../decisions/records/DEC-20260226-P-u5v6.md) — Expanded to 13 capabilities across 5 categories | `DEC-20260226-P-u5v6` | active | `capability-catalog-13` | product | petter | 2026-02-26 |
| [`DEC-20260226-P-w7x8`](../decisions/records/DEC-20260226-P-w7x8.md) — Expanded to 35 capabilities: 19 European registries and more | `DEC-20260226-P-w7x8` | active | `capability-catalog-35` | product | petter | 2026-02-26 |
| [`DEC-20260227-P-a1b2`](../decisions/records/DEC-20260227-P-a1b2.md) — Provider Growth timeline accelerated: Phase 0 is 200+ capabilities at launch | `DEC-20260227-P-a1b2` | active | `provider-growth-phase-0-acceleration` | product | petter | 2026-02-27 |
| [`DEC-20260227-P-i9j0`](../decisions/records/DEC-20260227-P-i9j0.md) — Security architecture: provider-hosted execution is the permanent model | `DEC-20260227-P-i9j0` | active | `provider-hosted-execution-permanent` | technical | petter | 2026-02-27 |
| [`DEC-20260227-P-m3n4`](../decisions/records/DEC-20260227-P-m3n4.md) — Defer: developer tools, hackathons, BYOD referrals, narrow wedge strategy | `DEC-20260227-P-m3n4` | active | `provider-growth-deferred-strategies` | product | petter | 2026-02-27 |
| [`DEC-20260227-P-o5p6`](../decisions/records/DEC-20260227-P-o5p6.md) — Updated provider growth sequencing: Phase 0 now, 1 month 2, 2 month 3 to 4, 3 month 5 to 6 | `DEC-20260227-P-o5p6` | active | `provider-growth-phase-sequencing` | product | petter | 2026-02-27 |
| [`DEC-20260227-P-q7r8`](../decisions/records/DEC-20260227-P-q7r8.md) — Composable architecture: three spinnable units (Marketplace, Reputation Engine, Commerce Protocol) | `DEC-20260227-P-q7r8` | active | `composable-three-unit-architecture` | product | petter | 2026-02-27 |
| [`DEC-20260227-P-s9t0`](../decisions/records/DEC-20260227-P-s9t0.md) — Protocol integration scaling: Strale as a node in MCP, A2A and Visa TAP networks | `DEC-20260227-P-s9t0` | active | `protocol-node-scaling-strategy` | product | petter | 2026-02-27 |
| [`DEC-20260227-P-u1v2`](../decisions/records/DEC-20260227-P-u1v2.md) — Build sequence: 20-step dependency-ordered plan | `DEC-20260227-P-u1v2` | active | `build-sequence-20-step-plan` | product | petter | 2026-02-27 |
| [`DEC-20260302-A-0001`](../decisions/records/DEC-20260302-A-0001.md) — Capability Pricing Framework | `DEC-20260302-A-0001` | active | `capability-pricing-framework` | product | petter | 2026-03-02 |
| [`DEC-20260302-C`](../decisions/records/DEC-20260302-C.md) — Homepage leads with solutions and trust positioning, not infrastructure/API messaging | `DEC-20260302-C` | active | `homepage-solutions-first-positioning` | product | petter | 2026-03-02 |
| [`DEC-20260302-D`](../decisions/records/DEC-20260302-D.md) — External source dependencies tracked and monitored at platform level | `DEC-20260302-D` | active | `external-source-dependency-tracking` | technical | petter | 2026-03-02 |
| [`DEC-20260303-C`](../decisions/records/DEC-20260303-C.md) — Publish the ranking algorithm explanation; transparent ranking as a trust signal | `DEC-20260303-C` | active | `ranking-transparency` | product | petter | 2026-03-03 |
| [`DEC-20260305-E`](../decisions/records/DEC-20260305-E.md) — Web provider abstraction layer: all 47 scraping capabilities route through web-provider.ts | `DEC-20260305-E` | active | `web-provider-abstraction-layer` | technical | petter | 2026-03-05 |
| [`DEC-20260305-F`](../decisions/records/DEC-20260305-F.md) — Full test suite audit across 98 tests | `DEC-20260305-F` | active | `full-test-suite-audit-2026-03` | technical | petter | 2026-03-05 |
| [`DEC-20260305-G`](../decisions/records/DEC-20260305-G.md) — Trust display system rules: one chart, one calculation, one severity vocabulary, one narrative tone | `DEC-20260305-G` | active | `trust-display-system-rules` | product | petter | 2026-03-05 |
| [`DEC-20260306-D`](../decisions/records/DEC-20260306-D.md) — Metric display consistency across all surfaces: 6 issues identified and fixed | `DEC-20260306-D` | active | `metric-display-consistency` | product | petter | 2026-03-06 |
| [`DEC-20260306-G`](../decisions/records/DEC-20260306-G.md) — Design Strale Quality Score (SQS); resolved, see SQS Constitution | `DEC-20260306-G` | active | `sqs-design-spec` | technical | petter | 2026-03-06 |
| [`DEC-20260306-H`](../decisions/records/DEC-20260306-H.md) — Detail page section order: understand, try, trust, explore | `DEC-20260306-H` | active | `detail-page-section-order` | product | petter | 2026-03-07 |
| [`DEC-20260308-1`](../decisions/records/DEC-20260308-1.md) — Platform pricing currency: EUR (not USD) | `DEC-20260308-1` | active | `platform-pricing-currency` | product | petter | 2026-03-08 |
| [`DEC-20260309-G`](../decisions/records/DEC-20260309-G.md) — Mandatory Capability Onboarding Risk Framework: 12-category evaluation required for every new capability | `DEC-20260309-G` | active | `capability-onboarding-risk-framework` | technical | petter | 2026-03-09 |
| [`DEC-20260309-H`](../decisions/records/DEC-20260309-H.md) — Platform-wide legal disclaimer on predictive, advisory and financial capabilities; Terms of Service | `DEC-20260309-H` | active | `legal-disclaimer-and-terms` | product | petter | 2026-03-09 |
| [`DEC-20260310-E`](../decisions/records/DEC-20260310-E.md) — SQS quality/cost optimization spec created | `DEC-20260310-E` | active | `sqs-cost-optimization-spec` | technical | petter | 2026-03-10 |
| [`DEC-20260310-F`](../decisions/records/DEC-20260310-F.md) — Data completeness rule expanded to include test design validation | `DEC-20260310-F` | active | `data-completeness-rule-expansion` | technical | petter | 2026-03-10 |
| [`DEC-20260313-C`](../decisions/records/DEC-20260313-C.md) — Show 'Unverified' SQS with capability still listed | `DEC-20260313-C` | active | `unverified-sqs-capability-listing` | product | petter | 2026-03-13 |
| [`DEC-20260313-E`](../decisions/records/DEC-20260313-E.md) — Add "Trust" to the top-level navbar | `DEC-20260313-E` | active | `trust-navbar-link` | product | petter | 2026-03-13 |
| [`DEC-20260313-F`](../decisions/records/DEC-20260313-F.md) — Published to Official MCP Registry as io.github.strale-io/strale v0.1.1 | `DEC-20260313-F` | active | `mcp-registry-publication` | technical | petter | 2026-03-13 |
| [`DEC-20260314-A`](../decisions/records/DEC-20260314-A.md) — Communication gate at March 24: Sprint 9A to 9E, landing page review, Blog Post #1 draft before the first external post | `DEC-20260314-A` | active | `march-24-communication-gate` | product | petter | 2026-03-14 |
| [`DEC-20260314-B`](../decisions/records/DEC-20260314-B.md) — Blog on Dev.to first; strale.dev/blog deferred until 5+ posts exist | `DEC-20260314-B` | active | `blog-sequencing-devto-first` | product | petter | 2026-03-14 |
| [`DEC-20260314-C`](../decisions/records/DEC-20260314-C.md) — Continuous multi-LLM evaluation as Sprint 11, monthly cadence | `DEC-20260314-C` | active | `multi-llm-evaluation-cadence` | technical | petter | 2026-03-14 |
| [`DEC-20260314-F`](../decisions/records/DEC-20260314-F.md) — AX (Agent Experience) as first-class quality dimension: zero-auth MCP path, actionable errors, autonomous completion rate metric | `DEC-20260314-F` | active | `agent-experience-quality-dimension` | product | petter | 2026-03-14 |
| [`DEC-20260314-G`](../decisions/records/DEC-20260314-G.md) — Hero headline changed to "One API call. Verified data your agent can trust." | `DEC-20260314-G` | active | `hero-headline-verified-data` | product | petter | 2026-03-14 |
| [`DEC-20260315-A`](../decisions/records/DEC-20260315-A.md) — Sprint 9F elevated to immediate priority | `DEC-20260315-A` | active | `sprint-9f-immediate-priority` | technical | petter | 2026-03-15 |
| [`DEC-20260315-B`](../decisions/records/DEC-20260315-B.md) — Code pattern publishing starts Week 1 | `DEC-20260315-B` | active | `code-pattern-publishing-week-1` | product | petter | 2026-03-15 |
| [`DEC-20260315-H`](../decisions/records/DEC-20260315-H.md) — Launch clean with dual-profile model | `DEC-20260315-H` | active | `launch-clean-dual-profile-model` | product | petter | 2026-03-15 |
| [`DEC-20260315-I`](../decisions/records/DEC-20260315-I.md) — Upstream failures not billed, only successful executions charged | `DEC-20260315-I` | active | `upstream-failures-not-billed` | technical | petter | 2026-03-15 |
| [`DEC-20260316-A`](../decisions/records/DEC-20260316-A.md) — Eliminate Combined Trust Grade (A/B/C/D) from all surfaces | `DEC-20260316-A` | active | `eliminate-combined-trust-grade` | product | petter | 2026-03-16 |
| [`DEC-20260316-B`](../decisions/records/DEC-20260316-B.md) — SQS display hierarchy: number+word headline, QP/RP letters as secondary detail only | `DEC-20260316-B` | active | `sqs-display-hierarchy` | product | petter | 2026-03-16 |
| [`DEC-20260317-A`](../decisions/records/DEC-20260317-A.md) — Weekly digest plus interrupt email model, not daily, for platform health monitoring | `DEC-20260317-A` | active | `weekly-digest-interrupt-email-model` | technical | petter | 2026-03-17 |
| [`DEC-20260317-F`](../decisions/records/DEC-20260317-F.md) — Publication SQS threshold at or above 60, higher than the automated at or above 50 qualification gate | `DEC-20260317-F` | active | `publication-sqs-threshold-60` | product | petter | 2026-03-17 |
| [`DEC-20260317-G`](../decisions/records/DEC-20260317-G.md) — Third-party providers must submit test fixtures with known_answer data, non-negotiable | `DEC-20260317-G` | active | `provider-known-answer-fixtures-required` | technical | petter | 2026-03-17 |
| [`DEC-20260317-H`](../decisions/records/DEC-20260317-H.md) — Provider self-reported evidence weighted 0.5x against Strale independent tests at 1.0x | `DEC-20260317-H` | active | `provider-evidence-weighting-0-5x` | technical | petter | 2026-03-17 |
| [`DEC-20260318-A`](../decisions/records/DEC-20260318-A.md) — ALL new capabilities must use manifest-driven pipeline (scripts/onboard.ts), NEVER old seed.ts + onboarding hook | `DEC-20260318-A` | active | `capability-onboarding-pipeline-mandate` | technical | petter | 2026-03-18 |
| [`DEC-20260318-B`](../decisions/records/DEC-20260318-B.md) — Onboarding pipeline upgraded with --discover, --fix, and execute-and-verify | `DEC-20260318-B` | active | `capability-onboarding-pipeline-upgrades` | technical | petter | 2026-03-18 |
| [`DEC-20260320-A`](../decisions/records/DEC-20260320-A.md) — Capability onboarding hardening: auto-import executors, readiness checker as single enforcement gateway, output_field_reliability-aware test generation, seed guard + audit CLI | `DEC-20260320-A` | active | `capability-onboarding-hardening` | technical | petter | 2026-03-20 |
| [`DEC-20260320-E`](../decisions/records/DEC-20260320-E.md) — OpenSanctions standard Commercial API tier (EUR 0.10/call) confirmed for Strale reseller use | `DEC-20260320-E` | active | `opensanctions-commercial-api-pricing` | technical | petter | 2026-03-20 |
| [`DEC-20260320-F`](../decisions/records/DEC-20260320-F.md) — Raise compliance screening prices to EUR 0.25/call (sanctions-check, pep-check, adverse-media-check) for 60% margin on OpenSanctions EUR 0.10/call cost | `DEC-20260320-F` | active | `compliance-screening-pricing-margin` | product | petter | 2026-03-20 |
| [`DEC-20260321-A`](../decisions/records/DEC-20260321-A.md) — Solution batch endpoint: ORDER BY schedule_tier DESC for freshness checks | `DEC-20260321-A` | active | `solution-batch-freshness-tier-order` | technical | petter | 2026-03-21 |
| [`DEC-20260323-A`](../decisions/records/DEC-20260323-A.md) — All trust data served from DB columns; write-time decay only; one score everywhere | `DEC-20260323-A` | active | `trust-data-db-columns-write-time-decay` | technical | petter | 2026-03-23 |
| [`DEC-20260324-A`](../decisions/records/DEC-20260324-A.md) — Stripe x402 deposit mode is US-only; use the open x402 protocol (Coinbase CDP facilitator); no US entity via Atlas | `DEC-20260324-A` | active | `x402-rail-selection` | technical | petter | 2026-03-24 |
| [`DEC-20260324-C`](../decisions/records/DEC-20260324-C.md) — AgentCash is complementary, not competitive | `DEC-20260324-C` | active | `agentcash-positioning` | product | petter | 2026-03-24 |
| [`DEC-20260329-A`](../decisions/records/DEC-20260329-A.md) — 7-color data/accent palette for strale.dev dark mode | `DEC-20260329-A` | active | `seven-color-accent-palette-dark-mode` | product | petter | 2026-03-29 |
| [`DEC-20260330-B`](../decisions/records/DEC-20260330-B.md) — Shift distribution from 'be listed' to 'be embedded in coding workflow' via Context7, IDE rules, vibe-coding SEO | `DEC-20260330-B` | active | `distribution-embedding-strategy` | product | petter | 2026-03-30 |
| [`DEC-20260404-A`](../decisions/records/DEC-20260404-A.md) — Adopt Glama TDQS as a quality signal; rewrite strale-mcp tool descriptions | `DEC-20260404-A` | active | `glama-tdqs-adoption` | technical | petter | 2026-04-04 |
| [`DEC-20260405-A`](../decisions/records/DEC-20260405-A.md) — Migrate Swedish company data off Allabolag.se onto Bolagsverket official API | `DEC-20260405-A` | active | `swedish-company-data-bolagsverket-migration` | technical | petter | 2026-04-05 |
| [`DEC-20260411-A`](../decisions/records/DEC-20260411-A.md) — Capability pricing framework: price by cost structure, not by perceived value. Algorithmic = EUR 0.02, free API = EUR 0.02-0.05, Browserless = EUR 0.10-0.30, LLM = EUR 0.05-0.20, Browserless+LLM = EUR 0.15-0.50. | `DEC-20260411-A` | active | `capability-pricing-by-cost-structure` | product | petter | 2026-04-11 |
| [`DEC-20260411-B`](../decisions/records/DEC-20260411-B.md) — Gate 5: Path coverage enforcement in capability onboarding pipeline | `DEC-20260411-B` | active | `capability-onboarding-path-coverage` | technical | petter | 2026-04-11 |
| [`DEC-20260416-A`](../decisions/records/DEC-20260416-A.md) — strale-mcp and x402/Bazaar are complementary: developer vs runtime audiences | `DEC-20260416-A` | active | `mcp-x402-audience-split` | product | petter | 2026-04-16 |
| [`DEC-20260419-A`](../decisions/records/DEC-20260419-A.md) — Structured logging standard: Pino + request-context middleware, label kebab-case, named fields only | `DEC-20260419-A` | active | `structured-logging-standard` | technical | petter | 2026-04-19 |
| [`DEC-20260420-A`](../decisions/records/DEC-20260420-A.md) — Hand-write Drizzle migrations; abandon drizzle-kit generate | `DEC-20260420-A` | active | `hand-written-drizzle-migrations` | technical | petter | 2026-04-20 |
| [`DEC-20260421-J`](../decisions/records/DEC-20260421-J.md) — Capability retirement pattern (soft-deactivate + seed-file removal + distribution regen + preserve history) | `DEC-20260421-J` | active | `capability-retirement-pattern` | operational | petter | 2026-04-21 |
| [`DEC-20260421-L`](../decisions/records/DEC-20260421-L.md) — Park pattern (distinct from retirement) | `DEC-20260421-L` | active | `capability-park-pattern` | operational | petter | 2026-04-21 |
| [`DEC-20260425-B`](../decisions/records/DEC-20260425-B.md) — Audit builders read processing_location from RAILWAY_REPLICA_REGION runtime env var | `DEC-20260425-B` | active | `processing-location-railway-env-var` | technical | petter | 2026-04-21 |
| [`DEC-20260422-A`](../decisions/records/DEC-20260422-A--git-3b256587.md) — Distribution PR Integrity Protocol | `DEC-20260422-A--git-3b256587` | active | `distribution-pr-integrity` | global | petter | 2026-04-22 |
| [`DEC-20260422-B`](../decisions/records/DEC-20260422-B.md) — Retirement pattern refinement: tombstone for FK-bound capabilities | `DEC-20260422-B` | active | `retirement-pattern-tombstone-refinement` | operational | petter | 2026-04-22 |
| [`DEC-20260422-D`](../decisions/records/DEC-20260422-D.md) — Add typed attribution/license/license_url/source_note fields to RichProvenance; capabilities sourcing from open-data APIs (HVD etc.) must populate them | `DEC-20260422-D` | active | `rich-provenance-attribution-fields` | technical | petter | 2026-04-22 |
| [`DEC-20260423-A`](../decisions/records/DEC-20260423-A.md) — Close capability-onboarding bypasses with staged structural remediation | `DEC-20260423-A` | active | `capability-onboarding` | global | petter | 2026-04-23 |
| [`DEC-20260423-B`](../decisions/records/DEC-20260423-B.md) — Use the revised manifest-driven capability onboarding pipeline | `DEC-20260423-B` | active | `capability-onboarding` | global | petter | 2026-04-23 |
| [`DEC-20260424-A`](../decisions/records/DEC-20260424-A.md) — Require structural enforcement and read-back for always-enforce decisions | `DEC-20260424-A` | active | `structural-rule-enforcement` | global | petter | 2026-04-24 |
| [`DEC-20260425-A`](../decisions/records/DEC-20260425-A.md) — processing_location and data_jurisdiction semantics (Option B: narrow honest strings, manifest-declared jurisdictions) | `DEC-20260425-A` | active | `processing-location-data-jurisdiction-semantics` | technical | petter | 2026-04-25 |
| [`DEC-20260427-A`](../decisions/records/DEC-20260427-A.md) — Accept and disclose the measured adverse-media language coverage gap | `DEC-20260427-A` | active | `adverse-media-coverage` | product | petter | 2026-04-27 |
| [`DEC-20260427-B`](../decisions/records/DEC-20260427-B.md) — Use Dilisense for sanctions and PEP instead of OpenSanctions for the launch path | `DEC-20260427-B` | active | `screening-launch-vendor-selection` | technical | petter | 2026-04-27 |
| [`DEC-20260428-A`](../decisions/records/DEC-20260428-A.md) — Adopt a three-tier doctrine for third-party scraping | `DEC-20260428-A` | active | `third-party-scraping-doctrine` | global | petter | 2026-04-28 |
| [`DEC-20260428-B`](../decisions/records/DEC-20260428-B.md) — Set the engineering bar for Strale-built regulatory data services | `DEC-20260428-B` | active | `regulatory-data-service-engineering-bar` | global | petter | 2026-04-28 |
| [`DEC-20260429-A`](../decisions/records/DEC-20260429-A.md) — Keep sanctions and PEP on a Dilisense wrapper and defer self-hosting | `DEC-20260429-A` | active | `screening-self-host-deferral` | technical | petter | 2026-04-29 |
| [`DEC-20260430-A`](../decisions/records/DEC-20260430-A.md) — Canonicalize the April 2026 vendor stack through the Vendor Roster | `DEC-20260430-A` | active | `vendor-stack-governance` | global | petter | 2026-04-30 |
| [`DEC-20260502-A`](../decisions/records/DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6.md) — x402 uses the catalog (EUR) price converted at a single EUR_USD_RATE — no separate USD price tier | `DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6` | active | `x402-catalog-price-parity` | global | petter | 2026-05-02 |
| [`DEC-20260504-A`](../decisions/records/DEC-20260504-A.md) — Require regression coverage for audit follow-up and money-critical code paths | `DEC-20260504-A` | active | `audit-follow-up-test-coverage` | global | petter | 2026-05-04 |
| [`DEC-20260504-B`](../decisions/records/DEC-20260504-B.md) — Require a controlled workload-resumption plan for long-silent bulk operations | `DEC-20260504-B` | active | `deploy-safety` | global | petter | 2026-05-04 |
| [`DEC-20260504-C`](../decisions/records/DEC-20260504-C.md) — Verify deploy-pipeline reachability and the resulting production effect | `DEC-20260504-C` | active | `deploy-safety` | global | petter | 2026-05-04 |
| [`DEC-20260505-G`](../decisions/records/DEC-20260505-G.md) — Implisense: Backup-tier placement; complementary live-data route, not primary | `DEC-20260505-G` | active | `implisense-backup-tier-placement` | technical | petter | 2026-05-05 |
| [`DEC-20260505-H`](../decisions/records/DEC-20260505-H.md) — OpenRegister: integrate on Free tier first; defer Pro commitment until audit-retention terms confirmed in writing | `DEC-20260505-H` | active | `openregister-free-tier-integration` | technical | petter | 2026-05-05 |
| [`DEC-20260506-G`](../decisions/records/DEC-20260506-G.md) — No-fixed-cost stance for early-stage v1 vendor sequencing | `DEC-20260506-G` | active | `no-fixed-cost-vendor-sequencing` | product | petter | 2026-05-06 |
| [`DEC-20260507-D`](../decisions/records/DEC-20260507-D.md) — Strale does not offer a BYO-credentials (bring-your-own) product pattern across any evidence type; counterparty data is sourced via Strale-held vendor relationships only | `DEC-20260507-D` | active | `no-byo-credentials-product-pattern` | product | petter | 2026-05-07 |
| [`DEC-20260507-E`](../decisions/records/DEC-20260507-E.md) — OpenRegister Pro tier (EUR 59/month) is the planned subscription path when Counterparty Assurance v1 launches with meaningful customer traffic; Free tier covers integration testing and pre-launch validation only | `DEC-20260507-E` | active | `openregister-pro-tier-subscription-path` | technical | petter | 2026-05-07 |
| [`DEC-20260507-F`](../decisions/records/DEC-20260507-F.md) — Kyckr - skip for v1; revisit only on (i) every gap-5 direct-Tier-1 path verified not viable AND (ii) paying customer attached AND (iii) confirmed sub-EUR 100/month partner-tier floor | `DEC-20260507-F` | active | `kyckr-skip-for-v1` | technical | petter | 2026-05-07 |
| [`DEC-20260507-G`](../decisions/records/DEC-20260507-G.md) — BG and CY default to direct Tier-1 self-build via national open-data portals as primary identity providers (BG: data.egov.bg BRRA XML CC-0; CY: data.gov.cy DRCOR CC-BY) | `DEC-20260507-G` | active | `bg-cy-tier1-self-build` | technical | petter | 2026-05-07 |
| [`DEC-20260507-H`](../decisions/records/DEC-20260507-H.md) — LU and HU remain in gap-recovery deferred status pending Openapi case 151296 outcome and/or revenue-justified per-country vendor contracts; no multi-country aggregator backup remains after DEC-20260507-F Kyckr rejection | `DEC-20260507-H` | active | `lu-hu-gap-recovery-deferred` | technical | petter | 2026-05-07 |
| [`DEC-20260508-A`](../decisions/records/DEC-20260508-A.md) — HU gap status refined: OCCSZ Disztributor channel is Tier-1 redistribution-authorised but blocked on EUR 357/mo fixed minimum; revival triggers tightened to >=1,000 HU calls/mo forecast or EU-wide distributor amortisation play. Refines HU portion of DEC-20260507-H; LU portion unchanged. | `DEC-20260508-A` | active | `hu-occsz-distributor-channel-refinement` | technical | petter | 2026-05-08 |
| [`DEC-20260508-D`](../decisions/records/DEC-20260508-D.md) — OpenRegister DE: audit-retention written confirmation received (Pro/Business subscription-bound; Enterprise EUR 1k/mo 6-month minimum for perpetual). Pro path confirmed as v1 ship target via Strale100 trial; subscription-bound retention accepted as known constraint until Enterprise upgrade keyed to revenue/customer demand. | `DEC-20260508-D` | active | `openregister-de-audit-retention-confirmed` | technical | petter | 2026-05-08 |
| [`DEC-20260511-C`](../decisions/records/DEC-20260511-C.md) — In-TS startup-migrations as the official schema-change convention | `DEC-20260511-C` | active | `startup-migrations-convention` | technical | petter | 2026-05-11 |
| [`DEC-20260511-D`](../decisions/records/DEC-20260511-D.md) — Require production vendor evaluations to follow an evolving empirical methodology | `DEC-20260511-D` | active | `vendor-evaluation` | global | petter | 2026-05-11 |
| [`DEC-20260513-E`](../decisions/records/DEC-20260513-E.md) — Normalize HR + CH customer prices to EUR 0.05; flag EUR 0.80 cluster as stranded legacy pricing | `DEC-20260513-E` | active | `hr-ch-price-normalization` | product | petter | 2026-05-13 |
| [`DEC-20260515-A`](../decisions/records/DEC-20260515-A.md) — Upgrade US from v1.1 to v1 launch scope for Counterparty Assurance (registry/EIN/litigation); bank verification remains v1.2 | `DEC-20260515-A` | active | `us-counterparty-assurance-v1-scope` | product | petter | 2026-05-15 |
| [`DEC-20260515-B`](../decisions/records/DEC-20260515-B.md) — US v1 per-state Tier-1/Tier-2 classification: 7 Tier 1 direct capabilities, 8 states routed through Cobalt Tier 2 | `DEC-20260515-B` | active | `us-per-state-tier-classification` | technical | petter | 2026-05-15 |
| [`DEC-20260515-C`](../decisions/records/DEC-20260515-C.md) — Openapi WW-Top NOT integrated for SI v1; SI ships on existing data.gov.si CKAN with documented directors gap per DEC-20260513-F | `DEC-20260515-C` | active | `si-openapi-integration-decision` | technical | petter | 2026-05-15 |
| [`DEC-20260517-A`](../decisions/records/DEC-20260517-A.md) — Make repository YAML canonical for structured Provider-Coverage reference data | `DEC-20260517-A` | active | `reference-data-authority` | global | petter | 2026-05-17 |
| [`DEC-20260518-A`](../decisions/records/DEC-20260518-A.md) — Evidence Tier framework for Counterparty Assurance v1: locks the customer-facing data contract at field level | `DEC-20260518-A` | active | `evidence-tier-framework` | product | petter | 2026-05-18 |
| [`DEC-20260518-B`](../decisions/records/DEC-20260518-B.md) — Counterparty Assurance use-case tier framework (T1 Continuity / T2 Onboarding / T3 Enhanced Due Diligence) | `DEC-20260518-B` | active | `use-case-tier-framework` | product | petter | 2026-05-18 |
| [`DEC-20260518-C`](../decisions/records/DEC-20260518-C.md) — T1 Continuity bank verification optional, not required (Path A doctrine fix) | `DEC-20260518-C` | active | `t1-bank-verification-optional` | product | petter | 2026-05-18 |
| [`DEC-20260518-D`](../decisions/records/DEC-20260518-D.md) — ubo_availability flag semantics: capability state, not jurisdictional state | `DEC-20260518-D` | active | `ubo-availability-semantics` | technical | petter | 2026-05-18 |
| [`DEC-20260518-E`](../decisions/records/DEC-20260518-E.md) — Require exhaustive source enumeration before declaring a country path blocked | `DEC-20260518-E` | active | `source-enumeration` | global | petter | 2026-05-18 |
| [`DEC-20260518-F`](../decisions/records/DEC-20260518-F.md) — Clarify data sourcing to permit constrained per-call public-registry parsing | `DEC-20260518-F` | active | `data-sourcing-principles` | global | petter | 2026-05-18 |
| [`DEC-20260518-G`](../decisions/records/DEC-20260518-G.md) — Probe hidden fixed-cost commitments before treating RFQ pricing as viable | `DEC-20260518-G` | active | `source-enumeration` | global | petter | 2026-05-18 |
| [`DEC-20260812-A`](../decisions/records/DEC-20260812-A.md) — Adopt the Platform Readiness and Self-Operation program | `DEC-20260812-A` | active | `autonomous-operating-model` | global | petter | 2026-08-12 |
| [`DEC-20260813-A`](../decisions/records/DEC-20260813-A.md) — Affirm constrained per-call parsing as the scraping doctrine interpretation | `DEC-20260813-A` | active | `scraping-doctrine-interpretation` | global | petter | 2026-08-13 |
| [`DEC-20260815-A`](../decisions/records/DEC-20260815-A.md) — Adopt the operating charter and delegate day-to-day technical operations | `DEC-20260815-A` | active | `autonomous-operating-model` | global | petter | 2026-08-15 |
| [`DEC-20260820-A-WEBSITE-HERO`](../decisions/records/DEC-20260820-A-WEBSITE-HERO.md) — Optical Reach hero with contract-backed product proof | `DEC-20260820-A-WEBSITE-HERO` | active | `website-homepage-hero` | design | petter | 2026-08-20 |
| [`DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN`](../decisions/records/DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md) — Website homepage integration-burden section approved | `DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN` | active | `website-homepage-integration-section` | design | petter | 2026-08-20 |
| [`DEC-20260820-C-WEBSITE-COMPANY-RESEARCH`](../decisions/records/DEC-20260820-C-WEBSITE-COMPANY-RESEARCH.md) — Website Company Research use-case world approved | `DEC-20260820-C-WEBSITE-COMPANY-RESEARCH` | active | `website-use-case-worlds` | design | petter | 2026-08-20 |
| [`DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION`](../decisions/records/DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md) — Website Enrichment & Validation use-case world approved | `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION` | active | `website-use-case-worlds` | design | petter | 2026-08-20 |
| [`DEC-20260820-E-WEBSITE-SEARCH-WEB`](../decisions/records/DEC-20260820-E-WEBSITE-SEARCH-WEB.md) — Website Search & Web Intelligence use-case world approved | `DEC-20260820-E-WEBSITE-SEARCH-WEB` | active | `website-use-case-worlds` | design | petter | 2026-08-20 |
| [`DEC-20260820-F-WEBSITE-RISK-RESPONSIVE`](../decisions/records/DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md) — Approve Execution Coral and four-world responsive conformance | `DEC-20260820-F-WEBSITE-RISK-RESPONSIVE` | active | `website-use-case-worlds` | design | petter | 2026-08-20 |
| [`DEC-20260822-A`](../decisions/records/DEC-20260822-A.md) — Reform daily operations with two artifacts, wider autonomy, and failure families | `DEC-20260822-A` | active | `autonomous-operating-model` | global | petter | 2026-08-22 |
| [`DEC-20260827-A`](../decisions/records/DEC-20260827-A.md) — austrian-company-data migrates to the official Firmenbuch via JustizOnline IWG/HVD API | `DEC-20260827-A` | active | `registry-integration` | global | petter | 2026-08-27 |
| [`DEC-20260901-A`](../decisions/records/DEC-20260901-A.md) — Treat the context pack as complete founder input and make reconciliation M2 work | `DEC-20260901-A` | active | `project-memory-system-of-record` | global | petter | 2026-09-01 |
| [`DEC-20260904-A`](../decisions/records/DEC-20260904-A.md) — Pre-readiness feature-scoped M2 decision rows are evidence-only | `DEC-20260904-A` | active | `m2-closure-register-classification` | operational | claude | 2026-09-04 |
| [`DEC-20260904-B`](../decisions/records/DEC-20260904-B.md) — Cross-surface identity mechanism for the M2 closure register (git-qualified record keys) | `DEC-20260904-B` | active | `m2-closure-register-cross-surface-identity` | operational | claude | 2026-09-04 |

## Non-active decisions

| Decision | Internal record key | Status | Topic | Scope | Owner | Decided |
|---|---|---|---|---|---|---|
| [`DEC-20260320-B`](../decisions/records/DEC-20260320-B.md) — Require the onboarding pipeline for every capability change | `DEC-20260320-B` | superseded | `capability-onboarding` | global | petter | 2026-03-20 |
| [`DEC-20260422-C`](../decisions/records/DEC-20260422-C.md) — Investigate capability creation paths after discovering pipeline gaps | `DEC-20260422-C` | superseded | `capability-onboarding` | global | petter | 2026-04-22 |
| [`DEC-20260503-A`](../decisions/records/DEC-20260503-A.md) — Split the public product and capability surfaces while keeping one backend | `DEC-20260503-A` | superseded | `public-surface-architecture` | global | petter | 2026-05-03 |
| [`DEC-20260831-A`](../decisions/records/DEC-20260831-A.md) — Adopt a staged repo-native operating model for Strale | `DEC-20260831-A` | superseded | `project-memory-system-of-record` | operational | petter | 2026-08-31 |

## Generated inverse relationships

| Target | Target key | Generated inverse | Source | Source key |
|---|---|---|---|---|
| [`DEC-20260224-P-c3d4`](../decisions/records/DEC-20260224-P-c3d4.md) | `DEC-20260224-P-c3d4` | `amended_by` | [`DEC-20260225-P-m1n2`](../decisions/records/DEC-20260225-P-m1n2.md) | `DEC-20260225-P-m1n2` |
| [`DEC-20260225-P-a3b4`](../decisions/records/DEC-20260225-P-a3b4.md) | `DEC-20260225-P-a3b4` | `related_from` | [`DEC-20260225-P-y1z2`](../decisions/records/DEC-20260225-P-y1z2.md) | `DEC-20260225-P-y1z2` |
| [`DEC-20260225-P-g9h0`](../decisions/records/DEC-20260225-P-g9h0.md) | `DEC-20260225-P-g9h0` | `related_from` | [`DEC-20260227-P-o5p6`](../decisions/records/DEC-20260227-P-o5p6.md) | `DEC-20260227-P-o5p6` |
| [`DEC-20260225-P-m5n6`](../decisions/records/DEC-20260225-P-m5n6.md) | `DEC-20260225-P-m5n6` | `related_from` | [`DEC-20260226-P-q1r2`](../decisions/records/DEC-20260226-P-q1r2.md) | `DEC-20260226-P-q1r2` |
| [`DEC-20260225-P-w9x0`](../decisions/records/DEC-20260225-P-w9x0.md) | `DEC-20260225-P-w9x0` | `amended_by` | [`DEC-20260225-P-a3b4`](../decisions/records/DEC-20260225-P-a3b4.md) | `DEC-20260225-P-a3b4` |
| [`DEC-20260226-P-q1r2`](../decisions/records/DEC-20260226-P-q1r2.md) | `DEC-20260226-P-q1r2` | `related_from` | [`DEC-20260225-P-m5n6`](../decisions/records/DEC-20260225-P-m5n6.md) | `DEC-20260225-P-m5n6` |
| [`DEC-20260227-P-a1b2`](../decisions/records/DEC-20260227-P-a1b2.md) | `DEC-20260227-P-a1b2` | `amended_by` | [`DEC-20260227-P-o5p6`](../decisions/records/DEC-20260227-P-o5p6.md) | `DEC-20260227-P-o5p6` |
| [`DEC-20260227-P-q7r8`](../decisions/records/DEC-20260227-P-q7r8.md) | `DEC-20260227-P-q7r8` | `amended_by` | [`DEC-20260227-P-s9t0`](../decisions/records/DEC-20260227-P-s9t0.md) | `DEC-20260227-P-s9t0` |
| [`DEC-20260227-P-s9t0`](../decisions/records/DEC-20260227-P-s9t0.md) | `DEC-20260227-P-s9t0` | `related_from` | [`DEC-20260227-P-u1v2`](../decisions/records/DEC-20260227-P-u1v2.md) | `DEC-20260227-P-u1v2` |
| [`DEC-20260302-A-0001`](../decisions/records/DEC-20260302-A-0001.md) | `DEC-20260302-A-0001` | `amended_by` | [`DEC-20260411-A`](../decisions/records/DEC-20260411-A.md) | `DEC-20260411-A` |
| [`DEC-20260314-A`](../decisions/records/DEC-20260314-A.md) | `DEC-20260314-A` | `related_from` | [`DEC-20260314-B`](../decisions/records/DEC-20260314-B.md) | `DEC-20260314-B` |
| [`DEC-20260314-B`](../decisions/records/DEC-20260314-B.md) | `DEC-20260314-B` | `related_from` | [`DEC-20260314-A`](../decisions/records/DEC-20260314-A.md) | `DEC-20260314-A` |
| [`DEC-20260320-B`](../decisions/records/DEC-20260320-B.md) | `DEC-20260320-B` | `related_from` | [`DEC-20260405-A`](../decisions/records/DEC-20260405-A.md) | `DEC-20260405-A` |
| [`DEC-20260320-B`](../decisions/records/DEC-20260320-B.md) | `DEC-20260320-B` | `superseded_by` | [`DEC-20260423-B`](../decisions/records/DEC-20260423-B.md) | `DEC-20260423-B` |
| [`DEC-20260420-A`](../decisions/records/DEC-20260420-A.md) | `DEC-20260420-A` | `affirmed_by` | [`DEC-20260511-C`](../decisions/records/DEC-20260511-C.md) | `DEC-20260511-C` |
| [`DEC-20260421-J`](../decisions/records/DEC-20260421-J.md) | `DEC-20260421-J` | `amended_by` | [`DEC-20260422-B`](../decisions/records/DEC-20260422-B.md) | `DEC-20260422-B` |
| [`DEC-20260421-J`](../decisions/records/DEC-20260421-J.md) | `DEC-20260421-J` | `related_from` | [`DEC-20260421-L`](../decisions/records/DEC-20260421-L.md) | `DEC-20260421-L` |
| [`DEC-20260422-C`](../decisions/records/DEC-20260422-C.md) | `DEC-20260422-C` | `superseded_by` | [`DEC-20260423-A`](../decisions/records/DEC-20260423-A.md) | `DEC-20260423-A` |
| [`DEC-20260423-A`](../decisions/records/DEC-20260423-A.md) | `DEC-20260423-A` | `related_from` | [`DEC-20260423-B`](../decisions/records/DEC-20260423-B.md) | `DEC-20260423-B` |
| [`DEC-20260425-B`](../decisions/records/DEC-20260425-B.md) | `DEC-20260425-B` | `affirmed_by` | [`DEC-20260425-A`](../decisions/records/DEC-20260425-A.md) | `DEC-20260425-A` |
| [`DEC-20260427-A`](../decisions/records/DEC-20260427-A.md) | `DEC-20260427-A` | `related_from` | [`DEC-20260427-B`](../decisions/records/DEC-20260427-B.md) | `DEC-20260427-B` |
| [`DEC-20260428-A`](../decisions/records/DEC-20260428-A.md) | `DEC-20260428-A` | `affirmed_by` | [`DEC-20260507-F`](../decisions/records/DEC-20260507-F.md) | `DEC-20260507-F` |
| [`DEC-20260428-A`](../decisions/records/DEC-20260428-A.md) | `DEC-20260428-A` | `affirmed_by` | [`DEC-20260507-G`](../decisions/records/DEC-20260507-G.md) | `DEC-20260507-G` |
| [`DEC-20260428-A`](../decisions/records/DEC-20260428-A.md) | `DEC-20260428-A` | `interpreted_by` | [`DEC-20260518-F`](../decisions/records/DEC-20260518-F.md) | `DEC-20260518-F` |
| [`DEC-20260428-A`](../decisions/records/DEC-20260428-A.md) | `DEC-20260428-A` | `interpreted_by` | [`DEC-20260813-A`](../decisions/records/DEC-20260813-A.md) | `DEC-20260813-A` |
| [`DEC-20260428-A`](../decisions/records/DEC-20260428-A.md) | `DEC-20260428-A` | `related_from` | [`DEC-20260428-B`](../decisions/records/DEC-20260428-B.md) | `DEC-20260428-B` |
| [`DEC-20260428-A`](../decisions/records/DEC-20260428-A.md) | `DEC-20260428-A` | `related_from` | [`DEC-20260429-A`](../decisions/records/DEC-20260429-A.md) | `DEC-20260429-A` |
| [`DEC-20260428-A`](../decisions/records/DEC-20260428-A.md) | `DEC-20260428-A` | `related_from` | [`DEC-20260430-A`](../decisions/records/DEC-20260430-A.md) | `DEC-20260430-A` |
| [`DEC-20260428-B`](../decisions/records/DEC-20260428-B.md) | `DEC-20260428-B` | `related_from` | [`DEC-20260429-A`](../decisions/records/DEC-20260429-A.md) | `DEC-20260429-A` |
| [`DEC-20260428-B`](../decisions/records/DEC-20260428-B.md) | `DEC-20260428-B` | `related_from` | [`DEC-20260430-A`](../decisions/records/DEC-20260430-A.md) | `DEC-20260430-A` |
| [`DEC-20260430-A`](../decisions/records/DEC-20260430-A.md) | `DEC-20260430-A` | `amended_by` | [`DEC-20260515-A`](../decisions/records/DEC-20260515-A.md) | `DEC-20260515-A` |
| [`DEC-20260502-A`](../decisions/records/DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6.md) | `DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6` | `related_from` | [`DEC-20260308-1`](../decisions/records/DEC-20260308-1.md) | `DEC-20260308-1` |
| [`DEC-20260503-A`](../decisions/records/DEC-20260503-A.md) | `DEC-20260503-A` | `superseded_by` | [`DEC-20260812-A`](../decisions/records/DEC-20260812-A.md) | `DEC-20260812-A` |
| [`DEC-20260504-B`](../decisions/records/DEC-20260504-B.md) | `DEC-20260504-B` | `related_from` | [`DEC-20260504-C`](../decisions/records/DEC-20260504-C.md) | `DEC-20260504-C` |
| [`DEC-20260505-H`](../decisions/records/DEC-20260505-H.md) | `DEC-20260505-H` | `amended_by` | [`DEC-20260508-D`](../decisions/records/DEC-20260508-D.md) | `DEC-20260508-D` |
| [`DEC-20260505-H`](../decisions/records/DEC-20260505-H.md) | `DEC-20260505-H` | `related_from` | [`DEC-20260505-G`](../decisions/records/DEC-20260505-G.md) | `DEC-20260505-G` |
| [`DEC-20260506-G`](../decisions/records/DEC-20260506-G.md) | `DEC-20260506-G` | `affirmed_by` | [`DEC-20260507-E`](../decisions/records/DEC-20260507-E.md) | `DEC-20260507-E` |
| [`DEC-20260506-G`](../decisions/records/DEC-20260506-G.md) | `DEC-20260506-G` | `related_from` | [`DEC-20260507-F`](../decisions/records/DEC-20260507-F.md) | `DEC-20260507-F` |
| [`DEC-20260506-G`](../decisions/records/DEC-20260506-G.md) | `DEC-20260506-G` | `related_from` | [`DEC-20260507-H`](../decisions/records/DEC-20260507-H.md) | `DEC-20260507-H` |
| [`DEC-20260507-F`](../decisions/records/DEC-20260507-F.md) | `DEC-20260507-F` | `related_from` | [`DEC-20260507-H`](../decisions/records/DEC-20260507-H.md) | `DEC-20260507-H` |
| [`DEC-20260507-H`](../decisions/records/DEC-20260507-H.md) | `DEC-20260507-H` | `amended_by` | [`DEC-20260508-A`](../decisions/records/DEC-20260508-A.md) | `DEC-20260508-A` |
| [`DEC-20260515-A`](../decisions/records/DEC-20260515-A.md) | `DEC-20260515-A` | `affirmed_by` | [`DEC-20260515-B`](../decisions/records/DEC-20260515-B.md) | `DEC-20260515-B` |
| [`DEC-20260518-A`](../decisions/records/DEC-20260518-A.md) | `DEC-20260518-A` | `related_from` | [`DEC-20260518-B`](../decisions/records/DEC-20260518-B.md) | `DEC-20260518-B` |
| [`DEC-20260518-B`](../decisions/records/DEC-20260518-B.md) | `DEC-20260518-B` | `amended_by` | [`DEC-20260518-C`](../decisions/records/DEC-20260518-C.md) | `DEC-20260518-C` |
| [`DEC-20260518-E`](../decisions/records/DEC-20260518-E.md) | `DEC-20260518-E` | `amended_by` | [`DEC-20260518-G`](../decisions/records/DEC-20260518-G.md) | `DEC-20260518-G` |
| [`DEC-20260518-F`](../decisions/records/DEC-20260518-F.md) | `DEC-20260518-F` | `affirmed_by` | [`DEC-20260813-A`](../decisions/records/DEC-20260813-A.md) | `DEC-20260813-A` |
| [`DEC-20260812-A`](../decisions/records/DEC-20260812-A.md) | `DEC-20260812-A` | `amended_by` | [`DEC-20260815-A`](../decisions/records/DEC-20260815-A.md) | `DEC-20260815-A` |
| [`DEC-20260815-A`](../decisions/records/DEC-20260815-A.md) | `DEC-20260815-A` | `amended_by` | [`DEC-20260822-A`](../decisions/records/DEC-20260822-A.md) | `DEC-20260822-A` |
| [`DEC-20260820-C-WEBSITE-COMPANY-RESEARCH`](../decisions/records/DEC-20260820-C-WEBSITE-COMPANY-RESEARCH.md) | `DEC-20260820-C-WEBSITE-COMPANY-RESEARCH` | `related_from` | [`DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION`](../decisions/records/DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md) | `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION` |
| [`DEC-20260820-C-WEBSITE-COMPANY-RESEARCH`](../decisions/records/DEC-20260820-C-WEBSITE-COMPANY-RESEARCH.md) | `DEC-20260820-C-WEBSITE-COMPANY-RESEARCH` | `related_from` | [`DEC-20260820-F-WEBSITE-RISK-RESPONSIVE`](../decisions/records/DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md) | `DEC-20260820-F-WEBSITE-RISK-RESPONSIVE` |
| [`DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION`](../decisions/records/DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md) | `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION` | `related_from` | [`DEC-20260820-F-WEBSITE-RISK-RESPONSIVE`](../decisions/records/DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md) | `DEC-20260820-F-WEBSITE-RISK-RESPONSIVE` |
| [`DEC-20260820-E-WEBSITE-SEARCH-WEB`](../decisions/records/DEC-20260820-E-WEBSITE-SEARCH-WEB.md) | `DEC-20260820-E-WEBSITE-SEARCH-WEB` | `related_from` | [`DEC-20260820-F-WEBSITE-RISK-RESPONSIVE`](../decisions/records/DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md) | `DEC-20260820-F-WEBSITE-RISK-RESPONSIVE` |
| [`DEC-20260831-A`](../decisions/records/DEC-20260831-A.md) | `DEC-20260831-A` | `superseded_by` | [`DEC-20260901-A`](../decisions/records/DEC-20260901-A.md) | `DEC-20260901-A` |

## Resolved historical ID collisions

Resolved collisions retain their historical display IDs. Formal records use source-qualified internal keys; documented-only rows remain preserved in `docs/decisions/id-collisions.yaml`.

| Historical ID | Formal record keys | Documented-only rows | Implementation | Resolution evidence |
|---|---|---:|---|---|
| `DEC-20260502-A` | `DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6` | 1 | `drift-open` | [report](../../archive/sessions/2026-09-01-decision-collision-resolution-DEC-20260502-A.md) |

### Forward migration-state corrections

- `DEC-20260502-A`: [`DEC-20260812-A`](../decisions/records/DEC-20260812-A.md) previously described this ID as withheld. That sentence records the prior M2 migration state; the resolved registry and linked report above are current. The target decision's product and operating substance is unchanged.

## Unresolved historical ID collisions

These IDs are excluded from both formal records and relation targets until their conflicting source rows are reconciled. Source details are preserved in `docs/decisions/id-collisions.yaml`.

| Historical ID | Source rows | Status |
|---|---:|---|
| `DEC-20260225-P-c5d6` | 2 | excluded pending resolution |
| `DEC-20260303-A` | 2 | excluded pending resolution |
| `DEC-20260304-A` | 2 | excluded pending resolution |
| `DEC-20260304-B` | 2 | excluded pending resolution |
| `DEC-20260304-C` | 2 | excluded pending resolution |
| `DEC-20260320-C` | 2 | excluded pending resolution |
| `DEC-20260320-J` | 2 | excluded pending resolution |
| `DEC-20260320-K` | 2 | excluded pending resolution |
| `DEC-20260405-B` | 2 | excluded pending resolution |
| `DEC-20260406-A` | 2 | excluded pending resolution |
| `DEC-20260406-B` | 2 | excluded pending resolution |
| `DEC-20260406-C` | 2 | excluded pending resolution |
| `DEC-20260409-C` | 2 | excluded pending resolution |
| `DEC-20260420-D` | 2 | excluded pending resolution |
| `DEC-20260420-E` | 2 | excluded pending resolution |
| `DEC-20260420-F` | 2 | excluded pending resolution |
| `DEC-20260420-G` | 2 | excluded pending resolution |
| `DEC-20260420-H` | 2 | excluded pending resolution |
| `DEC-20260420-I` | 2 | excluded pending resolution |
| `DEC-20260420-J` | 2 | excluded pending resolution |
| `DEC-20260420-K` | 2 | excluded pending resolution |
| `DEC-20260421-A` | 2 | excluded pending resolution |
| `DEC-20260421-B` | 2 | excluded pending resolution |
| `DEC-20260421-C` | 2 | excluded pending resolution |
| `DEC-20260421-D` | 2 | excluded pending resolution |
| `DEC-20260505-D` | 2 | excluded pending resolution |
| `DEC-20260505-E` | 2 | excluded pending resolution |
| `DEC-20260507-A` | 2 | excluded pending resolution |
| `DEC-20260507-B` | 2 | excluded pending resolution |
| `DEC-20260507-C` | 2 | excluded pending resolution |
| `DEC-20260508-B` | 2 | excluded pending resolution |
| `DEC-20260508-C` | 3 | excluded pending resolution |
| `DEC-20260512-A` | 2 | excluded pending resolution |
| `DEC-20260513-F` | 2 | excluded pending resolution |
