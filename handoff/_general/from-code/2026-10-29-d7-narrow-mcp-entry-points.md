Intent: build, review, ship and list distribution track D7 (T8): at most three narrow MCP entry points on the existing backend, measurable per entry point, under DEC-20261027-B's publish class.

# D7 narrow MCP entry points

## What was built

- **Three entry points** at `https://api.strale.io/mcp/<id>`: `company-check`, `eu-vat-check` and `web-reader`. They are defined once in `packages/mcp-server/src/entry-points.ts`.
  - Each exposes one MCP tool per capability, named by its slug. A slug the live catalogue does not serve gets no tool.
  - Execution goes through the same `executeCapability` and `POST /v1/do` path as `strale_execute`.
  - The broad `/mcp` server and the stdio package behave as before.
- **Attribution.** Calls and x402 hand-off URLs from an entry point carry `src=mcp-<id>`. Its funnel rows in `discovery_hits` are labelled `/mcp/<id>:…` and keep the venue `src` from the URL, so the broad server's `/mcp:…` counts stay clean. `apps/api/scripts/attribution-rollup.ts` section 4b prints initialize, tools/call, distinct UA, paid calls and payers per server, with the broad server as the comparison row. It excludes the publish workflow's `ci-preflight` probe.
- **Registry entries**, remote-only, one per entry point: `packages/mcp-server/entry-points/<id>/server.json`. The names are `io.github.strale-io/<id>`, version 1.0.0, and each remote URL carries `?src=mcp-registry`. All three passed the registry's `/v0/validate` before merge.
- **Publish workflow:** `.github/workflows/publish-mcp-entry-points.yml`. It runs by hand only, one entry per run, and only from `main`. Before the one-way publish it checks three things: the live endpoint answers `tools/list` with at least one tool, the registry's validator accepts the file, and the registry does not already list that name and version.
- **Claims guard:** the three `server.json` files and `entry-points.ts` are in `claims-lib.mjs` and both distribution rows' `scan_paths`.

## Why these three

The baseline the brief asked for is thin, and this note says so:

- Production per-tool volumes were not readable from this cloud session. There is no database access, and Bitwarden holds no production read key.
- The D1 Smithery listing edit has not happened. Smithery still shows the retired SQS description for `strale/agent-tools`.

The choice therefore rests on three things:

1. **The plan's own three** (§8 D7): company check, EU VAT and screening, web page reader.
2. **Public Smithery counts on 2026-10-28, narrow servers in the same jobs:**
   - `bouch/uk-due-diligence`: 60,787
   - `axel-belfort/web-scraper` (Markdown from a URL): 4,573
   - `OjasKord/vat-validator-mcp`: 1,299
   - Strale's broad `strale/agent-tools`: 989
3. **Live use:** the public catalogue's `last_customer_call_at` shows customer calls in the last week on the UK, German, French and Brazilian registries, `vat-validate`, `iban-validate`, `sanctions-check`, `url-to-markdown` and `web-extract`.

**Screening.** It is a single tool (`sanctions-check`) in Company Check. It is not a server name or headline. This follows the approved "name screening as one action of five" shape of §9 item 8, and it keeps compliance-specific targeting behind DEC-20260812-A.

## Measurement

- **Start date:** the day each entry is published (recorded in `tracks.yaml` T8).
- **Baseline on 2026-10-28:**
  - Smithery `strale/agent-tools` useCount: 989.
  - Narrow uses: 0.
- **Rule:** at day 45, run the rollup with `--days 7`. If no entry point's weekly tools/call count beats the broad row, retire all three. Retiring means removing them from `ENTRY_POINTS`; registry entries cannot be deleted, so their remote endpoints then return 404.

## Open

- Smithery listings need Petter's Smithery sign-in (DEC-20261027-C). The ask is on `needs-founder`.
- Record each registry entry's URL, version and smoke values in T8 after publish.
