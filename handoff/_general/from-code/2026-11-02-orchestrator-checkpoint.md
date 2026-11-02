Intent: orchestrator checkpoint after the hotmail-ra takeover, so the next Strale orchestrator resumes from main alone.

# Orchestrator checkpoint, 2026-11-02 (cloud, account hotmail-ra)

**Supersedes `2026-11-01-orchestrator-checkpoint-afternoon.md`.** Everything there
still holds except what is listed below.

## Lease

The `fleet-lease` on the bus names account `hotmail-ra` and session
`session_01CR5YPravsp8tMjnTFyVYoK` for Strale (since 2026-11-02 13:09 Swedish
time). Check it with
`node .claude/scripts/bus.mjs lease --check --session <id>`; the bus repository
must be attached first (`add_repo` with `WOW_BUS_REPO`).

## Done this session

- **#877 merged and deployed** (`19e7c34b`, `/health` confirmed). This is round 2
  of the Serper `/goto` repair: it closes six defects that were live after #859.
  The worst was `google-search` leaking redirect wrappers in
  `knowledge_graph.website` and `sitelinks[].link`. The authoring session had run
  out of budget before verifying. This session took it over and merged `main`.
  A fresh read-only review found five should-fix items. Each was fixed with a
  test that fails without it. Detail: `2026-11-02-serper-goto-round-2-unlanded.md`.
- **Not verified in production: the output itself.** `google-search` is paid, and
  a cloud session has neither a Strale API key nor an x402 wallet (the
  `STRALE_API_KEY` in the PC `.env` is dead, carry-over facts §12). From the PC:
  make one `google-search` call for a query with a knowledge panel and sitelinks
  (a brand name, say), and confirm no `/goto` appears anywhere in the output.

## Next action

Unchanged from the previous checkpoint and now unblocked: **the `/resolve`
outcome record.** Today a Serper `/resolve` call leaves no trace:
`recordVendorCost` returns on 0 units (`apps/api/src/lib/call-cost.ts:100`), and
`recordVendorUsage` ignores units ≤ 0. Record success and failure as counts with
no content, so real traffic proves the path. The code is in
`apps/api/src/lib/serper-links.ts` (`resolveSerperLinks` returns `attempted`,
`resolved`, `unresolved`, `error`).

## Cloud-session notes learned today

- A fresh clone is shallow, and `operator-actions.yaml` cites
  `ad67e433f0bd…`, which no branch contains. The pre-commit context check then
  refuses every commit (`OPERATOR_ACTION_PREPARED_REF_INVALID`). Fix:
  `git fetch --unshallow origin` **and** `git fetch origin ad67e433f0bdb894999293ab3286aff8ab858ed6`.
- `main` merges only through the merge queue: `merge_pull_request` answers 405;
  use `enable_pr_auto_merge`.
- Root `npm run typecheck` needs `packages/mcp-server` and
  `packages/sdk-typescript` built first, as CI does.

## Waiting on Petter

Unchanged: DQ-44 Serper renew or lapse, **due 2026-11-06** (lapse delists seven
tools); the npm and PyPI trusted publishers; Better Stack for H8; the NTA form;
HMRC sandbox keys before ~11-12; Alchemy switch-on. Plus the PC-side output check
for #877 above.
