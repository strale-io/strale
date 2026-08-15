# Channel Attribution — Design (Readiness P0 deliverable)

**Date:** 2026-08-12 · **Status:** Design approved scope (DEC-20260812-A P0); build lands in P5 entry.
**Problem:** 92% of revenue arrives via x402 with no signup, no referrer discipline, and the
wallet address as the only identity. There is no way to tell which distribution surface
(x402 directories, MCP registries, framework packages, llms.txt / task pages, direct docs)
produced a paying wallet — so distribution effort is unmeasurable. Attribution must exist
**before** the P5 distribution push, or the push is spend without feedback.

## Signals available, by rail

| Rail | Signal | Quality |
|---|---|---|
| x402 HTTP | `User-Agent`, `Referer` (rarely set), IP, wallet address, preceding catalog/discovery fetches | weak-to-medium |
| Discovery endpoints (`/x402/catalog`, `/.well-known/x402.json`, `agent-card.json`, `llms.txt`) | fetch log with UA/IP + **`?src=` tag** | strong when tagged |
| MCP HTTP (`POST /mcp`) | `initialize` carries **`clientInfo` (name/version)** — identifies the calling harness (claude-desktop, cursor, custom) | strong, free |
| A2A | agent-card fetch + JSON-RPC client metadata | medium |
| SDKs / framework packages | **`X-Strale-Client: <pkg>/<version>` header** set by our own code | exact |
| Wallet + API keys | first-seen timestamp, first-paid-call capability | anchor for joins |

## Design

1. **Tagged discovery URLs.** Every directory/registry submission uses a tagged catalog URL
   (`/x402/catalog?src=bazaar`, `?src=coinbase-directory`, `?src=smithery`, …). The tag is
   logged and ignored functionally. Fixed-path surfaces (`.well-known`) can't carry tags —
   they rely on UA/IP correlation only. This one convention converts the strongest channels
   from unmeasurable to exact, at zero runtime cost.
2. **Client header in our own distribution code.** `straleio` (PyPI), TS SDK, `strale-mcp`,
   langchain/crewai/SK packages each send `X-Strale-Client: <name>/<version>`. One-line
   change per package; exact attribution for the framework channel.
3. **Capture points → `client_meta` JSONB** on `transactions` (x402 wildcard handler, `/v1/do`,
   MCP tool-call path, A2A): `{ua, referer, src, client_header, mcp_client_info}`. No new
   query paths on the hot path — write-only at execution time.
4. **`discovery_hits` table** (endpoint, src_tag, ua, ip_hash, ts) populated by the discovery
   endpoints, LIMIT-pruned on the retention schedule. Daily-salted IP hash, 90-day retention,
   no PII (aligns with the retention tier work in PR #174).
5. **First-touch join.** A wallet's attribution = (a) exact `src`/client header on its first
   paid call, else (b) nearest preceding discovery hit sharing ip_hash/UA within 24h, else
   `unattributed`. At current volumes (tens of wallets/month) best-effort correlation is
   adequate; the point is the trend, not perfection.
6. **Weekly rollup** into the demand-sensing report (P4): new paying wallets by first-touch
   surface; calls by client header; discovery fetches by src; unattributed share (target <50%).

## Non-goals

No fingerprinting beyond UA/IP-hash, no cross-site tracking, no third-party analytics on the
API. The audience is machines; the instrument is our own access logs, structured.

## Build sizing & protocol notes

One session: 1 migration (`client_meta` column + `discovery_hits` table), 4 capture points,
2 package releases (SDK header), rollup script. DEC-20260504-C applies (migration must be
verified against the actual deploy mechanism — `runStartupMigrations()` in `index.ts`);
DEC-20260504-B does not (no backlog drain — new tables start empty).

## Addendum (2026-08-15) — MCP funnel + x402 payer hash (migration 0083)

176 agents/week hit `/mcp:initialize`; essentially none convert, and until this addendum
`discovery_hits` only ever recorded `:initialize` for MCP — no visibility into `tools/list`,
`tools/call`, or where a call gets rejected. Two additions, both write-only at execution
time (no hot-path query cost), both landed with regression tests:

1. **MCP funnel capture — no schema change.** `discovery_hits.endpoint` already carries
   enough information as a plain string; funnel step + tool name + rejection reason are
   encoded into it (`/mcp:tools/list`, `/mcp:tools/call:{tool}`,
   `/mcp:reject:{auth_rejected|payment_rejected|rate_limited}:{tool}`), extending the
   `/mcp:initialize` pattern this table already used. Two capture paths:
   - Pre-dispatch: `routes/mcp.ts`'s `classifyMcpRequest` peeks the JSON-RPC method the
     same way the original `/mcp:initialize` capture did. Records that a step was
     *reached*.
   - Outcome: `packages/mcp-server/src/tools.ts` gained an optional `onFunnelEvent` hook
     on `StraleClientOptions`, fired from inside `strale_execute` / `strale_balance` /
     `strale_transaction` at their existing auth-check and `error_code` branches. Only the
     HTTP transport (`routes/mcp.ts`) passes a callback; the published stdio server
     (`server.ts`, what `npx strale-mcp` installs) never does, so this is a no-op for every
     external install — no DB dependency leaks into the npm package.
2. **x402 payer identity — new column, not a new signal.** The raw payer address was
   already flowing through `extractPayerAddress` into `audit_trail->>'payer_address'`
   (needed there, unhashed, for refund/reconciliation — see `x402_orphan_settlements`).
   `transactions.x402_payer_hash` (migration 0083) adds a STABLE (non-rotating) keyed hash
   of that address — `hashX402Payer` in `lib/attribution.ts`, a sibling of `saltedIpHash`
   with the opposite lifecycle: `saltedIpHash` rotates daily *on purpose* (cross-day
   correlation must be impossible); `hashX402Payer` must NOT rotate, because the entire
   point is answering "is this the same wallet as last week" (distinct-payer, repeat-rate).
   Keyed (HMAC via `AUDIT_HMAC_SECRET`, not plain sha256 like `client_ip_hash`) because a
   curated dictionary of wallet addresses (block-explorer tag databases) is a realistic
   attack the much-larger address space doesn't rule out the way IPv4's small space makes
   moot for `client_ip_hash`. Lowercased before hashing so EIP-55 checksum-casing
   differences between clients don't split one payer into two.

**Known blind spots (explicit, not fixed by this addendum):**
- No true per-agent funnel. The MCP HTTP transport is stateless — no session id exists to
  join "this initialize" to "this tools/call" from the same agent. "Distinct agents" can
  only be approximated via UA string (imprecise both directions) since `ip_hash`'s daily
  rotation makes it unusable for anything wider than a 24h window.
- `x402_payer_hash` is NULL on every x402 transaction recorded before this migration, and
  on any row where verification didn't yield a parseable payer address — distinct-payer
  counts from the rollup script are a lower bound, not exact.
- Rejection capture only covers `strale_execute`, `strale_balance`, and
  `strale_transaction` — the three tools with an auth-or-payment-shaped rejection branch
  today. A future paid meta-tool needs its own `emitFunnelEvent` call site.

Rollup: `apps/api/scripts/attribution-rollup.ts` gained an "MCP funnel" and an "x402
payers" section (run weekly by a human, same as the rest of the report — this was not
built as a dashboard).
