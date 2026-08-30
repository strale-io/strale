# 2026-08-29 — Issue #432: bounded the last caller-URL reads, and gave them one guard

Intent: close the 20 capability files #428 recorded as still reading caller-influenced response bodies unbounded, with a limit derived per media class rather than one number applied to everything.

## Outcome: SHIPPED and verified

- PR [#433](https://github.com/strale-io/strale/pull/433) squash-merged as `ed605206`; CI green on the exact reviewed head `0b3d1a75` (run 33261260878). Prod cut over `111bf54d → ed605206` at 15:52 UTC.
- Live non-destructive check: free-tier `url-to-markdown` returned a real 629-word page in 324 ms at €0 with `provenance.source: "http-get"` — the layer-1 read this work bounded — and the example.com call landed on `jina-reader`, the fall-through positive control.
- Issue #432 closed with the full disposition table. Follow-up **#434** filed.

## What shipped

Limits by media class, each with evidence rather than assertion:

| class | limit | mode | basis |
|---|---|---|---|
| HTML | 16 MiB | refuse | #428, unchanged |
| robots.txt | 500 KiB | **truncate** | RFC 9309 §2.5; Googlebot enforces exactly it. Measured 2.2–27.6 KiB |
| sitemap XML | 50 MB | refuse | sitemaps.org protocol maximum. Measured leaf sitemaps 5.2–5.4 MiB (gov.uk) |
| API/JSON | 4 MiB | refuse | measured 0.07–20 KiB; below the HTML cap because `JSON.parse` builds an object graph |
| contact scrape | 300 KB | truncate | pre-existing behaviour, hoisted out of two identical local readers |

`paid-api-preflight` got `discardBody` — it never wanted the bytes.

The robots.txt decision is the one worth remembering: truncating is not a compromise there, it is the *correct* answer, because the capability exists to say what crawlers see and crawlers ignore the tail.

**Three swallowed refusals fixed.** `url-to-markdown` would have re-fetched the oversized page through Jina and Browserless; `job-posting-analyze` would have said "could not fetch" for a fetch that worked (a message the breaker does not recognise as a refusal); `social-post-generate` would have handed the model a URL string and written a confident post about a page nobody read.

**`image-limits.ts` → `lib/resource-limits.ts`** (`ImageLimitError` → `ResourceLimitError`), own commit. The name had stopped being true and `lib/metered-vendor-fetch.ts` importing it ran the dependency backwards.

**One AST scanner replaced two regex guards.** Regex missed real code: `estonian-company-data` did `return resp.json()` with no `await`, unbounded and unledgered while the guard reported the ledger exact.

## What the rounds found

- **Round 1:** `page-speed-test` hands a caller's URL to Google PageSpeed and reads the entire Lighthouse report. No `safeFetch`, so no class saw it. The filter now also reads `assertTargetAllowed` — the codebase's own marker for "this URL came from the caller" — which is reading an existing convention rather than inventing one. It is the guard's **one sanctioned entry**: sizing a cap needs measured report sizes, PSI refuses keyless traffic from here, and 433 successful prod calls in 90 days is too much working traffic to risk on a guess.
- **Round 2:** `page-exists` read its body with `getReader()` and a `while` loop — correctly bounded, but the third hand-rolled copy of the truncating read and invisible to any accessor sweep. Folding it in made `getReader()` outside the core zero-tolerance, so `resource-limits.ts` is now the only place in `apps/api/src` that touches a response body directly.
- **Round 3:** the mutation matrix found my own `url-to-markdown` re-throw untested. Without it the cascade ran and the final error message was **identical**, so no message assertion could tell the two apart. Now asserted on the tiers, with a thin-page positive control.
- **Round 4:** named the four directories no class watches, so the guard's claim can be audited rather than reconstructed.

## Also fixed from #428's review notes

The cache accounts each entry at `length * 2` — V8's worst case for a JS string — rather than its UTF-8 payload size. A mostly-ASCII page carrying one emoji measured N on the wire and occupied 2N in the heap, so a 64 MiB budget could hold 128 MiB while the module header called it bounded.

## Process notes

- **17/17 mutations caught**, including a reverted swap in a capability with no behavioural test of its own — the coverage argument for the vendor legs.
- 3002 tests pass across `src/capabilities` and `src/lib`; `src/routes` passes serially (3 timeouts under parallel load only — the known pattern).
- `validate-capability` green for every touched slug except four that fail **identically on `main`** (null `dataClassification`, missing test suites — DB state, not manifests). Verified against the checkin worktree at `c4b6c1b9` rather than assumed.
- Committed before every mutation run, per the #428 lesson.
- Worktree `strale-wt-wp16` (removed at session end).

## Left deliberately, filed as #434

`page-speed-test`'s cap (needs a PSI key — and prod has none, which is plausibly why its success rate is 54%); an in-flight byte budget for tiers 1/2 (measured: peak 21 tx/s, ~6 MB at real page sizes, no evidence of risk); unread non-2xx bodies on ~12 error paths; `sitemap-parse`'s regex parse over a bounded-but-large string; and the standing `DATABASE_URL_WRITE` backfill for manifest `limitations`, now covering 35 capabilities.
