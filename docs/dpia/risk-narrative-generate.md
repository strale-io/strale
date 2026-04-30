# DPIA: `risk-narrative-generate`

**Last reviewed:** 2026-04-30
**Owner:** Strale (controller for Strale-side AI processing; processor for customer-supplied check_results)
**Re-review trigger:** Anthropic model snapshot change, change to the system prompt's WORDING RULES block, addition of new check_results context types

## 1. Description of processing

`risk-narrative-generate` accepts a structured `check_results` object
(typically the aggregated output of multiple compliance capabilities
in a KYB or invoice-fraud workflow) and a `context` discriminator
(`kyb` | `invoice_fraud`). It synthesises a plain-language risk
narrative — `risk_level`, `risk_score`, `summary`, `flags` (each with
`severity`, `finding`, `recommendation`, `source_check`),
`passed_checks`, and `data_sources_consulted`.

**Processing engine**: Anthropic Claude Sonnet (4.6 alias by default;
production should pin a snapshot via `RISK_NARRATIVE_MODEL` env for
replay determinism — see cert-audit Y-10).

**Personal data categories processed**: any personal data that appeared
in the `check_results` input. Typically includes `name`,
`date_of_birth`, `nationality`, and may include `political_affiliation`
(if the upstream PEP check produced findings) or implicit Art. 9 / Art.
10 data (if the upstream adverse-media check returned articles
mentioning protected categories).

**Where processing happens**: the Anthropic API endpoint (US region).
Strale is the controller for this synthesis step; the API caller
(Strale's customer) is the controller for the underlying `check_results`
data they passed in.

## 2. Necessity and proportionality

**Lawful basis** (controller-side): same as the underlying compliance
capabilities — typically Art. 6(1)(c) (legal obligation under AML/CFT)
or Art. 6(1)(f) (legitimate interests in due diligence).

**Necessity**: the synthesis step exists because compliance teams need
to review machine-generated screening results and a structured narrative
is more auditable than a wall of JSON. Without this step, the customer
would either build the same synthesis in-house (duplicated, uncovered
by Strale's wording-rule enforcement) or accept the loss of fidelity
that comes from showing raw JSON to a non-technical reviewer.

**Proportionality**: the input is bounded to the structured
`check_results` already produced by upstream capabilities. We do not
re-fetch source data; we do not generate new claims. The system
prompt explicitly forbids the model from asserting facts not present
in the input ("Never assert a fact that is not present in the
structured check_results input. If the data does not say it, you do
not say it.")

## 3. Risks to rights and freedoms

| Risk | Likelihood | Severity | Notes |
|---|---|---|---|
| **Art. 22 — solely automated decision** with legal or similarly significant effects | Medium-High | High | This capability is classified `risk_synthesis` (the highest Art. 22 classification). If the customer auto-acts on the output without human review, they are operating an Art. 22 decision system. Mitigated by the disclosure block in the audit response + the system prompt's wording rules + the manifest's known-limitations declaration. |
| **AI hallucination** — model asserts a finding that is not in the input | Low | High | The system prompt explicitly forbids this; the regex-based wording-rule check (cert-audit Y-10) catches a class of violations and falls back to algorithmic assessment when the LLM trips a prohibited phrase. Residual risk: model can still produce subtle factual errors that don't trip the regex. |
| **Defamation** — narrative produces an absolute claim ("X is a fraud") that would expose the controller (or Strale) to liability | Medium | High | System prompt's WORDING RULES enumerate prohibited absolute claims; PROHIBITED_PHRASES regex enforces a subset post-generation; algorithmic fallback used on violation. Documented in DEC-20260428-B engineering bar. |
| **Replay non-determinism** — same `check_results` produces different narratives across model alias updates, breaking audit replay | Medium | Medium | Mitigated by `RISK_NARRATIVE_MODEL` env override (production should pin a dated snapshot); audit response captures both `model_requested` and `model_resolved` (the actual snapshot Anthropic used). |
| **Cross-border transfer** — Anthropic processes in the US | Certain | Low to Medium | Mitigated by Anthropic's DPF certification (covered in Privacy §5); Strale's `gdpr.controller_obligations` block reminds the customer that the processing happens in the US even though their workflow may be EU-based. |
| **Audit retention of input** — `check_results` retained for the audit period (default 1095 days) means the synthesised personal data is also retained | Certain | Low | Same retention controls as other capabilities apply. Documented in Privacy §6 + §8 (the disclosure that audit-chain integrity prevents naive deletion of audit input). |

## 4. Mitigations

- **System prompt** with explicit citation rules ("Never assert a fact
  that is not present in the structured check_results input"), wording
  rules ("Never say 'This company is clean'"), and severity mapping.
- **Wording-rule enforcement** (cert-audit Y-10):
  `PROHIBITED_PHRASES` regex array post-checks the LLM output for
  absolute claims; on violation, abandons the LLM output and falls
  back to the algorithmic assessment. `provenance.fallback_reason =
  "llm_wording_rule_violation"` in the audit body.
- **Per-flag source citation**: every flag must reference the
  `source_check` key from the input that produced it. Flags without a
  source citation are considered invalid and trigger the algorithmic
  fallback.
- **Algorithmic fallback**: a deterministic rule-based assessment runs
  if the LLM is unavailable, returns malformed JSON, or trips the
  wording-rule check. The fallback is auditable; its reasoning is the
  capability's source code.
- **Replay-determinism via snapshot pinning**: `RISK_NARRATIVE_MODEL`
  env override; `model_resolved` in audit body for forensic reference.
- **Art. 22 disclosure**: the audit response carries
  `gdpr.art_22_classification = "risk_synthesis"` + the strongest
  disclosure text in the family ("If your downstream workflow
  auto-acts on this output without human review, you are operating an
  Art. 22 automated-decision system and must afford the data subject
  the right to obtain human intervention").
- **Dispute endpoint**: data subject can challenge the narrative via
  `POST /v1/transactions/:id/dispute`; admin reviews within 30 days.

## 5. Residual risk and decision

After mitigations, the residual risk is **acceptable for use as
decision-support** (a human reviews the narrative + check results
before any action) and **not acceptable for fully-automated
decisions** (where the customer's pipeline auto-acts on
`risk_level=high` without human review). The Art. 22 disclosure in
every audit response makes this distinction explicit.

The two highest-residual risks are:

1. **Subtle factual hallucination** that the regex doesn't catch and a
   reviewer doesn't notice. Mitigated by the per-flag source-citation
   requirement (a flag with a fabricated source_check value is
   identifiable on review) but not eliminated.
2. **Customer ignores the Art. 22 disclosure** and pipelines the
   output into auto-decision logic. We surface the disclosure and the
   `controller_obligations` text in every audit response, but we
   cannot enforce the customer's downstream behaviour.

## 6. Consultation

Per Art. 35(2) the DPO function (petter@strale.io) has been consulted.
Per Art. 36, no prior consultation with the supervisory authority is
required because the residual risk is acceptable when the customer
operates a meaningful human-review step. The Art. 22 disclosure block
puts the customer on notice that human review is required for
auto-action use cases.
