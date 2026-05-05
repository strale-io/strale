# Compliance requirements research — Strale audit record fields

**Scope:** research input for DEC-20260425-A and related Session F DECs.
**Not legal advice.** This is a reading of primary sources to inform a product decision.
**HEAD at audit:** `d165ae2ee7902c30d117410a4f27766c8621f59f`
**Date:** 2026-04-21

---

## Executive summary

- **ISO/IEC 24970 is not a published standard.** It exists as `ISO/IEC DIS 24970` (Draft International Standard, enquiry phase, earliest finalisation Q4 2026). The codebase cites it as a satisfied standard in `provenance-builder.ts` and `integrity-hash.ts`. A regulator or auditor cross-checking the reference would find no published text to hold the system against. Treat every in-code citation of "ISO/IEC 24970" as citing an unfinalised draft.
- **Colorado AI Act effective date has moved.** `lib/data-retention.ts` cites "Colorado AI Act SB 24-205" for a 3-year retention window. Original effective date was 2026-02-01. Colorado SB 25B-004 (signed 2025-08-28) delayed principal operative provisions to **2026-06-30**. The retention constant itself is not affected, but any code comment or public claim asserting a February effective date is now stale.
- **GDPR does not use the terms `data_jurisdiction` or `processing_location`.** The functional equivalents are (i) "recipients... including recipients in third countries or international organisations" and "transfers of personal data to a third country or an international organisation, including the identification of that third country or international organisation" (Art. 30(1)(d)–(e)), and (ii) there is no GDPR requirement to record the physical location where processing occurs as a standalone field. GDPR is about *who receives the data* and *whether a transfer to a non-adequate country occurred*, not *where a compute instance sits*.
- **EU AI Act Art. 12 specifies logging content only for one category** (Annex III point 1(a), biometric identification) — start/end time, reference database, input matched, human verifiers. None of Strale's 290+ capabilities falls under that category as currently described. For all other high-risk systems, Art. 12 is open-ended ("relevant for... identifying situations that may result in... risk..."). Art. 12 does not name `processing_location` or `data_jurisdiction` as required fields.
- **The provider/deployer distinction materially changes Strale's obligations.** Strale is a *provider* (it builds and offers AI-involved capabilities). Its API customers are *deployers*. Several of the Art. 12 / Art. 26 log-retention and impact-assessment obligations attach to the *deployer*, not to Strale. Strale's audit trail serves customers' deployer obligations; Strale's own provider obligations (Art. 13 instructions-for-use) are a different surface.

---

## Audit record field inventory

Deduplicated across `buildFullAudit`, `buildFailureAudit`, `buildFreeTierAudit` (`routes/do.ts`), `composeAuditRecord` (`routes/audit.ts`), `ComplianceProfile` (`lib/compliance-profile.ts`), and `RichProvenance` (`lib/provenance-builder.ts`). Grouped by conceptual area. Total: **39 distinct fields**.

### Identity / routing (7)
| Field | Surface | Notes |
|---|---|---|
| `transaction_id` | full, failure, `composeAuditRecord` | UUID of row in `transactions` |
| `capability` (slug) | full, failure, free-tier | String |
| `data_source` | full, failure, free-tier | `capability.dataSource ?? capability.name` |
| `data_source_url` | full only | Via `getDataSourceUrl(slug)` helper |
| `entity_name`, `entity_slug`, `type` | `composeAuditRecord` | Capability or solution |
| `audit_url` | `composeAuditRecord` | Tokenless reference path (F-AUDIT-07) |
| `shareable_url`, `shareable_url_expires_at` | full `compliance.*` | HMAC-signed token URL |

### Timing (7)
| Field | Surface | Notes |
|---|---|---|
| `timestamp` / `timestamp_start` / `started_at` | all | Start of execution |
| `completed_at` / `timestamp_end` / `failed_at` | full, failure, `composeAuditRecord` | End |
| `latency_ms` / `latency_s` | all | Total execution |
| `perStepMs` | `composeAuditRecord` (derived) | Even division — F-AUDIT-09 |
| `execution_mode` | full, failure, free-tier | `sync` / `async` |
| `data_retention_days` | full `compliance.*` | Constant from `TRANSACTION_RETENTION_DAYS` |
| `avg_latency_ms` | `ComplianceProfile` | Derived from capability row |

### Compliance positioning (11)
| Field | Surface | Notes |
|---|---|---|
| `data_classification` | full, free-tier | `capability.dataClassification ?? "unknown"` |
| `transparency_marker` | full, failure, free-tier | `algorithmic` / `hybrid` / `ai_generated` |
| `ai_description` | full, free-tier | Derived text |
| `ai_involvement` | full `compliance.*`, `composeAuditRecord` | Descriptive label |
| `data_jurisdiction` | **all three builders** | **Hardcoded `"EU"` in full+free-tier; computed in failure — F-AUDIT-01** |
| `processing_location` | **all three builders** | Now read from `RAILWAY_REPLICA_REGION` via helper (F-AUDIT-02 Contain fix at commit `d165ae2`) |
| `human_oversight` | full `compliance.*` | Hardcoded `"autonomous"` |
| `human_oversight_description` | full `compliance.*` | Hardcoded string |
| `personal_data_processed` | full, free-tier | Manifest-declared |
| `personal_data_categories` | full, free-tier | Array |
| `applicable_regulations` / `regulations_addressed` | full, failure, free-tier | Object mapping framework → article → claim |

### Provenance (8) — from `RichProvenance`
| Field | Notes |
|---|---|
| `source` | Required |
| `source_url` | Optional |
| `fetched_at` | ISO |
| `ai_model` | LLM-only |
| `ai_prompt_hash` | LLM-only |
| `ai_raw_output_hash` | LLM-only |
| `ai_processing_description` | LLM-only |
| `processing_jurisdictions` | Array — computed by `getProcessingJurisdictions` |

### Integrity (3)
| Field | Surface | Notes |
|---|---|---|
| `input_hash` / `input_fingerprint` | full, failure, `composeAuditRecord` | SHA-256 of input |
| `integrity_hash` | `transactions` column; verify endpoints | SHA-256 chain |
| `previous_hash` | `transactions` column | Chain link |

### Subject-access / GDPR surface (3)
| Field | Notes |
|---|---|
| `access_endpoint` | String `GET /v1/transactions/{id}` (Art. 15) |
| `deletion_endpoint` | String `DELETE /v1/transactions/{id}` (Art. 17) |
| GDPR `article_15` / `article_17` narrative strings | In `compliance.regulations_addressed.gdpr` |

**Field count: 39.** Under the 40-field threshold — continuing with in-scope plan.

---

## Regulatory citations currently in code

Exhaustive list of regulatory-text citations in `apps/api/src/`:

| Location | Citation |
|---|---|
| `routes/do.ts:2120` | `applicable_regulations: ["EU AI Act (Articles 12, 13, 50)"]` (free-tier) |
| `routes/do.ts:2199–2213` | `regulations_addressed.eu_ai_act.article_12 / _13 / _14 / _50`; `gdpr.article_30 / _15 / _17` (full) |
| `routes/do.ts:2218` | Comment: `Failure audit trail (EU AI Act Art. 12 — log ALL executions)` |
| `routes/do.ts:2257` | `regulations_addressed.eu_ai_act.article_12` (failure) |
| `routes/do.ts:2268` | Comment: `EU AI Act transparency markers (DEC-20260226-P-s3t4)` |
| `lib/compliance-profile.ts:133–136` | `EU AI Act` Articles 12, 13, 14, 50 — per-framework `ComplianceRegulatoryItem` |
| `lib/compliance-profile.ts:143–144` | `GDPR` Articles 30, 15/17 |
| `lib/compliance-profile.ts:148–155` | `Sanctions Screening` `31 CFR Part 501` (OFAC) — only for `sanctions-check` capability |
| `lib/provenance-builder.ts:5` | Module docstring: `EU AI Act Art. 12 — automatic logging including data sources` |
| `lib/provenance-builder.ts:7` | Module docstring: `ISO/IEC 24970 — AI system logging standard` |
| `lib/provenance-builder.ts:75` | Comment: `required for EU AI Act Art. 12 compliance` |
| `lib/integrity-hash.ts:11` | Comment: `Satisfies: SOC 2 2026 tamper-evident logging, ISO/IEC 24970` |
| `lib/audit-token.ts:5` | Comment: `the EU AI Act / GDPR compliance story those URLs anchor` |
| `lib/fire-and-forget.ts:8` | Comment: `are compliance-critical (EU AI Act, GDPR)` |
| `lib/schema-validator.ts:75` | Comment: `buildFullAudit reads these to emit accurate GDPR Art. 30 claims` |
| `lib/data-retention.ts:9–10` | `GDPR Art. 30 record-of-processing`; `Colorado AI Act SB 24-205` |
| `lib/data-retention.ts:20, 136` | `Colorado AI Act SB 24-205` — 3-year retention for `transactions` |
| `jobs/integrity-hash-retry.ts:7` | Comment mentions `ISO/IEC 24970` |
| `jobs/db-retention.ts:15` | Comment: `EU AI Act audit trail — retained for compliance` |
| `routes/transactions.ts:291` | Comment: `GDPR Art. 17 right-to-erasure` |
| `routes/mcp-server-card.ts:68` | Public-facing: `compliance: ["EU AI Act", "GDPR"]` |
| `openapi.ts:168` | Public-facing: `EU AI Act compliant audit trail.` |
| `db/seed-solutions.ts:81–135` | Seeded regulatory mapping: EU AI Act Arts. 12, 13, 14, 50; GDPR Art. 30, 15, 17 |
| `db/schema.ts:195` | Comment: `EU AI Act compliance (DEC-20260226-P-s3t4)` |

Regulations referenced in code: **EU AI Act, GDPR, Colorado AI Act SB 24-205, OFAC 31 CFR Part 501 (narrow), SOC 2 2026 (tamper-evident logging), ISO/IEC 24970**. NIST AI RMF, ISO/IEC 42001, California, NYC LL144, OMB M-24-10 — *not referenced in code*.

---

## Regulations covered

### 1. EU AI Act — Regulation (EU) 2024/1689

- **Full citation:** Regulation (EU) 2024/1689 of 13 June 2024 laying down harmonised rules on artificial intelligence (Artificial Intelligence Act).
- **Primary source URL (verbatim article text):** `https://artificialintelligenceact.eu/article/12/`, `/13/`, `/26/`, `/50/`. EUR-Lex HTML page at `https://eur-lex.europa.eu/eli/reg/2024/1689/oj` returned only preamble/recitals for articles on the WebFetch attempts; `artificialintelligenceact.eu` was used for verbatim paragraph text. (This site reproduces the Official Journal text and is widely cited by EU-industry sources; it is not the authoritative publisher. Flagged in self-uncertainties.)
- **In-force status:** Entered into force 2024-08-01. Obligations on high-risk systems apply from 2026-08-02. General-purpose AI model rules applied from 2025-08-02.
- **Provider vs deployer:** Strale develops and offers AI-involved capabilities → *provider* (Art. 3(3)). API customers integrating those capabilities into their own systems are typically *deployers* (Art. 3(4)). Obligations land differently: Art. 12 "enable logging" is on providers; Art. 26(6) "retain logs at least six months" is on deployers.

**Article 12 — Record-keeping (per-paragraph reading):**

- 12(1): High-risk AI systems shall technically allow for "the automatic recording of events (logs) over the lifetime of the system." *Obligation: providers build the capability.*
- 12(2): logging capabilities shall enable recording events relevant for (a) identifying risk situations under Art. 79(1), (b) post-market monitoring (Art. 72), (c) monitoring operation under Art. 26(5). *The named trigger is "risk-presenting situations," not a general record of every call.*
- 12(3): Minimum fields apply **only to systems under Annex III point 1(a)** (remote biometric identification): start/end time of each use; reference database checked against; input data matched; identity of natural persons verifying results.

Articles 12(1) and 12(2) do **not** enumerate fields. They require the *capability* to record events relevant for risk, post-market monitoring, and oversight. They do not specify `processing_location`, `data_jurisdiction`, data source URL, or any field Strale currently emits.

**Article 13 — Transparency / instructions for use:**

- 13(3)(a): provider identity and contact details.
- 13(3)(b): characteristics, capabilities, limitations, intended purpose, accuracy/robustness/cybersecurity, input-data specs, training/validation/testing dataset info.
- 13(3)(f): "mechanisms for collecting, storing, and interpreting logs" per Art. 12 — *where relevant*.

Art. 13 is an instructions-document obligation, not an audit-record obligation. Nothing in 13(3) demands a per-transaction `processing_location` field.

**Article 14 — Human oversight:** Providers must design systems so deployers can oversee them. Not a logging field obligation. Strale's `human_oversight: "autonomous"` string addresses the *documentation* angle of 14, not any specific enumerated field.

**Article 26 — Deployer obligations:**

- 26(5): deployers monitor operation.
- 26(6): "keep the logs automatically generated by that high-risk AI system... for a period appropriate to the intended purpose of the high-risk AI system, of at least six months." Strale's 3-year retention (`TRANSACTION_RETENTION_DAYS`) exceeds this.

**Article 50 — Transparency for certain AI systems:**

- 50(1): AI systems that interact with humans must inform them. Strale's API is developer-facing; not directly applicable per-transaction. Marking responses as AI-generated via `transparency_marker` is an *anticipatory* implementation that helps *customers* satisfy 50(1) in their apps.
- 50(2): synthetic content marked machine-readably. Relevant only to capabilities generating synthetic media.
- 50(4): deepfakes disclosure. Not applicable.

**Summary for DEC-20260425-A:** The EU AI Act mentions "provider" location (Art. 13(3)(a) — identity/contact of provider), never "processing location" of a specific call, never "data jurisdiction." Article 12 logs are defined by *purpose* (risk-relevance), not *location*.

### 2. GDPR — Regulation (EU) 2016/679

- **Primary source URL:** `https://gdpr-info.eu/art-30-gdpr/`, `https://gdpr-info.eu/art-44-gdpr/` (widely used unofficial mirrors of the Official Journal text).
- **In-force since:** 2018-05-25.

**Article 4(9)** — "Recipient" means any "natural or legal person, public authority, agency or another body to which the personal data are disclosed." *This is the GDPR-native notion closest to "where data went."*

**Article 5** — Principles: lawfulness, purpose limitation, data minimisation, accuracy, storage limitation, integrity/confidentiality, accountability. No field-level audit requirement.

**Article 13 / 14** — Information to data subjects. Must disclose "recipients or categories of recipients," "categories of personal data" (14 only), retention period. These are *notice* requirements to data subjects, not internal audit fields.

**Article 15** — Access right. Data subject can obtain confirmation of processing and "categories of personal data," "recipients or categories of recipients," and retention period. Strale's `access_endpoint` field addresses the existence of an access surface.

**Article 17** — Right to erasure. Strale's `deletion_endpoint` + soft-delete addresses the existence of an erasure surface. Collision with integrity hash is flagged in Session F F-AUDIT-13/16.

**Article 30 — Records of processing activities (the closest thing to Strale's audit record in GDPR):**

- 30(1)(a): name and contact details of controller.
- 30(1)(b): purposes of processing.
- 30(1)(c): categories of data subjects; categories of personal data.
- 30(1)(d): "the categories of recipients to whom the personal data have been or will be disclosed including recipients in third countries or international organisations."
- 30(1)(e): "where applicable, transfers of personal data to a third country or an international organisation, including the identification of that third country or international organisation and... documentation of suitable safeguards."
- 30(1)(f): envisaged time limits for erasure.
- 30(1)(g): general description of technical and organisational security measures.

**The GDPR-native field for "where did data go" is 30(1)(d)/(e) — recipients and third-country transfer identification.** This is *not* "processing location." It is the identity of the receiving entity and, if the receiving entity is outside the EU, which country and what safeguard (SCC, adequacy decision, BCR) applies.

**Articles 44–49** — International transfers:

- 44: transfers to third countries or international organisations must comply with Chapter V.
- 45: adequacy decisions (e.g., UK, Swiss, EU-US Data Privacy Framework).
- 46: appropriate safeguards (SCCs, BCRs).
- 47: BCRs.
- 49: derogations.

For Strale: Anthropic's API is US-based. US has an adequacy decision (EU-US Data Privacy Framework, effective 2023-07-10) if Anthropic is on the certified list. Otherwise, SCCs are required. This is not visible anywhere in the audit record today.

**Summary for DEC-20260425-A:** GDPR's vocabulary is "recipient," "transfer to a third country," "identification of that third country or international organisation." Not "processing location." Not "data jurisdiction." A GDPR-aligned `data_jurisdiction` field would record *which third countries received the data and under which Chapter V mechanism* — closer to a recipient/safeguard array than a region string.

### 3. Colorado AI Act — SB 24-205 (as amended by SB 25B-004)

- **Primary source URL:** `https://leg.colorado.gov/bills/sb24-205`; `https://leg.colorado.gov/bills/sb25b-004`.
- **Effective date:** Originally 2026-02-01; amended by SB 25B-004 (signed 2025-08-28) to **2026-06-30**. The `data-retention.ts` code comment does not cite the amended date.
- **Substantive obligations unchanged by the delay.**

**Requirements relevant to audit records:**

- Developers: statement to deployers; documentation sufficient for impact assessment; public summary of high-risk systems; disclose algorithmic-discrimination risks to AG within 90 days.
- Deployers: risk management policy; impact assessment; annual review; consumer notification; public statement "summarising the types of high-risk systems... and the nature, source, and extent of the information collected."
- Universal: disclose to consumer when interacting with an AI system.

The Colorado AI Act does **not** enumerate per-transaction log fields. It imposes *programmatic* obligations (risk management, impact assessments). Retention follows naturally from those obligations; the 3-year window in `data-retention.ts` is a reasonable but not text-specified floor.

No mention in SB 24-205 of "processing location" or "data jurisdiction" as recorded fields.

### 4. NIST AI RMF 1.0 + Generative AI Profile

- **Primary source:** `NIST AI 100-1` (AI RMF 1.0, January 2023); `NIST AI 600-1` (Generative AI Profile, July 2024). The direct PDF fetch returned corrupted binary; subcategory text was retrieved from NIST's AIRC (AI Resource Center) knowledge base. *Flagged under self-uncertainties.*
- **Status:** Voluntary framework; not law. Often cited in US federal procurement / OMB M-24-10.

**Subcategories relevant to Strale's audit record:**

- GOVERN 1.4: risk-management outcomes established through transparent policies, procedures, controls.
- GOVERN 1.6: inventory of AI systems.
- MAP 4.1: "Approaches for mapping risks of third-party components, including data and software, are followed and documented." → *directly applicable to Strale's third-party API dependencies (Anthropic, Browserless, etc.).*
- MAP 4.2: internal risk controls for third-party AI components documented.
- MEASURE 2.1: "Test sets, metrics, and details about the tools used during TEVV are documented." → Strale's test_suites / test_runs satisfy this conceptually.
- MEASURE 2.9: model explanation, validation, documentation inform responsible use.
- MANAGE 4.1: post-deployment monitoring plans with incident response and change management.
- MANAGE 4.3: incidents tracked, responded to, recovery documented.

No subcategory names `processing_location` or `data_jurisdiction`. MAP 4.1 is the strongest hook — third-party component (LLM API, scrape provider) documentation — which could include the provider's operating region as an attribute. This is plausibly what a `processing_jurisdictions` field *ought* to express per-capability.

### 5. ISO/IEC 42001:2023 (AI management systems) + ISO/IEC 24970 status

- **ISO/IEC 42001:2023** is a published standard. Title: *Information technology — Artificial intelligence — Management system.* Full text paywalled. Publicly documented structure: Clauses 4–10 (Context, Leadership, Planning, Support, Operation, Performance Evaluation, Improvement), with records / documented-information requirements integrated throughout (especially Clauses 9–10). No specific per-transaction field list is defined publicly.
- **ISO/IEC 24970 — IMPORTANT FINDING:** The code (`provenance-builder.ts:7`, `integrity-hash.ts:11`, `jobs/integrity-hash-retry.ts:7`) cites `ISO/IEC 24970` as a satisfied standard. **It is not a published standard.** ISO's catalogue shows `ISO/IEC DIS 24970` (Draft International Standard, *Artificial intelligence — AI system logging*), currently in enquiry phase. The search result confirms: "The standard won't be finalized until Q4 2026 at the earliest." Reference: `https://www.iso.org/standard/88723.html` (ISO page for DIS 24970).

**Citing ISO/IEC 24970 as "satisfied" is citing a draft that has not been published.** No auditor can check work against it because the final text is not yet fixed. This is a material accuracy issue in the public compliance claim.

### Conditional-scope regulations — **deferred**
California AB 2013, NYC Local Law 144 (AEDT), OMB M-24-10 — not read in this pass. See "Deferred scope".

---

## Mapping matrix

Rows: Strale audit fields. Columns: regulations. Cells: **ADDRESSES** / **PARTIAL** / **GAP** / **N/A**.

| Field | EU AI Act | GDPR | Colorado AI Act | NIST AI RMF 1.0 | ISO/IEC 42001 / DIS 24970 |
|---|---|---|---|---|---|
| `transaction_id` | PARTIAL — Art. 12(1) log identity implicit | ADDRESSES — Art. 30 needs identifiable record | PARTIAL — discovery | MEASURE 2.1 | 42001 Clause 9 (documented info) |
| `timestamp` / `completed_at` | ADDRESSES — Art. 12(3)(a) for biometric only; general for 12(2) | PARTIAL — Art. 30(1)(f) retention implies start | PARTIAL | GOVERN 1.4 | Likely DIS 24970 |
| `capability` (slug) | PARTIAL — Art. 12(2) traceability | GAP — no direct Art. 30 field | PARTIAL — impact-assessment input | MAP 4.1 | 42001 AI system inventory |
| `data_source` / `data_source_url` | PARTIAL — Art. 13(3)(b) dataset info | PARTIAL — Art. 30(1)(c) categories of data | N/A | MAP 4.1 | DIS 24970 data lineage |
| `data_classification` | GAP — not named | PARTIAL — Art. 30(1)(c) categories of personal data | GAP | GAP | 42001 generally |
| `transparency_marker` | ADDRESSES — Art. 13, Art. 50(2) marking | N/A | ADDRESSES — consumer AI-interaction disclosure | GAP | 42001 generally |
| `ai_description` | PARTIAL — Art. 13(3)(b) capabilities description | GAP | PARTIAL | MEASURE 2.9 | 42001 generally |
| `data_jurisdiction` (currently hardcoded "EU") | GAP — not named | **PARTIAL — proxies Art. 30(1)(e) third-country transfer ID, but misses safeguards clause** | GAP | PARTIAL — MAP 4.1 provider region | DIS 24970 potentially |
| `processing_location` (now from env) | GAP — not named | GAP — GDPR does not require processing-location recording | GAP | PARTIAL — MAP 4.1 | DIS 24970 potentially |
| `human_oversight` (string "autonomous") | ADDRESSES — Art. 14 documentation | N/A | PARTIAL — deployer review | MANAGE 4.1 | 42001 oversight controls |
| `personal_data_processed` | GAP — AI Act does not classify PII | ADDRESSES — precursor to Art. 30 scoping | GAP | GAP | 42001 ties to ISO 27701 |
| `personal_data_categories` | GAP | ADDRESSES — Art. 30(1)(c) | GAP | GAP | 42001 |
| `applicable_regulations` array | GAP | GAP | GAP | GAP | GAP — narrative, not a requirement field |
| `data_retention_days` (3y) | PARTIAL — Art. 26(6) floor 6 months, Strale exceeds | ADDRESSES — Art. 30(1)(f) time limits | PARTIAL — consistent with record-keeping | GOVERN 1.4 | 42001 |
| `input_hash` / `input_fingerprint` | PARTIAL — Art. 12(2)(a) risk-situation identification | N/A | N/A | MEASURE 2.1 | DIS 24970 integrity |
| `integrity_hash` / chain | GAP — not named, but aids Art. 12 traceability | GAP — aids Art. 5(1)(f) integrity | GAP | GOVERN 1.4 | DIS 24970 |
| `shareable_url` + token | PARTIAL — enables Art. 13 transparency to deployer's customer | PARTIAL — aids Art. 15 access | PARTIAL — consumer notice surface | MEASURE 2.9 | GAP |
| `access_endpoint` | GAP | ADDRESSES — Art. 15 | PARTIAL | GAP | GAP |
| `deletion_endpoint` | GAP | ADDRESSES — Art. 17 | GAP | GAP | GAP |
| `provenance.source` | PARTIAL — Art. 13(3)(b) input-data specs | PARTIAL — Art. 30(1)(c) | GAP | MAP 4.1 | DIS 24970 |
| `provenance.ai_model` | ADDRESSES — Art. 50(2) marking, Art. 13 description | N/A | N/A | MEASURE 2.9 | 42001 |
| `provenance.ai_prompt_hash` | PARTIAL — Art. 12(2) traceability | N/A | N/A | MEASURE 2.1 | DIS 24970 |
| `provenance.ai_raw_output_hash` | PARTIAL — Art. 12 traceability | N/A | N/A | MEASURE 2.1 | DIS 24970 |
| `provenance.processing_jurisdictions` | GAP | PARTIAL — Art. 30(1)(e) proxy | GAP | PARTIAL — MAP 4.1 | GAP |
| `provenance.failed`, `error_category` | ADDRESSES — Art. 12(2)(a) risk situations | N/A | ADDRESSES — algorithmic discrimination reporting | MANAGE 4.3 | DIS 24970 |
| `request_context` (ipHash, UA, etc.) | PARTIAL — Art. 12 traceability | PARTIAL — Art. 30(1)(g) security measures | GAP | GOVERN 1.4 | DIS 24970 |
| `quality.sqs`, `pass_rate` | PARTIAL — Art. 13(3)(b) accuracy metrics | N/A | GAP | MEASURE 2.1 / 2.9 | 42001 Clause 9 |
| `schema_validated` | PARTIAL — Art. 13(3)(b) robustness | N/A | GAP | MEASURE 2.1 | 42001 |

**GAP count: 29 cells.** Primarily concentrated in: `applicable_regulations` (no regulation requires this narrative field), `processing_location` (no regulation requires physical region), subject-access fields under non-GDPR regulations (GAP by design — only GDPR has these).

---

## Implications for DEC-20260425-A

### What the regulations actually say about "processing location" and "data jurisdiction"

- **GDPR:** does not use either phrase. Uses "recipient" (Art. 4(9)), "third country," "international organisation," "transfer" (Ch. V, Arts. 44–49), and specifically requires recording "categories of recipients... including recipients in third countries or international organisations" (Art. 30(1)(d)) and "transfers... including the identification of that third country or international organisation and... documentation of suitable safeguards" (Art. 30(1)(e)). The legal object is *who received the data, and which Ch. V safeguard applies*.
- **EU AI Act:** does not use either phrase as a log-field requirement. Art. 13(3)(a) requires identity/contact of the *provider*, but that is an instructions-for-use field, not a per-call audit field. Art. 12(3) enumerates fields only for Annex III 1(a) biometric ID — and even there, location is not listed.
- **Colorado AI Act:** does not use either phrase. Requires deployer to publish "the nature, source, and extent of the information collected" — closest analogue, but at the *program* level not per-transaction.
- **NIST AI RMF:** MAP 4.1 gestures at third-party component documentation; location could reasonably be an attribute, but no prescriptive field.
- **ISO/IEC DIS 24970:** Not published. Cannot confirm or deny.

**Core insight:** No reg requires the field names Strale is using. "Processing location" and "data jurisdiction" are *inventions* of the Strale audit schema. They are not mapped to a specific regulatory text anywhere in the code. The question for DEC-20260425-A is therefore not "what does the regulation require us to put in these fields" but "what decision-useful meaning can we assign these fields such that they *support* regulatory compliance for Strale's users."

### Options for DEC-20260425-A — not recommended, for chat decision

#### Option A — Drop the fields; replace with GDPR-native vocabulary
Remove `data_jurisdiction` and `processing_location`. Add:
- `recipients`: array of `{entity, role, country, ch5_safeguard}` entries covering every third party the data touched (e.g., `{entity: "Anthropic PBC", role: "processor-subcontractor", country: "US", ch5_safeguard: "DPF" | "SCC"}`).
- `processor_chain`: same concept, ordered.

*Pros:* exact alignment with GDPR Art. 30(1)(d)/(e) vocabulary; auditable against regulation text; machine-readable per-entry safeguards; extensible. *Cons:* breaking schema change; customers have to re-plumb; requires maintaining an accurate subprocessor list per capability; DPF certification status check for each US recipient is non-trivial ops work.

#### Option B — Redefine both fields as narrow, honest strings
- `processing_location` = physical region of the *Strale API replica that handled this request* (already implemented via `RAILWAY_REPLICA_REGION`). Document that this is *only* the API compute region, not a claim about downstream processors.
- `data_jurisdiction` = comma-joined set of ISO 3166-1 alpha-2 codes for every region where compute touched the data during this transaction, sourced from `getProcessingJurisdictions` but elevated to manifest-declared (per F-AUDIT-18) rather than inferred from `capabilityType`/`transparencyTag`.

*Pros:* minimal schema change; fixes F-AUDIT-01 (hardcoded "EU"); consistent across success/failure/free-tier. *Cons:* neither field has a regulatory anchor — they satisfy no specific article; the fields remain *invented* concepts with documentation. Does not tell a GDPR auditor anything about Art. 30(1)(e) safeguards.

#### Option C — Map to EU AI Act Art. 13(3)(a) provider identity
Rename / repurpose `processing_location` to `provider_location`: constant "SE/EU" (Strale is Swedish-registered, EU-based). `data_jurisdiction` → `data_source_jurisdictions`: manifest-declared set of jurisdictions where the *data source* operates (e.g., Allabolag SE; Companies House UK; Anthropic US).

*Pros:* direct anchor to Art. 13(3)(a) ("identity of the provider") and Art. 13(3)(b) ("input data specifications"); manifest-declared so F-AUDIT-18 heuristic is eliminated; distinguishes Strale-the-provider from data-source location. *Cons:* breaking field semantics for existing consumers; requires manifest backfill across 290+ capabilities; does not capture the runtime region of the API replica (loses the F-AUDIT-02 signal).

#### Option D — Layered schema: per-stage jurisdiction array
Replace both fields with a structured `jurisdiction_trace` array covering every stage of the pipeline:
```
jurisdiction_trace: [
  { stage: "api_ingress",   entity: "Strale API",       country: "US", region: "us-east-4" },
  { stage: "llm_extraction", entity: "Anthropic",       country: "US", safeguard: "DPF-certified" },
  { stage: "data_source",   entity: "Allabolag.se",     country: "SE", safeguard: "EU" },
]
```

*Pros:* highest regulatory fidelity — directly maps to Art. 30(1)(d)/(e) per stage; supports MAP 4.1 third-party component documentation; truthful about US hosting; future-proof for DIS 24970 data-lineage requirements. *Cons:* biggest schema change; requires per-capability manifest declarations for every external dependency; harder to summarise for UI; increases audit-trail JSONB size.

#### Option E — Status-quo plus disclaimer; defer field redesign
Keep the two fields. Fix F-AUDIT-01 (use computed jurisdictions in full/free-tier too). Document in `methodology_url` page exactly what each field means and does not mean. Add a note: "These fields are Strale schema; they are not field names defined in GDPR, the EU AI Act, or the Colorado AI Act. The GDPR-native equivalent is Art. 30(1)(d)/(e) recipient/transfer data, which Strale exposes at the subprocessor-list level (out of band)."

*Pros:* no breaking change; addresses the truthfulness gap (F-AUDIT-01); documents the invented-concept nature honestly. *Cons:* leaves the regulatory-anchor question open; leaves a surface where customers or regulators could still misread "EU" as a compliance claim.

---

## Implications for other Session F DECs

- **DEC-20260425-C (suspected: `human_oversight` truthfulness).** EU AI Act Art. 14 requires documentation of human oversight measures, not a specific string value. The current hardcoded `"autonomous"` + `"Automated execution with schema validation..."` pair plausibly satisfies Art. 14 for low-risk algorithmic capabilities but overstates for ai_generated capabilities where output is not reviewed. Suggest the DEC consider an enum {`autonomous`, `automated_with_validation`, `human_in_the_loop`, `human_on_the_loop`} aligned to EU AI Act Art. 14(4)(a)–(e), rather than a free string.
- **DEC-20260425-D (suspected: ISO/IEC 24970 citation accuracy).** The research here finds 24970 is a draft (DIS), not published. Any DEC on this should direct the codebase to either (a) remove 24970 citations until published, (b) re-cite as `ISO/IEC DIS 24970 (Draft)` and state "aligned with draft structure pending publication," or (c) substitute a published standard — ISO/IEC 42001:2023 fits. The module docstrings in `provenance-builder.ts` and `integrity-hash.ts` need updating.
- **DEC-20260425-E (suspected: `regulations_addressed` narrative accuracy).** The narrative strings in `routes/do.ts:2199–2213` assert what each article is "addressed" by — e.g., `article_13: "Transparency markers indicating AI vs algorithmic processing"`. Art. 13 is about instructions-for-use for *deployers*; the `transparency_marker` field is closer to Art. 50 than Art. 13. Re-map per the reading above.
- **R1 (processing_location semantics):** Now resolved via commit `d165ae2` reading `RAILWAY_REPLICA_REGION`. Semantic meaning deferred — this research confirms no reg requires the field; it remains a Strale invention whose meaning must be declared.
- **R4 (GDPR deletion vs. integrity hash):** Art. 17 right-to-erasure is unconditional where it applies. Strale's soft-delete + chain-walk broken-link reporting (F-AUDIT-13/16) surfaces deletions as tampering. GDPR does not contemplate integrity-chain design constraints; the collision is a Strale design problem, not a regulatory ambiguity. Fix is internal (redacted-link counter).
- **R5 (verify-endpoint consolidation):** No regulatory basis for two endpoints. Consolidation is good hygiene; no reg demands either be "public."
- **Colorado retention citation (`data-retention.ts:10, 20, 136`):** The code comment should be updated to note the amended effective date (2026-06-30 per SB 25B-004). The 3-year window itself remains defensible; the date citation does not.

---

## Gaps identified

Consolidating GAP cells from the matrix and narrative above:

1. **`data_jurisdiction` does not anchor to any regulation** as a standalone field. GDPR's equivalent is Art. 30(1)(e) third-country-transfer identification *including safeguards*, which the current string `"EU"` or `"EU,US"` under-represents.
2. **`processing_location` does not anchor to any regulation**. The nearest hooks (NIST MAP 4.1, EU AI Act Art. 13(3)(a)) are about third-party component documentation and provider identity respectively — neither maps cleanly.
3. **`applicable_regulations` / `regulations_addressed` arrays are not a required field in any regulation.** They are marketing-adjacent claims. Accuracy risk: if a claim is wrong (e.g., Art. 13 mapped to transparency_marker), the record misleads rather than informs.
4. **ISO/IEC 24970 is not a published standard.** In-code citations in `provenance-builder.ts`, `integrity-hash.ts`, `jobs/integrity-hash-retry.ts` cite it as "satisfied." It is a Draft International Standard (DIS), not finalised until Q4 2026 at earliest.
5. **Colorado AI Act effective date citation is stale** at `data-retention.ts:10, 20, 136`. Effective date is now 2026-06-30, not 2026-02-01.
6. **`human_oversight: "autonomous"` is a free string, not an EU AI Act Art. 14-aligned enum**, and is emitted even for ai_generated capabilities where the string may overstate actual oversight design.
7. **`personal_data_categories` is not cross-referenced to GDPR Art. 4 special-category data** (Art. 9) — a capability that processes health data or biometric data has a distinct obligation; Strale's current array is free-form.
8. **Subprocessor chain (who actually received the data) is not emitted anywhere in the audit record** — Art. 30(1)(d) recipient record lives only as an implicit claim via `processing_jurisdictions: ["EU", "US"]` in provenance. No entity names, no safeguard mechanism.
9. **No reference in code to Ch. V safeguard mechanism** (adequacy decision / SCC / BCR / DPF certification) for US-bound LLM processing.
10. **No regulation cited for the `shareable_url` + HMAC token design.** It is a good-engineering choice, not a compliance-required mechanism.
11. **`access_endpoint` / `deletion_endpoint` are narrative strings, not machine-readable structured links** — a GDPR Art. 12(3) "easily accessible" disclosure but unstructured.
12. **No cited standard anchors the `integrity_hash` chain design.** SOC 2 2026 "tamper-evident logging" is cited but SOC 2 is not a regulation (it's an auditor framework); ISO/IEC 24970 cited is a draft.

---

## Deferred scope

Not read in this pass, per the in-scope plan and the pre-mortem's scope-creep rule:

- **California AB 2013 (training data transparency, effective 2026-01-01)** — relevant for any capability using customer data for model training; Strale does not currently do this, so likely low-relevance; deferred.
- **NYC Local Law 144 (AEDT, in force since 2023)** — relevant only to employment-decision tools; Strale has no current employment-decision capability in scope for this audit.
- **US OMB M-24-10** — US federal procurement context; matters if Strale sells to US federal. Currently out of scope.
- **EU AI Act Articles 9, 10, 11, 15, 72, 79** — referenced by Art. 12 cross-reference but out of direct scope for audit-field mapping.
- **ISO/IEC 27001 / 27701** — security and privacy management; relevant to Art. 30(1)(g) "technical and organisational measures" but not within the audit-record-field remit.
- **Post-2024 EU AI Act implementing acts and delegated acts** — code of practice outputs from the AI Office; not yet finalised as of 2026-04-21 for most provisions.

---

## Self-flagged uncertainties

1. **EUR-Lex article text was not retrievable via WebFetch.** The consolidated HTML page at EUR-Lex returned only preamble/recitals for articles on every fetch attempt. Article-level text used in this report is from `artificialintelligenceact.eu`, which reproduces the Official Journal text and is widely cited by industry sources but is not the authoritative publisher. For any DEC grounding a formal compliance claim, re-verify article paragraph text against the OJ PDF before publication.
2. **NIST AI RMF subcategory text** was retrieved from NIST's AIRC knowledge base (secondary summary), not from the NIST AI 100-1 PDF (which returned as corrupted binary in WebFetch). Subcategory numbering (MAP 4.1, MEASURE 2.1, etc.) is consistent with published summaries but specific one-sentence texts should be re-verified against the PDF for any DEC wording.
3. **ISO/IEC 42001:2023 clause-level detail is paywalled.** Publicly known structure used here (Clauses 4–10); specific record-keeping clause content not reproduced. Any DEC citing 42001 at the clause level should be grounded in a purchased copy.
4. **ISO/IEC DIS 24970 text is not fully accessible.** Search results indicate Clause 8.3.1 addresses auditability of ML model state and decision pathways, but the draft is under enquiry and subject to change. Citing the draft in public compliance claims is risky.
5. **US LLM processing under GDPR Chapter V** depends on Anthropic's current DPF certification status, which is not tracked in-repo. The mapping Option A assumes the code would need to look this up; the actual current status (as of 2026-04-21) was not verified in this research pass.
6. **Colorado SB 25B-004 effective-date delay** was confirmed from multiple law-firm summaries (Akin, Baker Botts, Brownstein, Epstein Becker Green, NAAG). The bill's signed status (2025-08-28) and new date (2026-06-30) are consistent across sources; the original bill text and amendment text were not fetched verbatim. A formal citation should pull from `leg.colorado.gov/bills/sb25b-004` directly.
7. **Provider-vs-deployer classification for Strale customers.** This research assumes Strale is a provider and API customers are deployers. For some customer integrations (agent frameworks that transform outputs before end-user delivery), the customer may itself become a provider of a downstream AI system — doctrine on this point under the AI Act is not yet settled and implementing acts may clarify.
8. **The mapping matrix's ADDRESSES / PARTIAL / GAP classifications involve judgment.** Reasonable readers may disagree at the margins — particularly on fields whose regulatory anchor is implicit (e.g., `input_hash` as traceability under Art. 12(2), `transparency_marker` as Art. 50 vs Art. 13). The matrix is a starting point, not an adjudication.
9. **Article 12(2)'s "relevant for" framing is open-textured.** Regulators or courts may read the article as requiring broader logging than the minimum Annex III 1(a) list. Strale's current logging exceeds the 1(a) minimum, but whether it satisfies the general 12(2) purpose depends on case-by-case risk assessment.
10. **The "Sanctions Screening (31 CFR Part 501)" citation in `compliance-profile.ts:148–155` was not independently verified** — 31 CFR Part 501 is the US Treasury's reporting/procedures regulation, applied correctly at the narrative level, but the narrow trigger (only when capability slug is `sanctions-check`) means it is hard-coded rather than driven by capability metadata.
