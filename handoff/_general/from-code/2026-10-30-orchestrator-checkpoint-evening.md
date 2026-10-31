Intent: successor to the 2026-10-30 morning orchestrator checkpoint, so the Strale master orchestrator (bus identity `strale-planning`) can resume on any Claude account without chat history.

# Orchestrator checkpoint, 2026-10-30 (evening, Swedish time)

> **SUPERSEDED on 2026-11-01 by
> [`2026-11-01-orchestrator-checkpoint-cloud-move.md`](2026-11-01-orchestrator-checkpoint-cloud-move.md)**,
> written for the move of the orchestrator role to the cloud. Resume from that
> file: H3, H5 and H7 all closed after this one was written, and its remaining-work
> list is stale.

**This supersedes `2026-10-30-orchestrator-checkpoint.md`** (which itself
superseded `2026-10-28-orchestrator-checkpoint.md`). Read this one, then
`docs/programs/platform-hardening/PROGRAM.md` and
`docs/programs/distribution/PROGRAM.md` — their **Resume here** sections and
`tracks.yaml`.

Everything in the morning checkpoint that is not restated here still holds, in
particular its "Waiting on Petter" list and its x402 settlement reconciliation.

## Mandate, unchanged

DEC-20261027-B: implement platform-hardening (H1 to H8) and distribution (D0 to
D10) with as little founder involvement as possible. Shipping is never his
decision; the session that opens a PR merges it and reports afterwards. Codex
CLI does the straightforward building (gpt-6.1-sol for judgement, gpt-6-astra
for the money path, gpt-6.1-terra for precise fixes); Claude keeps planning,
briefing, review, independent verification, production verification and the PR
and checkpoint text.

## What this session did

### H7 is closed (platform-hardening T7 → `done`)

PR #853. Block **0141** drops the `capability_health` compatibility view, the
contract half of block 0134's rename. It refuses unless the old name is
relkind `v` and `source_health` is a table, and uses a bare `DROP VIEW`, never
`CASCADE`. Nine integration cases on real Postgres 16. Independent review by a
fresh read-only Claude context: **PASS WITH NITS**, all five fixed in the PR
(the `source_health` guard checked presence rather than relkind, two test gaps,
the rollback wording, and a production claim that did not state its source).

Details and the full evidence table:
`handoff/_general/from-code/2026-10-30-h7-capability-health-view-drop.md`.
Receipts: `archive/receipts/2026-10-30-check-h7-production-verification.json`
and `archive/receipts/2026-10-30-test-run-h7-capability-health-view-drop.json`.

**The production checks H7 owed are all answered**, read-only on commit
`928513ffc4c5`: the SQS residual columns and `sqs_daily_snapshot` are gone
(0132); `source_health` is a table with 318 rows and the drizzle-derived
constraint names, the breaker still recording (317 closed, 1 open);
`capability_health` was still a view; 0137's three columns and index are
present; 0139 left **0** target rows and had restored **17** customer
deletions; and the once/retired blocks (0030, 0087, 0089, 0103, 0118, 0137,
0139) still carry their 2026-10-29 `last_applied_at` while the `every_boot`
blocks moved to the 2026-10-30 boots, so H7d's ledger-hash skip holds.

**Verified in production after the deploy** (DEC-20260504-C, at the effect
level, not from a boot log line). PR #853 merged as `5406dbe5`, `GET /health`
reports `5406dbe5ba4a`, and:

| check | result |
|---|---|
| relations named `capability_health` or `source_health` | only `source_health`, relkind `r` |
| `to_regclass('capability_health')` | NULL — the old name resolves to nothing |
| block 0141 in `startup_migration_applied` | first = last applied `2026-10-30T18:44:07.134Z`, so it ran once |
| block 0134 after the drop (`every_boot`) | applied `18:44:07.089Z` and took its skip branch rather than failing, which the boot completing proves |
| breaker intact | 318 rows, 317 closed / 1 open |

Receipt: `archive/receipts/2026-10-30-check-h7-block-0141-post-deploy.json`.

**A property of production now:** a rollback to a build between blocks 0132
and 0134 needs `CREATE VIEW capability_health AS SELECT * FROM source_health`
by hand, and a build older than 0132 is already incompatible because 0132
dropped the SQS columns.

**T3 (H3) is the new active platform-hardening track.** Its remaining work is a
production check that deploy text and drift agree and that guaranteed-field
measurements are recorded.

### D1 went as far as it goes without Petter (distribution T2, still `active`)

Two upstream repairs are open and wait on their maintainers:

- [PipedreamHQ/pipedream#22383](https://github.com/PipedreamHQ/pipedream/pull/22383)
  — removes the dead `/v1/quality` method and the three descriptions that
  advertised it.
- [activepieces/activepieces#17060](https://github.com/activepieces/activepieces/pull/17060)
  — removes the Trust Profile action, which could never succeed, and four
  stale descriptions.

Three things the track's old `next_action` listed turned out already done:
both `server.json` copies read 0.2.9, npm `strale-mcp` 0.2.9 is published, and
the official MCP registry entry 0.2.9 went live on 2026-10-28 and is
`isLatest`.

Full state, including exactly why each remaining publish is blocked:
`handoff/_general/from-code/2026-10-30-d1-distribution-hygiene-upstream.md`.

## What Petter has to do for D1, stated exactly

Three npm packages are prepared and unpublished, all for the same narrow
reason: **the trusted-publisher entry is missing or points at the wrong
repository**, and only a logged-in npmjs.com session can create it.

| package | repo | npm | what is missing |
|---|---|---|---|
| `straleio` | 0.1.4 | 0.1.3 | published 0.1.3 has no provenance attestation — no trusted publisher configured |
| `straleio-langchain` | 0.1.1 | 0.1.0 | same |
| `n8n-nodes-strale` | 1.0.0 | 0.1.4 | 0.1.4 *has* provenance, but its attestation names `strale-io/n8n-nodes-strale` and `.github/workflows/publish.yml`, the retired standalone repository |

The entry in each case: organisation `strale-io`, repository `strale`, workflow
`release-npm.yml`, environment `npm-release`. **"The package has provenance"
is not the same as "this repository can publish it"** — read the attestation.

After that, no further login: a session pushes the tag and he approves the
`npm-release` environment, whose required reviewer is the real gate.

His other D1 items are already on the bus (PyPI trusted publisher for
`langchain-strale`, the first `strale-cli` publish, the
`strale-semantic-kernel` deprecation) plus the Smithery duplicate listing
`strale/agent-tools` and the Smithery and 402 Index listing edits, which are
account-side.

## Remaining work, in order

1. **H3 (T3):** the production check that deploy text and drift agree and that
   guaranteed-field measurements are recorded.
2. **H5 (T5):** a production query showing per-call costs recorded on real
   calls.
3. **H6 (T6):** switch `INPUT_VALIDATION_MODE` to enforce after seven clean
   days of report-mode logs — #786 landed 10-28, so not before **11-04**.
4. **D1 publishes**, the moment the trusted publishers exist; then the
   post-publish production smoke tests, which DEC-20260422-A step 6 owes on
   every published artefact.
5. **The Strale inbox routine** (DEC-20261027-C) and the connector probe.
6. **D10:** the 45-day free-tier review, recorded for 2026-12-12.
7. **Two hardening items from review, no money impact:** a replayed payment
   hash used on a different capability of the same price returns the first
   capability's output (gateway and `/v1/do`); a thrown facilitator call on
   `/v1/do` still returns the legacy 500 envelope.
8. **Carried from the morning run:** the `image-resize` production suite still
   points at the robots-disallowed gstatic fixture and needs a write-authorised
   `onboard.ts --backfill`; LESSONS.md is not updated for the #786 class.
9. **New, found this session:** `apps/api/src/lib/email-templates.ts:124`
   links customer-facing mail to `https://api.strale.io/v1/internal/trust/
   capabilities/batch` — a deleted route that answers 401. One line, next
   platform batch.

## Not this session's, deliberately

Three test suites (`eurostat-data`, `entity-resolve`, `places-search`) still
hold frozen timestamp assertions and their backfill fails in 4 ms; see
`handoff/_general/from-code/2026-10-30-backfill-blocked-three-slugs.md`.
Another session is retrying those and owns the **Onboard capability** workflow.

## Next authorised action

Item 1, then item 2. Both are inside the DEC-20261027-B mandate. Start in a
fresh worktree from `origin/main`; the trunk stays on `main`.
