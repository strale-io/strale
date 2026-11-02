Intent: repair the Google `/goto` redirect breakage across the eight Serper-backed capabilities using Serper's free `/resolve` endpoint, and answer the founder's two Serper-renewal questions with numbers he can act on.

# The Serper `goto`-link repair (2026-10-31, Swedish time)

Three paid tools were returning a **wrong answer**, not a degraded one. That is
the part worth leading with: since about 2026-10-30 01:30 UTC Google wraps
every organic result link past the top three in an opaque
`https://www.google.com/goto?url=<ciphertext>` redirect, and Serper passes it
through. `keyword-rank-check`, `serp-analyze` and `backlink-check` each did
`new URL(link).hostname` on that wrapper, got `www.google.com`, and reported it
as the result's own host. So a rank check compared the caller's domain against
`google.com` for positions 4-10, `serp-analyze`'s `top_domains` claimed Google
held seven of the ten positions on its own SERP, and `backlink-check` counted
`google.com` as a site linking to the customer — inflating
`referring_domains_count` with an unopenable `source_url`.

## What `/resolve` actually is, verified rather than taken on trust

Serper's `https://serper.dev/google-links` page is behind their login and
`WebFetch` only reaches the cookie notice, so the contract was established by
**one live `/search` call and four free `/resolve` calls** against the
`SERPER_API_KEY` in the root `.env`:

```
POST https://google.serper.dev/resolve      X-API-KEY: <the same search key>
{"organic":[{"link":"https://www.google.com/goto?url=CAESdwHrOzAV…"}, …]}
→ {"organic":[{"link":"https://www.teamwork.com/blog/…"}, …],"credits":0}
```

| claim | status |
|---|---|
| costs 0 credits | **observed**: `"credits":0` in the response body on every call, against `"credits":1` on the search. Serper's *public* pages never mention `/resolve`, so this is measured, not documented. |
| entries come back one-for-one in the order sent | **observed** across three different batch shapes. |
| must be called within ~30 s of the search | **not reproduced**: links roughly five minutes stale resolved normally. Serper's figure, not ours. Nothing in the code depends on it either way. |
| latency | 1.1-1.6 s warm. **One first call of the session exceeded 20 s** and was aborted — which is why the timeout is a budget, not a guess. |
| accepts a minimal body | **observed**: `{"organic":[{"link":…}]}` works; the full search response also works and is echoed with links replaced. The minimal form is what we send. |

The endpoint takes *links*, not a search response — `{"organic":[{"link":…}]}`
is just the shape it reads them in. A third-party wrapper
(`devops-infinity/ownserp`) uses the same contract, which is where the shape
came from before it was confirmed live.

## What was built

`apps/api/src/lib/serper-links.ts`, alongside the existing Serper plumbing
(`metered-vendor-fetch.ts`), exporting four things: `resolveSerperLinks`,
`isGotoLink`, `deriveResultDomain`, `usableResultUrl`.

Three design decisions, with the reasoning, since they were this session's to
make:

**1. Lazy, not eager.** No `/resolve` call unless a `goto` link is actually
present. In practice nearly every search has one, so this buys little today —
but a response that needs no resolution must not pay for a round trip, and the
detection is one string test. It also means the no-op path is provably free,
which is the first unit test.

**2. Fails open, never silently, and never guesses.** `resolveSerperLinks`
never throws and never rewrites a link it did not get a real URL for. It
returns what it could not resolve and each caller decides, because the right
answer genuinely differs per tool:

| tool | on an unresolved wrapper |
|---|---|
| `keyword-rank-check` | **refuses**, naming the positions. A paid ranking must not be a guess, and `found: false` is as much a guess as a wrong position — an opaque position 4 could be the caller's own domain. It answers normally when every unknown position sits *below* the match, because the position number itself comes from Google and stays trustworthy. |
| `serp-analyze` | `url: null`, `domain: null`, `link_unresolved: true` per result, plus `unresolved_positions` and a `link_resolution` block. `top_domains` simply omits them — it never says Google. |
| `backlink-check` | **drops the row** and counts it in `unresolved_link_count`. A backlink list is a list of addresses; a row without one is not a weaker row, it is a wrong row. |
| `adverse-media-check` | **keeps the finding**, nulls `source_link`, sets `source_link_unresolved`, counts `unresolved_source_links`. Dropping a hit would understate risk on a compliance output, which is the worse of the two failures; presenting a redirect as an auditable source is the other. |
| `google-search`, `google-news-search`, `serp-related-questions` | `url`/`source_url` `null` with a flag and an `unresolved_url_count`. |
| `brand-mention-search` | resolves *before* the results reach the model, and describes an unknown URL as `(unavailable)` — an LLM told to pass a URL through will pass the wrapper through. |

A second, free signal turned up while reading a live response: Serper returns
Google's own breadcrumb in `displayedLink` (`"https://www.teamwork.com › Blog"`)
alongside the wrapper, and it names the real host even when resolution fails.
`deriveResultDomain` uses it for the **domain only, never as a URL** — a
breadcrumb is not an address. That is why the domain-deriving tools usually
still answer when `/resolve` is down.

**3. Latency inside the sync budget.** The search call already asks for up to
15 s against the ~15 s `/v1/do` sync wall, so resolution gets its own 8 s slice
and gives up rather than pushing the request past the ceiling. Generous against
1.1-1.6 s observed; short enough that a hung `/resolve` degrades one response
instead of timing out the caller.

### The refusal that would have been scored as a bug

`keyword-rank-check`'s new refusal message fell through every pattern in
`failure-classifier.ts` to `unknown`, which is the recurring failure family
where a *correct* refusal becomes a quality signal against the tool and the
floor eventually delists it. Added `/opaque redirect links for result
position/i` to `UPSTREAM_TRANSIENT_PATTERNS` with two tests. The condition is
upstream and genuinely transient — the next search gets fresh links.

## Tests, and the proof they are regressions

Receipt: [serper goto-link repair](../../../archive/receipts/2026-10-31-test-run-serper-goto-link-repair.json)
— 47 tests, 47 passed, across `serper-links.test.ts`,
`serper-goto-links.test.ts`, `failure-classifier.test.ts`,
`metered-vendor-fetch.test.ts` and `adverse-media-check.provenance.test.ts`.

The Audit-Follow-up protocol's standard was applied although this is not an
audit finding: **both directions were verified.** The helper was reverted
in place to the pre-fix behaviour (no `/resolve` call, link passed through,
domain read straight off the link) and the regression suite re-run:
**11 of its 12 tests failed.** The one that still passed is
`backlink-check > drops an unresolvable link and reports the absence` — it
survives because the drop is driven by `isGotoLink` at the call site, which the
mutation did not touch; its companion
`backlink-check > never counts google.com as a referring domain` does fail, and
that is the one that covers the wrong-answer bug. Named here rather than
rounded up to "all tests fail before the fix".

Covered: a response with no wrappers (no HTTP call at all), a mixed response,
an HTTP failure, a timeout, an echoed wrapper offered as a resolution, a
non-`http` value, a batch whose entry count does not line up (dropped rather
than misaligned — attaching the right URL to the wrong result is the worst
outcome), >100 links split across calls, wrappers nested in `sitelinks` /
`answerBox` / `news`, and a missing key.

## The unverified surfaces, settled

The brief asked that People-Also-Ask and `answerBox` links be established
before changing those paths. One live `/search` returned PAA entries carrying
**only `question`** — no `link`, `snippet` or `title` — so there was nothing to
observe, and `answerBox` was absent from that response. **Neither was
established.** Rather than assume them safe, the helper walks the response for
`link`/`url` keys instead of naming paths, so a field Google starts wrapping
tomorrow is resolved without a code change, and `usableResultUrl` is the
backstop at every emission point. `serp-related-questions`' existing
`source_url` was already null for want of a `link` field, which is a separate
(and pre-existing) thinness in that tool, not part of this break.

## Gates

| gate | result |
|---|---|
| `npm run typecheck` at the **repository root** | clean, after `npm install` and building `packages/mcp-server` + `packages/sdk-typescript` as CI does (both are prerequisites; without them `packages/langchain` cannot resolve `straleio`) |
| `npx vitest run src/capabilities/ src/lib/…` | 2338 passed, 1 pre-existing failure (below) |
| `lint:no-bare-catch`, `lint:no-unguarded-user-fetch`, `check-ssrf-inventory`, `lint:no-new-console`, `check-fetch-timeout-coverage --strict`, `check-pii --strict`, `check-manifest-guaranteed-consistency --strict`, `check-cost-class-coherence`, `vendors:check`, `claims:check` | all pass |

**Two failures that are not this change's**, both verified against `df047524`
with this branch's files reverted:

1. `src/capabilities/upstream-replay-contract.test.ts` — "records no executor
   that reaches the network without fetch" lists 14 entries for tools this
   change never touches (`api-health-check`, `og-image-check`, …), with
   Windows backslash separators. Fails identically at the base commit.
2. `npm run vendor-terms:check` — `FAIL docs/operations/vendor-permissions/
   2026-10-27-serper.md: archived permission evidence was edited`. The check
   compares the file **on disk** against its blob, and `core.autocrlf=true` on
   this PC gives the working copy CRLF where the blob has LF. It fails on
   `main` in the trunk checkout too, and cannot pass on Windows. CI runs on
   Linux, so this is a gate that is effectively Windows-blind rather than a
   broken record — worth a small fix (compare the blob, or normalise newlines)
   but not this lane's to make.

No manifest `expected_fields` assertion breaks: every `not_null` on these eight
slugs is on a top-level container (`results`, `found`, `backlinks`,
`serp_features`, …), none on a nested `url`. All new fields are additive.

## No register entry applies

`docs/programs/platform-hardening/tracks.yaml` has no track for unplanned
vendor-break repair, and this is not a batch of H1-H8 — inventing a row to have
one would misrepresent the program. The session contract is met by this handoff
file instead. Said plainly rather than left for a reader to notice.

---

# The founder's two Serper questions

Asked for by 6 November. **These are two different questions and the answers
point opposite ways**, so they are kept apart deliberately. Nothing here is a
purchase; spending is the founder's decision.

## 1. What renewal costs

Serper's public tiers, read from serper.dev on 2026-10-31. Every tier's credits
**expire after 6 months**, which is what the 2026-11-08 expiry is — the current
Starter pack was bought around 2026-05-08.

| tier | price (USD, ex VAT) | credits | per 1,000 |
|---|---|---|---|
| Starter | $50 | 50,000 | $1.00 |
| Standard | $375 | 500,000 | $0.75 |
| Scale | $1,250 | 2,500,000 | $0.50 |
| Ultimate | $3,750 | 12,500,000 | $0.30 |

Production volume across the eight Serper-backed tools, from `transactions`
joined to `capabilities` (read-only `strale_ro`):

| month | served calls | of which external (not the harness) |
|---|---|---|
| 2026-05 | 3,318 | 4 |
| 2026-06 | 25 | 0 |
| 2026-07 | 101 | 0 |
| 2026-08 | 707 | 9 |
| 2026-09 | 370 | 19 |
| 2026-10 | 235 | 16 |

October by tool: `google-search` 183, `adverse-media-check` 21, `serp-analyze`
15, `brand-mention-search` 8, `backlink-check` 6, `keyword-rank-check` 2,
`google-news-search` 0, `serp-related-questions` 0.

**The figure he asked for: at observed volume, renewal costs $50 per six
months — about $8.33 a month — and that is the pack price, not the usage.**
235 calls a month is 235 credits if `call-cost.ts`'s one-credit-per-call
assumption holds, which is $0.24 of a $50 pack. Even May's 3,318 calls would
have spent 7 % of it. There is no cheaper tier: $50/50,000 is the floor, so the
decision is "buy the smallest pack or stop using Serper", not "buy the right
size".

**An honest discrepancy, because it bears on the number.** 46,900 of 50,000
credits were consumed since May, against **4,756 recorded served calls** in the
same window — roughly **10 credits per recorded call**. Two explanations fit
and this session did not separate them: Serper may bill per block of results
(`google-search` permits `num` up to 100, `adverse-media-check` asks for 20,
and `call-cost.ts` already flags the one-credit assumption as unverified), or
credits went to development and sweeps that never wrote a `transactions` row.
Either way **$50 still covers observed volume with room to spare** — 235 calls
× 10 credits is 2,350 a month, 28,200 over six months, well inside 50,000 — but
the per-credit accounting in `call-cost.ts` is probably understating cost by
about 10× and is worth a follow-up.

**`/resolve` does not change consumption.** It is 0 credits, observed on every
call, and the helper meters it at 0 units so it never draws on the search
quota. It adds one HTTP round trip per search that contains a wrapper — latency,
not money. Confirmed against Serper's own response body rather than their
notice, because their public pages do not document the endpoint at all.

## 2. Does this lane need Serper past 8 November

**No. The lane does not — and that is not the question that matters.**

This repair is merged and verified before the key expires, so the lane itself
needs no further credits. But **all eight capabilities need a live key to
function at all**: each throws `SERPER_API_KEY is required` without one. Six
of the eight are `x402_enabled` (not `google-news-search`, not
`serp-related-questions`) and all eight are `is_active`, priced €0.10 to
€0.30 (`adverse-media-check` €0.20, `brand-mention-search` €0.30,
`backlink-check`/`keyword-rank-check`/`serp-analyze` €0.15,
`google-search`/`google-news-search`/`serp-related-questions` €0.10).
`adverse-media-check` uses Serper only as its fallback behind Dilisense, so it
degrades rather than dies; the other seven stop entirely.

So: **letting the key lapse delists seven listed tools.** External demand on
them is small and real — 16 non-harness calls in October, 19 in September — and
the catalogue-breadth positioning (DEC-20261023-B) is the argument for keeping
them rather than their current revenue, which at these volumes is a few euro a
month against $8.33 of cost.

**Recommendation: renew the $50 Starter pack.** It is inside the €50/week
envelope, it is the smallest purchasable unit, and it keeps seven live tools
listed. The alternative — deactivating all seven — is a catalogue decision,
not a cost saving worth $8.33 a month. He should also know the figure he is
buying against may be 10× what `call-cost.ts` records, which does not change
the recommendation at this volume but would if traffic grew an order of
magnitude.

## Credits spent by this session

**One search credit** (`"credits":1` in the response body) plus **four
`/resolve` calls at 0 credits each**. Total: **1 credit** of the ~3,100
remaining.
