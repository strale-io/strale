Intent: vendor check of registercheck.de (Openlaw GmbH) under DEC-20261023-A, docs and config only.

- OUTBOX row `registercheck-terms-provenance` drafted (status draft, to info@registercheck.de). Only the inbox routine sends it.
- `config/vendors.yaml`: `registercheck` in state `evaluating`, decision `unknown` (DEC-20261023-A has no record file), licensing trigger on the OUTBOX row.
- `vendor-terms.data.json`: unverified record, no capabilities.
- Plan: `docs/research/2026-10-29-registercheck-coverage-comparison.md`. Runs only after written resale terms and a non-crawl provenance answer, and after Petter's go on a sign-up form.
- Open point: OpenRegister (live for german-company-data) is also a private register copy with terms, licensing and redistribution `unknown`; the same provenance questions should go to it.
- Next: when Openlaw replies, record the answer in vendor-terms and vendors.yaml; reject or run the comparison.
