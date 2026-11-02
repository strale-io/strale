Intent: Record the Czech ARES reuse basis from the Ministry of Finance's 2026-10-29 reply, closing the Czech part of DQ-40.

[BACKFILL] Cloud session; no Notion writes. Branch `docs/cz-ares-reuse-basis`, worktree `strale-wt-ares`.

## Done

- Read ares.gov.cz/stranky/open-data, /vyvojar-info and /podminky-provozu (headless browser, honest StraleBot user agent; robots.txt disallows only `/cms/`, which was not fetched) and re-read the mf.gov.cz ARES page.
- `vendor-terms.data.json`: ARES record moved from `unverified` to `resale: "permitted"`, `basis: "published_terms"`, with the Czech text and translations, the MF reply and its no-individual-legal-assessment caveat. Not `written_permission`: no founder acceptance was recorded for this.
- `cz-company-data` provenance `source_note` and the manifest limitation now state the open-data reuse basis. The unverified "EU High-Value Dataset" designation claim was removed.
- DQ-40: dated update appended; the Swiss UID part stays open. OUTBOX: `czech-ares-reuse` closed with a reply line; `czech-ares-reuse-thanks` added as a draft for the inbox routine.

## Findings worth knowing

- None of the ARES pages requires a specific attribution wording. The conditions are: use within the operating conditions (500 queries/minute, no repeated/invalid/parallel/multi-IP evasion), data is informative only and not an official document, and do not alter its meaning without saying so. The tool's existing Czech source line is kept as good practice, not as a requirement.
- Not established: whether every field `cz-company-data` returns is on the published open-data list. The reply covers ARES-published information generally.
- `cz-company-data` is category `company-data`, so the post-deploy manifest-text sync is not report-only for it; the limitation text applies on deploy.

## Next

- Swiss UID reply (DQ-40 remainder), follow-up due 2026-11-09 per OUTBOX.
