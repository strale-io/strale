# Data Protection Impact Assessments (DPIAs)

Strale is the **processor** for capability calls; the API customer is the
**controller** of the personal data they pass in. Under GDPR Art. 35, the
controller is responsible for conducting a DPIA when processing is "likely
to result in a high risk to the rights and freedoms of natural persons".

This directory contains DPIAs for the Strale capabilities where the
processing characteristics meet at least one Art. 35(3) trigger
(automated decision support, large-scale processing of special-category
data, or systematic monitoring). They are written so that:

1. **Strale's own internal processing** has a documented risk assessment
   covering the AI synthesis step we operate on the customer's behalf.
2. **The customer (controller)** has a starting point for the part of
   their own DPIA that covers the Strale step in their pipeline.

These are reference documents; they are not legal advice. The customer
remains responsible for their own DPIA, including the parts of the
processing that happen before the data reaches Strale and after the
result returns.

## Index

| Capability | Trigger | Document |
|---|---|---|
| `sanctions-check` + `pep-check` (combined) | Art. 9 special-category data (PEP) + Art. 10 criminal data (sanctions) + Art. 22 screening signal | [sanctions-and-pep-check.md](sanctions-and-pep-check.md) |
| `adverse-media-check` | Art. 9 special-category data + Art. 10 criminal data | [adverse-media-check.md](adverse-media-check.md) |
| `risk-narrative-generate` | Art. 22 automated decision support | [risk-narrative-generate.md](risk-narrative-generate.md) |
| `company-enrich` | Web-scraped data may include personal data of officers/contacts | [company-enrich.md](company-enrich.md) |

The combined sanctions + pep DPIA exists as a single document because
the two capabilities share substantively-identical processing
description, vendor wrap (Dilisense per DEC-20260429-A), risk
profile, and mitigations. Keeping them in one document prevents the
copy-paste drift the cert-audit found across other surfaces.

Last reviewed: 2026-04-30. Re-review trigger: any change to the upstream
vendor (sanctions/PEP/adverse-media), the AI model used by
`risk-narrative-generate`, or DEC-20260428-A/B engineering bar.
