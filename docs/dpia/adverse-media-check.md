# DPIA: `adverse-media-check`

**Last reviewed:** 2026-04-30
**Owner:** Strale (controller for Strale-side processing; processor for customer-supplied search inputs)
**Re-review trigger:** vendor change (Dilisense or Serper.dev), DEC-20260428-A or DEC-20260428-B amendment, addition of an AI-synthesis step

## 1. Description of processing

`adverse-media-check` accepts a person or company name (with optional
country and entity-type qualifiers) and returns adverse-news findings
from upstream sources. Two-tier vendor wrap:

- **Primary**: Dilisense Adverse Media. ~235,000 sources, FATF-aligned
  categorisation. Per-call query of the consolidated index.
- **Fallback**: Serper.dev (Google Search wrapper) when Dilisense is
  unavailable. Deterministic keyword classification on the result set;
  no LLM step.

**Output**: `risk_level` (none | low | medium | high), category counts,
top article headlines with source URLs + publication dates, and the
explicit rule used to classify severe vs non-severe coverage.

**Personal data categories processed**:
- `name` (search input + matches in returned articles)
- Implicitly may include `nationality`, `political_affiliation`, **Art. 10
  criminal allegation data**, **Art. 9 special-category data** (sexual
  orientation, religious belief, political opinion) where these appear
  in the returned articles.

## 2. Necessity and proportionality

**Lawful basis** (controller-side): typically Art. 6(1)(c) (legal
obligation under AML/CFT regulations including EU AMLD6, US BSA/AMLA, UK
MLR 2017) or Art. 6(1)(f) (legitimate interests in conducting due
diligence on a business counterparty). For Art. 9/10 data, the controller
must additionally rely on Art. 9(2) condition (typically (g): substantial
public interest under Member State law, e.g. AML compliance) and Art. 10
(processing under Member State law that provides appropriate safeguards).

**Necessity**: regulated entities (banks, fintechs, KYB providers) are
required by law to conduct adverse-media screening as part of enhanced
due diligence (EDD) for high-risk customers. Strale provides the
infrastructure to do this once, at machine speed, with audit-grade
evidence — replacing manual Google searches that would otherwise be
performed by compliance staff, with the same risk profile but without
the audit trail.

**Proportionality**: the search input is the minimum necessary
(name + optional country + entity type). The output is bounded to the
top headlines + structured categorisation; we do not return full
article bodies. The customer can configure their own retention via the
account-level retention controls (default 1095 days; configurable up
to 7 years).

## 3. Risks to rights and freedoms

| Risk | Likelihood | Severity | Notes |
|---|---|---|---|
| **False positive** — entity flagged for adverse media that does not actually pertain to the data subject (e.g. namesake confusion) | Medium | High | Upstream search engines do not always disambiguate. Mitigated by Dilisense's name-matching logic + customer-supplied country qualifier. The audit body reports the matched articles individually so the customer can review. |
| **False negative** — adverse media exists but is not surfaced (different language, paywalled source, recent publication not yet indexed) | Medium | Low (for the data subject; high for the controller's compliance posture) | Documented limitation in the manifest. The customer must not treat absence of adverse media as proof of clean record. |
| **Disproportionate impact** — a marginal result causes the controller to refuse service / decline a transaction | Medium | High | This is an Art. 22 risk and is mitigated by the disclosure block on the audit response (`gdpr.art_22_classification = "screening_signal"` + `art_22_disclosure` text + `dispute_endpoint`). The Strale documentation explicitly tells the controller they remain responsible for the decision. |
| **Vendor lock-in / single-source risk** — Dilisense outage produces fallback to Serper, which has different coverage characteristics | Low | Low | Documented in the audit body's `provenance.upstream_vendor` field, which records the actual source used. |
| **Inaccurate or stale upstream data** — Dilisense's index lags reality | Medium | Low to Medium | Per-list timestamps are not exposed by Dilisense's screening API; documented in the manifest's `limitations` array. |
| **Re-identification through audit retention** | Low | Medium | Audit chain retains input + output for the retention period (default 1095 days). Mitigated by the `DELETE /v1/auth/me` endpoint + `petter@strale.io` contact for absolute Art. 17 erasure (see Privacy §8). |

## 4. Mitigations

- **Vendor wrap doctrine** (DEC-20260428-A Tier 2): Dilisense is selected
  because it has a documented redistribution licence + provenance per
  fact + Switzerland-based processing (EEA-adequate). Serper fallback is
  US-processing (DPF-eligible). The audit response carries
  `provenance.upstream_vendor`, `acquisition_method`, and
  `primary_source_reference` so the customer can verify.
- **Engineering bar** (DEC-20260428-B): all compliance capabilities ship
  versioned datasets, source manifests per response, audit chain
  integrity, dispute endpoint, replay capability, golden test suite.
- **Art. 22 disclosure**: every audit response carries the
  classification (`screening_signal`), plain-language disclosure text,
  and the dispute endpoint URL. The data subject receives a shareable
  audit URL that includes the dispute path.
- **Right-to-explanation**: the audit response itemises which sources
  were consulted, which articles were returned, and the rule used to
  classify severity. This is the "logic involved" disclosure required
  by Art. 13(2)(f) / 14(2)(g).
- **Right-to-contest**: `POST /v1/transactions/:id/dispute` accepts a
  dispute from the data subject (anonymous via signed audit token) or
  the controller (authenticated). All disputes are reviewed by a
  Strale operator within 30 days; the audit chain row remains intact
  with the dispute disposition annotated.
- **Honest error reporting**: when Dilisense returns 0 results, the
  output explicitly says "no adverse coverage found in the sources
  consulted" rather than "the entity is clean" — preventing the
  customer from over-relying on a negative result. (See the WORDING
  RULES in the system prompt for `risk-narrative-generate`.)

## 5. Residual risk and decision

After mitigations, the residual risk is **acceptable** for the intended
use cases (regulated AML / KYB workflows). The two highest-residual
risks are:

1. **False positives** that could harm the data subject's ability to
   access services. Mitigated by the Art. 22 disclosure + dispute
   endpoint, but the controller must operate a meaningful human-review
   step before any adverse decision. We recommend our customers do
   not auto-decline based solely on the `risk_level=high` output.
2. **Vendor concentration**: a Dilisense data-quality issue propagates
   to all downstream customers simultaneously. Mitigated by the
   per-response source manifest and the dispute endpoint, but the
   controller should monitor the rate of disputes and consider a
   second-vendor cross-check for high-stakes decisions.

This DPIA will be re-reviewed if the upstream vendor changes, if
Strale adds an AI-synthesis step (currently the cap is purely
deterministic categorisation), or if the engineering bar is amended.

## 6. Consultation

Per Art. 35(2) the DPO has been consulted. (Strale operates without a
formal DPO at the current scale; petter@strale.io serves the DPO contact
function.) Per Art. 36, no prior consultation with the supervisory
authority is required because the residual risk is assessed as
acceptable after mitigations.
