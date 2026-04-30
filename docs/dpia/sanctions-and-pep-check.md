# DPIA: `sanctions-check` + `pep-check` (combined)

**Last reviewed:** 2026-04-30
**Owner:** Strale (controller for Strale-side processing; processor for customer-supplied search inputs)
**Re-review trigger:** vendor change away from Dilisense (DEC-20260429-A supersession), addition of an AI-synthesis step, change to the Art. 22 classification, change to DEC-20260428-A scraping doctrine

These two capabilities share substantively-identical processing
description, vendor wrap, risk profile, and mitigations. Combining
them into one document keeps the assessments aligned (a change to
the wrap doctrine for one is a change to the other) and avoids the
copy-paste drift that the cert-audit found across other surfaces.

## 1. Description of processing

Both capabilities accept a person or company name (with optional
qualifiers — country, entity type, date-of-birth) and return matches
from upstream lists / databases.

| Capability | What it returns | Upstream |
|---|---|---|
| `sanctions-check` | Matches against 130+ international sanctions, debarment, and restrictive-measure lists (OFAC SDN, EU Consolidated, UN SC, HM Treasury OFSI, SECO, BIS, World Bank, EBRD, ADB, plus 125 national lists) | Dilisense Consolidated Sanctions database |
| `pep-check` | Matches against the consolidated PEP database covering 230+ territories per EU Commission Implementing Decision (EU) 2023/724, including Relatives and Close Associates (RCAs) | Dilisense Consolidated PEP database |

**Output (both)**: `match_count`, `total_results`, structured `matches`
(name, entity_id, classification, list/dataset, country attribution,
sanction_details / position history, last_updated_at), `lists_queried`
manifest with `source_count` and `source_catalog_url`.

**Personal data categories processed** (both):
- `name` (search input + matches in returned records)
- `date_of_birth` (optional; supplied by the controller for
  disambiguation)
- `nationality` / country of citizenship (returned in matches)
- For `pep-check`: `political_affiliation` and **Art. 9 special-
  category data** by definition (a PEP record IS information about
  political opinions / public office)
- For `sanctions-check`: **Art. 10 criminal allegation data** when
  the listing reason references criminal proceedings (e.g. some OFAC
  designations cite specific predicate offences)

**Where processing happens**:
- Search input fingerprint stored locally
- Vendor query goes to Dilisense (Switzerland, EEA-adequate)
- Strale stores the matches + audit body in the Strale database
  (Railway US East — see Privacy §5 international-transfers section)

## 2. Necessity and proportionality

**Lawful basis** (controller-side):
- **Sanctions screening**: Art. 6(1)(c) — legal obligation under the
  applicable sanctions regimes. EU operators must screen against the
  EU consolidated list under Council Regulations (e.g. 833/2014,
  269/2014); US persons must screen against OFAC SDN under 31 CFR;
  UK persons against OFSI under the Sanctions and Anti-Money
  Laundering Act 2018.
- **PEP screening**: Art. 6(1)(c) for AML-regulated entities (EU
  AMLD6, US BSA/AMLA, UK MLR 2017 §17), supplemented by Art. 9(2)(g)
  (substantial public interest for AML) and Art. 10 grounds where
  applicable.

**Necessity**: regulated entities are required by law to perform
this screening for every customer (sanctions) or every high-risk
customer (PEP). Without machine-speed screening with audit-grade
evidence, the cost of compliance scales linearly with onboarding
volume; Strale provides the infrastructure to do this at API speed
with the same risk profile as manual screening but with the audit
trail manual screening lacks.

**Proportionality**: the search input is the minimum necessary
(name + optional disambiguators). The output is bounded to the
matches and the source manifest; we do not return any data beyond
what the upstream vendor surfaces in its API. The customer can
configure their own retention via account-level controls (default
1095 days; configurable up to 7 years).

## 3. Risks to rights and freedoms

| Risk | Likelihood | Severity | Notes |
|---|---|---|---|
| **False positive — namesake confusion** (most common: common Russian / Arabic / Latin American names matching multiple list entries) | Medium-High | High | Mitigated by Dilisense's name-matching logic + customer-supplied `date_of_birth` (PEP) or country qualifier (sanctions). Documented in the manifest's `limitations` array; the audit body itemises every match so the customer can review individually. |
| **False negative — entity is sanctioned but not surfaced** (transliteration variant, recent designation not yet in the index, alias not captured) | Low | Low (data subject); High (controller's compliance posture) | Documented limitation. Customer must not treat absence as proof of clean record; cross-reference the primary source (e.g. OFAC RSS) for high-stakes designations. |
| **Disproportionate impact — controller refuses service based on a marginal match** | Medium | High | This is the central Art. 22 risk. Mitigated by the audit response's `gdpr.art_22_classification = "screening_signal"` + `art_22_disclosure` text + `dispute_endpoint`, which together put the controller on notice that they retain the decision and the data subject has a route to contest. |
| **Special-category data exposure under Art. 9** (PEP records reveal political opinions) | Certain by design (PEP) | Medium | Mitigated by lawful basis under Art. 9(2)(g) for AML compliance. Customer must ensure their own Art. 9 condition is satisfied. |
| **Single-vendor concentration** — Dilisense outage or data quality issue propagates to all downstream customers | Low | Medium | Per DEC-20260429-A, Dilisense is a single-vendor wrap on both capabilities (OpenSanctions was dropped after the licensing finding). Mitigated by the per-response source manifest (`lists_queried.source_catalog_url`) so customers can cross-check independently when stakes are high. |
| **Inaccurate or stale upstream data** — Dilisense's index lags reality | Medium | Low to Medium | Per-list version timestamps are not exposed by Dilisense's API; documented in the manifest's `limitations`. Output sets `lists_queried.last_updated_at = null` honestly rather than fabricating a freshness claim. |
| **Re-identification through audit retention** | Low | Medium | Audit chain retains input + output for the retention period (default 1095 days). Mitigated by `DELETE /v1/auth/me` + email-based absolute-Art. 17 erasure (see Privacy §8). |

## 4. Mitigations

- **Vendor wrap doctrine** (DEC-20260428-A Tier 2 + DEC-20260429-A
  single-vendor declaration): Dilisense selected because it has a
  documented redistribution licence + provenance per fact +
  Switzerland-based processing (EEA-adequate). The audit response
  carries `provenance.upstream_vendor`, `acquisition_method`, and
  `primary_source_reference` so the customer can verify on their
  own DPIA.
- **Engineering bar** (DEC-20260428-B): both capabilities ship a
  versioned dataset reference (per-call `lists_queried`), source
  manifest per response, audit chain integrity, dispute endpoint,
  replay capability, golden test suite, per-list source citation.
- **Per-response source manifest**: `lists_queried` field includes
  `source_count`, `major_lists`, `freshness_note`, and
  `source_catalog_url` — more transparent than the typical KYB SaaS
  "we screened against multiple lists" wording.
- **Honest false-positive handling**: the manifest explicitly
  documents that fuzzy matching produces false positives on common
  names; customers are directed to use date-of-birth (persons) and
  country (companies) for disambiguation. The output reports every
  match individually rather than collapsing to a single
  "is_sanctioned: true" without context.
- **Art. 22 disclosure**: every audit response carries
  classification (`screening_signal`), disclosure text reminding
  the controller that the screening signals are factual reports —
  not decisions — and the dispute endpoint URL.
- **Right-to-explanation**: the audit response itemises which
  Dilisense lists were consulted and which entries matched. This is
  the "logic involved" disclosure required by Art. 13(2)(f) /
  14(2)(g).
- **Right-to-contest**: `POST /v1/transactions/:id/dispute` accepts
  a dispute from the data subject (anonymous via signed audit
  token) or the controller (authenticated). All disputes are
  reviewed within 30 days; the audit chain row remains intact with
  the dispute disposition annotated.
- **Cross-border transfer mitigations**: Dilisense is in Switzerland
  (EEA-adequate); Strale's processing is in the US under SCCs +
  DPF (Privacy §5).

## 5. Residual risk and decision

After mitigations, the residual risk is **acceptable** for the
intended use cases (regulated AML / sanctions / PEP screening).

The two highest-residual risks:

1. **False positives** that could harm the data subject's ability
   to access services. Mitigated by the Art. 22 disclosure +
   dispute endpoint, but the controller must operate a meaningful
   human-review step before any adverse decision. We recommend
   our customers do not auto-decline based on a single
   sanctions-check match without manual review.
2. **Vendor concentration**: a Dilisense data-quality issue
   propagates to all downstream customers simultaneously.
   Mitigated by the per-response source manifest enabling
   independent cross-check, and by the dispute endpoint, but the
   controller should monitor dispute rates and consider a
   second-vendor cross-check for high-stakes decisions.

## 6. Consultation

Per Art. 35(2) the DPO function (petter@strale.io) has been
consulted. Per Art. 36, no prior consultation with the supervisory
authority is required because the residual risk is assessed as
acceptable after mitigations and because the processing operates
under express AML lawful basis (Art. 6(1)(c) + Art. 9(2)(g)).
