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
