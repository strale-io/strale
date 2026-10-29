Intent: vendor check of registercheck.de (Openlaw GmbH) under DEC-20261023-A, docs and config only.

- OUTBOX row `registercheck-terms-provenance` drafted (status draft, to info@registercheck.de). Only the inbox routine sends it.
- `config/vendors.yaml`: `registercheck` in state `evaluating`, decision `unknown` (DEC-20261023-A has no record file), licensing trigger on the OUTBOX row.
- No `vendor-terms.data.json` record: an empty-capabilities record reads as a removed vendor and its test requires the hosts on the prohibited list. Add it when Openlaw answers.
- Plan: `docs/research/2026-10-29-registercheck-coverage-comparison.md`. Runs only after written resale terms and a non-crawl provenance answer, and after Petter's go on a sign-up form.
- Open point: OpenRegister (live for german-company-data) is also a private register copy with terms, licensing and redistribution `unknown`; the same provenance questions should go to it.
- Next: when Openlaw replies, add the vendor-terms record and update vendors.yaml; reject or run the comparison.
