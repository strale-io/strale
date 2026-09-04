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
| [`DEC-20260302-A-0001`](../decisions/records/DEC-20260302-A-0001.md) — Capability Pricing Framework | `DEC-20260302-A-0001` | active | `capability-pricing-framework` | product | petter | 2026-03-02 |
| [`DEC-20260305-G`](../decisions/records/DEC-20260305-G.md) — Trust display system rules: one chart, one calculation, one severity vocabulary, one narrative tone | `DEC-20260305-G` | active | `trust-display-system-rules` | product | petter | 2026-03-05 |
| [`DEC-20260306-D`](../decisions/records/DEC-20260306-D.md) — Metric display consistency across all surfaces: 6 issues identified and fixed | `DEC-20260306-D` | active | `metric-display-consistency` | product | petter | 2026-03-06 |
| [`DEC-20260308-1`](../decisions/records/DEC-20260308-1.md) — Platform pricing currency: EUR (not USD) | `DEC-20260308-1` | active | `platform-pricing-currency` | product | petter | 2026-03-08 |
| [`DEC-20260309-G`](../decisions/records/DEC-20260309-G.md) — Mandatory Capability Onboarding Risk Framework: 12-category evaluation required for every new capability | `DEC-20260309-G` | active | `capability-onboarding-risk-framework` | technical | petter | 2026-03-09 |
| [`DEC-20260313-C`](../decisions/records/DEC-20260313-C.md) — Show 'Unverified' SQS with capability still listed | `DEC-20260313-C` | active | `unverified-sqs-capability-listing` | product | petter | 2026-03-13 |
| [`DEC-20260313-F`](../decisions/records/DEC-20260313-F.md) — Published to Official MCP Registry as io.github.strale-io/strale v0.1.1 | `DEC-20260313-F` | active | `mcp-registry-publication` | technical | petter | 2026-03-13 |
| [`DEC-20260316-A`](../decisions/records/DEC-20260316-A.md) — Eliminate Combined Trust Grade (A/B/C/D) from all surfaces | `DEC-20260316-A` | active | `eliminate-combined-trust-grade` | product | petter | 2026-03-16 |
| [`DEC-20260316-B`](../decisions/records/DEC-20260316-B.md) — SQS display hierarchy: number+word headline, QP/RP letters as secondary detail only | `DEC-20260316-B` | active | `sqs-display-hierarchy` | product | petter | 2026-03-16 |
| [`DEC-20260318-A`](../decisions/records/DEC-20260318-A.md) — ALL new capabilities must use manifest-driven pipeline (scripts/onboard.ts), NEVER old seed.ts + onboarding hook | `DEC-20260318-A` | active | `capability-onboarding-pipeline-mandate` | technical | petter | 2026-03-18 |
| [`DEC-20260318-B`](../decisions/records/DEC-20260318-B.md) — Onboarding pipeline upgraded with --discover, --fix, and execute-and-verify | `DEC-20260318-B` | active | `capability-onboarding-pipeline-upgrades` | technical | petter | 2026-03-18 |
| [`DEC-20260320-A`](../decisions/records/DEC-20260320-A.md) — Capability onboarding hardening: auto-import executors, readiness checker as single enforcement gateway, output_field_reliability-aware test generation, seed guard + audit CLI | `DEC-20260320-A` | active | `capability-onboarding-hardening` | technical | petter | 2026-03-20 |
| [`DEC-20260320-F`](../decisions/records/DEC-20260320-F.md) — Raise compliance screening prices to EUR 0.25/call (sanctions-check, pep-check, adverse-media-check) for 60% margin on OpenSanctions EUR 0.10/call cost | `DEC-20260320-F` | active | `compliance-screening-pricing-margin` | product | petter | 2026-03-20 |
| [`DEC-20260323-A`](../decisions/records/DEC-20260323-A.md) — All trust data served from DB columns; write-time decay only; one score everywhere | `DEC-20260323-A` | active | `trust-data-db-columns-write-time-decay` | technical | petter | 2026-03-23 |
| [`DEC-20260324-A`](../decisions/records/DEC-20260324-A.md) — Stripe x402 deposit mode is US-only; use the open x402 protocol (Coinbase CDP facilitator); no US entity via Atlas | `DEC-20260324-A` | active | `x402-rail-selection` | technical | petter | 2026-03-24 |
| [`DEC-20260324-C`](../decisions/records/DEC-20260324-C.md) — AgentCash is complementary, not competitive | `DEC-20260324-C` | active | `agentcash-positioning` | product | petter | 2026-03-24 |
| [`DEC-20260330-B`](../decisions/records/DEC-20260330-B.md) — Shift distribution from 'be listed' to 'be embedded in coding workflow' via Context7, IDE rules, vibe-coding SEO | `DEC-20260330-B` | active | `distribution-embedding-strategy` | product | petter | 2026-03-30 |
| [`DEC-20260404-A`](../decisions/records/DEC-20260404-A.md) — Adopt Glama TDQS as a quality signal; rewrite strale-mcp tool descriptions | `DEC-20260404-A` | active | `glama-tdqs-adoption` | technical | petter | 2026-04-04 |
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
| [`DEC-20260302-A-0001`](../decisions/records/DEC-20260302-A-0001.md) | `DEC-20260302-A-0001` | `amended_by` | [`DEC-20260411-A`](../decisions/records/DEC-20260411-A.md) | `DEC-20260411-A` |
| [`DEC-20260320-B`](../decisions/records/DEC-20260320-B.md) | `DEC-20260320-B` | `superseded_by` | [`DEC-20260423-B`](../decisions/records/DEC-20260423-B.md) | `DEC-20260423-B` |
| [`DEC-20260420-A`](../decisions/records/DEC-20260420-A.md) | `DEC-20260420-A` | `affirmed_by` | [`DEC-20260511-C`](../decisions/records/DEC-20260511-C.md) | `DEC-20260511-C` |
| [`DEC-20260421-J`](../decisions/records/DEC-20260421-J.md) | `DEC-20260421-J` | `amended_by` | [`DEC-20260422-B`](../decisions/records/DEC-20260422-B.md) | `DEC-20260422-B` |
| [`DEC-20260421-J`](../decisions/records/DEC-20260421-J.md) | `DEC-20260421-J` | `related_from` | [`DEC-20260421-L`](../decisions/records/DEC-20260421-L.md) | `DEC-20260421-L` |
| [`DEC-20260422-C`](../decisions/records/DEC-20260422-C.md) | `DEC-20260422-C` | `superseded_by` | [`DEC-20260423-A`](../decisions/records/DEC-20260423-A.md) | `DEC-20260423-A` |
| [`DEC-20260423-A`](../decisions/records/DEC-20260423-A.md) | `DEC-20260423-A` | `related_from` | [`DEC-20260423-B`](../decisions/records/DEC-20260423-B.md) | `DEC-20260423-B` |
| [`DEC-20260425-B`](../decisions/records/DEC-20260425-B.md) | `DEC-20260425-B` | `affirmed_by` | [`DEC-20260425-A`](../decisions/records/DEC-20260425-A.md) | `DEC-20260425-A` |
| [`DEC-20260427-A`](../decisions/records/DEC-20260427-A.md) | `DEC-20260427-A` | `related_from` | [`DEC-20260427-B`](../decisions/records/DEC-20260427-B.md) | `DEC-20260427-B` |
| [`DEC-20260428-A`](../decisions/records/DEC-20260428-A.md) | `DEC-20260428-A` | `interpreted_by` | [`DEC-20260518-F`](../decisions/records/DEC-20260518-F.md) | `DEC-20260518-F` |
| [`DEC-20260428-A`](../decisions/records/DEC-20260428-A.md) | `DEC-20260428-A` | `interpreted_by` | [`DEC-20260813-A`](../decisions/records/DEC-20260813-A.md) | `DEC-20260813-A` |
| [`DEC-20260428-A`](../decisions/records/DEC-20260428-A.md) | `DEC-20260428-A` | `related_from` | [`DEC-20260428-B`](../decisions/records/DEC-20260428-B.md) | `DEC-20260428-B` |
| [`DEC-20260428-A`](../decisions/records/DEC-20260428-A.md) | `DEC-20260428-A` | `related_from` | [`DEC-20260429-A`](../decisions/records/DEC-20260429-A.md) | `DEC-20260429-A` |
| [`DEC-20260428-A`](../decisions/records/DEC-20260428-A.md) | `DEC-20260428-A` | `related_from` | [`DEC-20260430-A`](../decisions/records/DEC-20260430-A.md) | `DEC-20260430-A` |
| [`DEC-20260428-B`](../decisions/records/DEC-20260428-B.md) | `DEC-20260428-B` | `related_from` | [`DEC-20260429-A`](../decisions/records/DEC-20260429-A.md) | `DEC-20260429-A` |
| [`DEC-20260428-B`](../decisions/records/DEC-20260428-B.md) | `DEC-20260428-B` | `related_from` | [`DEC-20260430-A`](../decisions/records/DEC-20260430-A.md) | `DEC-20260430-A` |
| [`DEC-20260502-A`](../decisions/records/DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6.md) | `DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6` | `related_from` | [`DEC-20260308-1`](../decisions/records/DEC-20260308-1.md) | `DEC-20260308-1` |
| [`DEC-20260503-A`](../decisions/records/DEC-20260503-A.md) | `DEC-20260503-A` | `superseded_by` | [`DEC-20260812-A`](../decisions/records/DEC-20260812-A.md) | `DEC-20260812-A` |
| [`DEC-20260504-B`](../decisions/records/DEC-20260504-B.md) | `DEC-20260504-B` | `related_from` | [`DEC-20260504-C`](../decisions/records/DEC-20260504-C.md) | `DEC-20260504-C` |
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
