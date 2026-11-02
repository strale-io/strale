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
- **Rule:** at day 45, run the rollup with `--days 7` and read the "executions" column. It counts every narrow tool call, but only `strale_execute` on the broad server, because search, ping and balance calls are not uses of a tool. If no entry point beats the broad row, retire all three:
  - Remove them from `ENTRY_POINTS`.
  - Mark each registry version deprecated with `mcp-publisher status`, because registry entries cannot be deleted.

## Fixed in review

- **MCP x402 hand-off links pointed at localhost.** Production check, 2026-10-29: every MCP hand-off link was `http://localhost:3000/x402/...`, which no remote agent can reach. This affected the broad server too. Links shown to callers now use `STRALE_BASE_URL`, falling back to `https://api.strale.io`. API calls still go to localhost.
- **CEO-brief MCP funnel and monitor visit-days** now count `/mcp/<id>:…` rows. Without that, agents moving to a narrow server would have read as MCP demand falling.
- **Two tests were tightened:**
  - the exclusion test now fails on a real exposure;
  - the hand-off test asserts the public host.

## Production verification (DEC-20260504-C), 2026-10-29 01:19 Swedish time

- `/health` reports commit `810a9753b4b8`.
- `initialize` reports `serverInfo` `strale-company-check`, `strale-eu-vat-check` and `strale-web-reader` respectively.
- `tools/list` returns 28, 7 and 5 tools. The broad `/mcp` server still returns 9.
- `POST /mcp/nope` returns 404.
- The payment hand-off from `vat-validate` with no key is `https://api.strale.io/x402/vat-validate?src=mcp-eu-vat-check`.
- Live free-tool calls succeed: `url-to-markdown` returned Markdown, and `iban-validate` returned `valid: true` with `price_cents: 0`.
- All probes were tagged `src=ci-preflight`, which the rollup excludes.

## Open (Petter)

- **Registry publish.** The session cannot dispatch `publish-mcp-entry-points.yml`: the GitHub integration returns 403, and the `gh` route was refused by the permission classifier. Petter runs it from `main` once per entry. Registry entries cannot be deleted.
- **Smithery.** Petter adds three URL servers on smithery.ai/new, one per entry, at `https://api.strale.io/mcp/<id>?src=smithery`.
- **Where the ask is.** The `needs-founder` bus returned 403, so the ask is a comment on the follow-up PR.
- **After publish.** Record name, version 1.0.0 and the entry date in T8. Day 45 after each entry's first listing is its review date.

Evidence: [test receipt](../../../archive/receipts/2026-10-29-test-run-d7-narrow-mcp-entry-points.json).
