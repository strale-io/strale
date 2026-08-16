# Directory map — where Strale is listed, and where it isn't

Compiled 2026-08-15 from crawler evidence in `discovery_hits`, the verification
files we serve, and live probes. Petter's instinct was right: we are on several
already. What follows separates *confirmed* from *assumed*.

## The strongest evidence: who crawls us

Directories index by crawling. A crawler in our logs is proof of a live
listing; absence is proof of nothing, but silence for weeks is a signal.

| crawler (30d) | hits | venue | listing |
|---|---|---|---|
| `glimind-probe` + `SentinelOracle` (glimind.com) | 552 | Glimind | **live, most active** |
| `Szerverbank-Public-Agent-Observer` | 413 | Szerverbank | **live** |
| `mcpbeat` (mcpbeat.com) | 232 | MCPBeat | **live** |
| `yellowmcp-health` | 146 | YellowMCP | **live** |
| `smithery-probe` | 110 | Smithery | **live** (see note) |
| `agent-tools.cloud` + crawler | 114 | agent-tools.cloud | **live** |
| `x402-observatory` | 67 | x402 Observatory | **live** |
| `aisec-registry-probe` | 63 | AISec Registry | **live** |
| `Waggle` (waggle.zone) | 60 | Waggle | **live** |
| `glama` | 43 | Glama | **live, confirmed by page load** |

Ten venues actively index us. That is more presence than I assumed this
morning, and it reframes the problem: **we are not undiscovered, we are
under-converting.** ~1,800 crawler visits a month produce one customer.

## Verification files we already serve

Each implies a completed submission at some point:

| file | venue | status |
|---|---|---|
| `/.well-known/402index-verify.txt` | 402 Index | domain verified |
| `/.well-known/glama.json` | Glama | maintainer claim, page live |
| `/.well-known/mcp.json` | generic MCP indexers | served |
| `/.well-known/agent.json` | generic agent indexers | served |
| `/.well-known/ai-catalog.json` | AI catalogue indexers | served |
| `/.well-known/x402.json` + `/x402` | x402 scanners | served, now revenue-ranked |

## Confirmed by direct probe

- **Glama** — `glama.ai/mcp/servers/@strale-io/strale` returns 200. Live.
- **Smithery** — `smithery.ai/server/strale-mcp` returns 404, yet
  `smithery-probe` hits us 110 times a month. The listing exists under a
  different slug, or is unpublished while still being crawled. **Worth ten
  minutes to find the real URL** — Smithery is one of the larger MCP
  directories.
- **x402scan** — no public API at the URL tried; presence unconfirmed.

## Coinbase x402 Bazaar — resolved 2026-08-15, no action needed

**95 of our resources are listed** (verified against a complete walk of all
14,946 index entries). An earlier figure of 41 was a partial scan reported as a
total.

**Listing is earned by settlement, not by advertising.** The index contains
exactly those resources that settled an x402 payment in the trailing 30 days —
exact fit in both directions, zero exceptions, sharp boundary. Our 164 unlisted
capabilities are unlisted because nobody bought them last month.

This makes the Bazaar a **trailing indicator of our revenue, not a lever on
it**. There is nothing to submit, nothing to fix, and no email to send; the
draft in `coinbase-bazaar-email.md` is marked DO NOT SEND with the reasoning.

## The gap that matters more than any missing directory

Our listing copy sells the wrong product. `docs/x402-listing.md` — the text we
submit everywhere — opens with:

> "250+ compliance, KYC/KYB, and business verification APIs… Sanctions, PEP,
> adverse media, beneficial ownership"

Our only paying customer buys **email validation, Google search, deliverability
checks, tech-stack detection and keyword tools** — 1,306 calls in 30 days,
zero compliance calls among them. We are advertising a compliance product and
selling a lead-research toolkit.

Every directory listing carries that stale pitch, and the counts in it are
wrong too (250+ vs 334; 27 countries vs the live figure). Rewriting it is
cheap, mine to do, and probably worth more than adding an eleventh directory.

## What to do, in order

1. **Rewrite the listing copy** to lead with what sells. Mine — next session.
2. ~~Send the Coinbase email~~ — withdrawn. Bazaar listing is earned by
   settlement, so there is no gap to raise. See above.
3. **Find the real Smithery URL** and confirm the listing is published.
4. **Only then** consider new directories. Ten venues already crawl us; an
   eleventh is worth less than fixing what the existing ten display.

## Now measurable

Until today none of this was attributable — 1 of 2,196 hits carried a source.
Source is now derived from crawler identity and referrer (PR #261), so from
this point each venue's contribution is countable, and unrecognised referrers
are kept as `ref:<host>` to surface venues we do not yet know about.

## Data-use boundary applies here (added 2026-08-15)

The charter's customer-data rule governs this file. Prospect and account names
recorded here must come from public product research, or from a customer who
registered with us and thereby chose to be contactable. **Names inferred from
transaction logs, wallet activity or request contents do not belong in this
document and are not leads** — including any that an audit surfaces as a side
effect. See CHARTER.md § What we may do with customer data.

## Growth initiatives tested 2026-08-15 — results

Four ideas were run down the same evening. Two are closed, one is instrumented,
one is not a lever yet. Recorded so none of them gets re-proposed as new.

### 1. Unmet demand on the paying rail — SHIPPED

`failed_requests` only ever recorded misses from `/v1/do`. x402 is ~99% of
revenue, so the rail that earns recorded nothing and the table filled with our
own probes — which is why "unmet demand" was never usable as a build signal.
Three x402 rejection sites now record, splitting *unknown slug* (a catalogue
signal: build it) from *rejected input* (a product signal: our schema or error
text failed them). No customer content is stored. First readings should be
usable within a week.

### 2. `company-enrich` parse bug — ALREADY FIXED, no work needed

Reported earlier as ~€1.50/90d of recoverable revenue. It was fixed in PR #214,
which adopted a tolerant JSON extractor across five executors. The single
failure was 2026-08-14, before the fix; it has succeeded since with no repeat.
Verifying took ten minutes and saved building a fix for a fixed bug.

### 3. Other x402 registries — MOSTLY NOT A LEVER

- **x402scan** — one mention of Strale on the site; presence plausible but
  unconfirmed. Most x402 scanners mirror the CDP facilitator index, which we
  now know is settlement-derived, so they would inherit the same property:
  earned by sales, not acquirable by submission.
- **ZeroClick** — reachable, no mention of us. Submission path unknown.
- **agent402.tools** — did not resolve.

Worth one more pass only if a scanner is found that accepts submissions
directly rather than mirroring the facilitator. Do not assume any of them can
be pushed.

### 4. Free tier as a funnel — NOT A LEVER TODAY

Over 90 days, **2 external actors used a free capability at all**. One went on
to pay, one did not; four paid without ever touching the free tier. At n=2 the
conversion question is unanswerable, and the finding that matters is different:
**almost nobody uses the free tier.** It is not a funnel because it is not
being found.

The storefront now names all eleven free capabilities explicitly, on both the
agent card and the x402 discovery file, which it did not before 2026-08-15.
Re-measure after that has been live a fortnight before drawing any conclusion.
