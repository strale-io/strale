Intent: the Strale master after the 2026-11-06 account takeover (session session_01Ms71ZkYLtEVEsZBfEXzD9i, parent wow-core takeover session_01Ms71ZkVFM5MB5PU8UKr6Lz) resumed from `2026-11-06-orchestrator-state.md` and worked its list in order.

[BACKFILL] Cloud session; no Notion write was made.

## Lease

`bus.mjs lease --check --session session_01Ms71ZkYLtEVEsZBfEXzD9i --parent session_01Ms71ZkVFM5MB5PU8UKr6Lz` → active (account gmail, lease of 2026-11-06T21:12:55Z; it names wow-core and codex-dispatcher, no strale entry yet). Run with `--parent` until the lease gets a strale entry. The bus repo had to be attached with add_repo first.

## PRs

| PR | State | Next |
|---|---|---|
| #949 polish-company-data label | Independent review of de8140d4 PASS-WITH-NITS. Its MEDIUM finding: the row's `capability_type` is still `ai_assisted` (hybrid column, never rewritten), which types the tool "ai" in the audit body and ties it to Anthropic's health gate. Fixed in b8965627: block 0146 also sets `stable_api`, guarded on `ai_assisted`. The M089 ledger row was regenerated, since it was never on main. Delta review PASS-WITH-NITS. Main merged in; auto-merge on. | After deploy: `GET /v1/capabilities/polish-company-data` shows `"transparency_tag":"algorithmic"` (DEC-20260504-C). |
| #953 RECURRING.yaml due-list | Independent review PASS-WITH-NITS. All findings fixed in c95bdff7. The daily-run row was set to 2026-11-06 after #952's run. Auto-merge on. 55/55 `handoff:test`. | None once merged. Session start now prints overdue rows. `weekly-review` is 75 days overdue. |
| #952 daily check-in (another session) | Its block 0147 uses ledger id **M089**, which collides with #949. Its session could not merge (classifier). | Once #949 merges: merge main into `chore/checkin-2026-11-06`, renumber its ledger row to M090 (`check-migration-ledger.mjs --update` after removing its row), add 0146 to the BLOCKS order test, run an independent review, enable auto-merge. Post-deploy: `vendor:status` Serper healthy, expiry 2027-05-05. |
| `fix/aml-fatf-lists-2026-10` (862eba94) | FATF grey list updated to the 18 jurisdictions of 30 Oct 2026. Black list unchanged (KP, IR, MM). New test fails 6/6 before the change, passes 6/6 after. The independent review was running at the time of writing. | Open the PR with the review result, then auto-merge. |
| #950 x402 alert | Draft. Do not merge (three review rounds). | Per-payer burst cap redesign, as its body says. |

## FATF source note

fatf-gafi.org answers bots with a Cloudflare challenge (`cf-mitigated: challenge`). It was not worked around (DEC-20261023-A). The list comes from the FinCEN release of 30 Oct 2026 (four removals, no additions named, call-for-action unchanged) and the ComplyAdvantage plenary note (full 18). RegReportingDesk agrees but derived its list. Recheck after each plenary (February, June, October). A RECURRING.yaml row for that belongs in the next change to the file.

## Open, not started

- **EU high-risk list in `aml-risk-score` (`EU_HIGH_RISK`) is stale.** It still holds PA, JM, BB, GI, UG (delisted by the EU in 2025) and misses later additions. It needs research against the current Delegated Regulation (EU) 2016/1675 consolidation.
- `apps/api/src/data/error-codes.ts` `AI_ASSISTED_SLUGS` is a stale snapshot (polish-company-data, token-count, secret-scan and others). Only `scripts/populate-error-codes.ts` reads it.
- `strale-ai-sdk` and `strale-cli` pre-publish checks: an agent was running them at the time of writing. Publish nothing until they pass (Petter decision 3).
- From the orchestrator list, still open:
  - item 1, the business-summary email job;
  - item 7, the PC forms brief;
  - the 402 Index route;
  - the DQ-41 promotion path;
  - cost trims;
  - the robustness programme files;
  - the Codex branch reviews (no result yet).
- From #952's record: robots-disallowed listed tools (`customs-duty-lookup`, `container-track`); `exchange-rate` with 31 % paid failures.

## Environment notes

- The clone starts shallow, so `context:generate` and the context check report `*_NOT_ANCESTOR`. Run `git fetch --unshallow origin main` first. `OPERATOR_ACTION_PREPARED_REF_INVALID` needs `git fetch origin ad67e433f0bdb894999293ab3286aff8ab858ed6`.
- `context:generate` refuses the primary checkout. Work in a batch worktree (`strale-wt-recurring`).
- `BWS_ACCESS_TOKEN` is set but no `bws` CLI is installed. `STRALE_OPS_READ_TOKEN` does not exist yet, and ops-read has no capability-field check.
