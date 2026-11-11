Intent: Strale master checkpoint (account 1fg), 2026-11-11 about 06:30 Swedish time. The 1fg seven-day limit is expected around 08:30 Swedish time (wow-core master reading, moderate confidence) and resets Sat 14 Nov 01:00 Swedish time. Written so another account can cold-start; supersedes `2026-11-11-strale-master-checkpoint-1fg.md`.

Session: session_01RFNL6WAcqYWJKtyJRfBGCw (Strale master, account 1fg). Codex dispatcher: session_01RFNL6Woeo8gui2dFw3uKci (send it the bare slug only). No Codex slug is in flight. A new master starts with the wow-core lease check, then reads this file, `docs/programs/README.md` and `docs/programs/robustness/PROGRAM.md` (Resume here).

## Deployed and verified since the 02:00 checkpoint

| PR | Change |
|---|---|
| #1002 | production-watch acknowledges known failures (`scripts/production-watch/known-failures.json`, `ingest-ee-directors` until 2026-12-11, issue #856) |
| #1003 | NTA XML shape bound before jsdom |
| #1006 | url-to-markdown per-caller fairness (/health f1282238) |
| #1007 | robustness T1 closed (three R1 receipts), T3 active |
| #1008 | weekly-drift: three strale.dev recordings re-captured through the 301; redirect hops unperturbed in the replay test |

No open PR from this session after #1008. No worktree but the trunk.

## Robustness T3 (active): the four signals

1. **Serper `vendor:status` receipt.** Blocked here: needs the operator DB (PC, or a permission to read the Bitwarden secret through `bws run`; listing was refused by the classifier and must not be worked around).
2. **x402 settlement-drop alert** (#950, draft, do not merge): redesign as a per-payer burst cap. A Codex brief candidate (`codex/<slug>` branch with the brief, then the bare slug to the dispatcher).
3. **production-watch:** manual run 42937874567 (02:17 Swedish time) green; still owes a green *scheduled* run and a forced-mismatch receipt (`scripts/production-watch/demonstrate-alerts.mjs`).
4. **weekly-drift:** fixed by #1008; owes the green scheduled run on Mon 16 Nov about 08:00 Swedish time. Still open: record the 2026-11-06 check-in's misreading of the weekly-drift causes in LESSONS (F1 or F7, with the count it changes).

## What Petter should watch by hand during the gap

- **API health:** https://api.strale.io/health should answer 200. If it does not, Railway project Strale, service strale, Deployments: roll back to the last green deployment.
- **production-watch** (GitHub Actions, scheduled every 30 min, runs are sparse): a red run that is not issue #856 is a new failure.
- Nothing else is mid-deploy.

## Waiting on Petter at the PC

- Six fixture-bound manifests still name strale.dev (base64-encode-url, og-image-check, page-exists, cert-transparency-search, meta-extract, url-to-text): move to strale.io with `onboard.ts --backfill` against the DB, then re-capture the three recorded ones (`env -u FRONTEND_URL npx tsx scripts/record-upstream.ts --slug ...`).
- image-resize `format: guaranteed` and `output_schema` sync (`sync-manifest-canonical-to-db.ts image-resize --fields output_field_reliability,output_schema`).
- Haiku 5.5 comparison; DB-backed validate and smoke runs for domain-age-check, exchange-rate, currency-convert, forex-history, image-to-text; npm, PyPI, directory and Zapier asks; Better Stack.
- Leftover remote branches `codex/converter-caller-fairness` and `codex/converter-caller-fairness-2`: delete on his word.

## Later

T4: container-track (delist or official APIs, from the 30-day paid volume), DQ-41, DQ-48.

## Out of scope for this session

Revenue, website and customs-duty work belong to Petter's PC Codex lane.
