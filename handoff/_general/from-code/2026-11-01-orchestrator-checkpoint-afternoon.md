Intent: orchestrator checkpoint before a possible account takeover (usage limit), so the next Strale orchestrator resumes from main alone.

# Orchestrator checkpoint, 2026-11-01 afternoon (cloud)

**Supersedes `2026-11-01-orchestrator-checkpoint-cloud-move.md`.** That
checkpoint's "Next action" (the docs_only CI audit) is done, and its claim that
cloud sessions verify production through `strale_verify` is wrong; see below.

## Done this session (all merged)

- **#867** CI: the twelve docs_only-gated scanners were correctly gated, but the
  gated apps/api suite (8 test files, now `DOCS_READERS` in
  `apps/api/vitest.config.ts`) and the Zapier suite read docs. Those now always
  run, and gated test steps run under `scripts/ci/run-without-docs-reads.mjs`.
- **#868** DQ-44 Serper renewal: the cost is $62.50 incl. VAT per 6 months, ~430
  credits/month. Report: `2026-11-01-serper-renewal-report.md`.
- **#870** DEC-20261101-A Codex builder lanes, adopted with Petter's rules 4b/4c;
  `.claude/cloud.json` crossTool.
- **#871 / #873** archive scrub: Bosch directors, KYB transaction ids and Phase C
  transaction ids removed from current files (no history rewrite).
- **#872 / #874 / #875** cloud sessions cannot reach Postgres. Prod-verify via a
  private-repo GitHub Action was designed, approved, then **deferred**: it needs
  GitHub Team, which Petter declined for now. **Production verification stays
  on the PC.** Raise it again only if deploys wait on his PC, with the current
  Team price.

## Next action

The `/resolve` outcome record: today a Serper `/resolve` call leaves no trace
(`recordVendorCost` returns on 0 units; `recordVendorUsage` ignores units ≤ 0).
Record success/failure as counts with no content, so real traffic proves the
path. Verification of it is PC-side until prod-verify exists. Not started.

## Waiting on Petter

- **DQ-44 Serper renew/lapse**, needed by 2026-11-06. The OUTBOX row
  `serper-credit-rollover` is still an unsent draft; only the local inbox session
  can send it.
- Earlier items unchanged: npm/PyPI trusted publishers, Better Stack for H8,
  HMRC sandbox keys before ~11-12, NTA form (DQ-43), Alchemy switch-on.
- **Codex lanes:** DEC adopted. No lane has been dispatched yet; the dispatcher
  needs its own device-code sign-in, approved by Petter from that session.

## Facts a takeover needs

- `STRALE_RAILWAY_DB_VERIFY_URL` moved to Bitwarden project `pc-only`; the cloud
  fleet token cannot read it (wow-core#214).
- The merged remote branch `claude/orchestrator-cloud-handover` could not be
  deleted from cloud sessions (the classifier refused it); Petter deletes it on
  GitHub, if he hasn't.
- A fresh cloud clone is shallow; `git fetch --unshallow origin` before
  committing inventory files.
