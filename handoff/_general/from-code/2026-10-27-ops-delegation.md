Intent: record Petter's 2026-10-27 delegation of no-spend accounts and email, and make the inbox a duty that works from any Claude account.

What changed:
- DEC-20261027-A is added to CLAUDE.md, and CHARTER.md "What still needs Petter" item 2 is narrowed. Sessions may now:
  - create free accounts and accept click-through terms;
  - email registries and vendors from petter@strale.io;
  - store credentials in Bitwarden Secrets Manager (EU, project `strale-portfolio`).
- These stay Petter's: spend, signed counterparty agreements, CAPTCHAs (never bypassed), SMS or ID checks, public posts, and customer outreach.
- New procedure: `docs/operations/accounts-and-email.md`.
- New register: `docs/company/OUTBOX.yaml`, seeded with the seven external threads open on 2026-10-27 (NTA invoice ID, HMRC CNS433, datacircle, probe402, Serper, Swiss UID, Czech ARES).
- DAILY-RUN.md gains step A2, the inbox. It searches the inbox and Junk for replies to OUTBOX rows, sweeps for new Strale-relevant mail, follows up when a row is overdue, and closes finished rows.

Left:
- Petter creates the Bitwarden organisation, the project and the machine account, then sets `BWS_ACCESS_TOKEN` in each Claude cloud environment he uses.
- The first sign-up batch (India data.gov.in, New Zealand NZBN preparation, Korea data.go.kr attempt) runs once the token is present.
