# Notion consumer migration inventory

Date: 2026-08-31
Milestone: M0
Authority: execution inventory for the agreed migration plan; not product truth

## Runtime and scheduled consumers

| Consumer | Current Notion dependency | Repo-native owner/replacement | Cutover treatment |
|---|---|---|---|
| Daily digest priorities | Decisions DB and Journal DB through `apps/api/src/lib/daily-digest/fetch-notion.ts` | Decision records/generated active index plus repo-native recent-work and action records | Build in M3 shadow mode; switch and remove `NOTION_API_KEY` in M4 |
| Daily digest distribution summary | Archived Distribution Surfaces Registry `32e67c87-082c-81de-861f-dcc53576304c` / data source `72d0ca57-55cb-4b4b-8a73-cbd769a08f39` | Versioned distribution registry under `docs/operations/`, with Git/GitHub evidence | Reconcile rows, shadow-compare in M3, atomic switch in M4 |
| Daily ship log | Workspace-wide Notion search plus Journal/Social database inference in `fetch-shiplog.ts` | Git/GitHub merged-work feed, repo-native session evidence, and versioned distribution/social records where still useful | Replace in M3; remove workspace search at M4 |
| Weekly vendor drift | Vendor Roster plus Active Vendor Stack via `check-vendor-roster-drift.ts` and `.github/workflows/weekly-drift.yml` | Runtime manifests/coverage matrix/platform facts as primary facts, plus a scoped repo vendor-evaluation register for non-runtime commercial state | Implement and compare in M3; remove `NOTION_TOKEN` and Notion reads in M4 |

## Human and agent workflow consumers

| Consumer | Current dependency | Repo-native owner/replacement | Cutover treatment |
|---|---|---|---|
| `CLAUDE.md` and `AGENTS.md` | Project Home, To-do, Decisions, and Notion governance | Peer thin entrypoints routing to `docs/project/START-HERE.md` and `PROTOCOL-ROUTER.md` | Activate only in the atomic M4 cutover |
| Session start/end | Project Home, Current State, Journal write, To-do archive, Decisions check | `STATE.md`, `ROADMAP.md`, decision records, `RECENT.md`, Git evidence, and narrowly-scoped handoffs | Prepare command/skill replacements in M3; no dual write |
| `.claude/PROTOCOL.md`, `.claude/RUNBOOK.md`, `.claude/NOTION.md` | Notion-backed context loading, databases, and degraded mode | Shared working model, protocol router/full bodies, decision records, project state/roadmap | Extract unique rules before archiving in M5 |
| `.claude/DISPATCH.yaml` | Granular `notion_read`/`notion_write` capability declarations and context-loading contracts | Repo-native dispatch declarations backed by project docs, decision records, recent-work evidence, and scoped registries | Inventory every declared read/write in M3; remove or replace atomically in M4 |
| `.claude/commands/end-session.md` | Hardcoded Journal/To-do data sources plus Notion search/write steps | Repo-native close-check, state/decision/operator-action updates, Git evidence, and exceptional handoff only | Prepare the replacement command in M3; disable Notion writes in the M4 cutover |
| Capability/vendor procedures | Notion specification and DEC links embedded in instructions | Full repo protocol bodies plus preserved decision records/evidence | Migrate load-bearing content before M4; historical links may remain only as evidence |

## Export coverage

The raw export at `archive/imports/notion/2026-08-31/` identifies every named
database/page directly read by active code or workflows and includes the
project-memory surfaces required by the migration plan:

- Decisions, Journal, To-do, Deferred, Glossary, Feature Registry;
- Distribution Registry, Social Media Posts, Vendor Roster, Active Vendor Stack;
- Project Home and section indexes;
- strategy/current-state candidates, including duplicate archived pages;
- recent website-redesign decision/context pages discovered by targeted search.

The Decisions, Journal, To-do, and Vendor Roster SQL responses are currently
first-page-only (100 rows, `has_more: true`). The Notion workspace query quota
was exhausted while paging them, so M0 remains incomplete until a full export
is ingested. The page/schema coverage and consumer mapping are usable as
inventory evidence; the truncated rows are not a complete historical corpus.

Workspace-wide search is an unbounded consumer rather than a finite authority.
Its replacement is not a full workspace mirror: durable conclusions move into
the canonical repo layer, while this export and historical Notion links remain
evidence.

## Secrets and configuration retirement

- `NOTION_API_KEY` is consumed by the daily digest.
- `NOTION_TOKEN` is consumed by the vendor-drift workflow/script.
- Both may be removed only after their consumers have switched and the
  replacement scheduled paths are verified without those secrets.
- M4's permanent guard rejects new active Notion runtime/API/MCP dependencies;
  archive/import evidence is exempt.
