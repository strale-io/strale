# 2026-08-29 — Issue #434: the last unbounded read, and two things that were worse than filed

Intent: close the one caller-influenced unbounded body read left in the ledger (`page-speed-test`), and find out whether the missing `PAGESPEED_API_KEY` explained its 54% success rate.

## Outcome: SHIPPED and verified

- PR [#435](https://github.com/strale-io/strale/pull/435) squash-merged as `524350db`; CI green on the exact reviewed head `eab705b6` (run 33265990864). Prod cut over `ed605206 → 524350db` at 17:38 UTC, confirmed by a live free-tier call (626 words, 584 ms, €0).
- Issue #434 closed. Follow-up **#436** filed.
- **The class-A guard ledger is empty.** No caller-influenced unbounded body read remains anywhere in `apps/api/src`.

## The cap, and why it is not a guess

#432 refused to guess and could not sample, because PSI answers keyless traffic with 429 and we hold no key. The way out was to stop sampling what Lighthouse *usually* emits and measure what it is *capable of* emitting.

Lighthouse's own gatherer clamps the full-page screenshot to 16,383 px, webp q30, base64. That is a bounded object, so I encoded it locally with this repo's sharp at exactly those parameters: **0.24 MB** for page-like content at maximum height, **4.10 MB** for dense photographic detail, **12.61 MB** for incompressible noise — the mathematical ceiling. Five real published Lighthouse reports measure 0.15–0.53 MB whole. Realistic heavy page ≈ 1.0 MB; absolute ceiling ≈ 13.4 MB.

**24 MiB**: 1.8× the ceiling, ~24× a heavy real page. It cannot refuse anything Lighthouse can produce.

**The failure semantics are inverted from every other cap in this programme**, deliberately. Elsewhere an oversize blames the caller because the caller chose the input. Here no page a caller can name reaches the cap, so a response above it is a vendor anomaly — it classifies `upstream` and **counts** against the capability. Excusing it would hide a real upstream problem behind a size policy.

## I was wrong about the 429s, and said so

#434's own text (which I wrote) guessed the 54% success rate was quota exhaustion. The stored failure evidence says otherwise: **zero quota errors in 90 days**. 148 of 363 "failures" are the harness's own negative fixture, 138 are Lighthouse failing to load the caller's page, 43 are timeouts, 34 are Google 500s. Real rate is 433/648 = **67%**, and the keyless path works — my 429s were a shared anonymous per-day bucket hit from this machine. **No API key was needed and none was requested.**

## Two things worse than filed

**Round 2 — the misfiled 138.** `FAILED_DOCUMENT_REQUEST` arrived as raw Google 400 JSON. No taxonomy rule claimed it and the circuit breaker did not recognise it, so three unloadable target pages in a row would have suspended a working capability. The #428 shape, found again. Fixed by naming the caller's field, which also replaces 300 characters of vendor JSON with a sentence.

Registering it took two attempts, and the second is the durable lesson: `REFUSAL_MESSAGE_PATTERNS` is read by `isRefusalMessage` with `startsWith` and by the breaker with `includes`. My first fragment satisfied the breaker and silently missed quality-capture — one of three consumers, again.

**The sitemap parser.** Filed as "characterise, probably defer". Measuring it found a remotely triggerable event-loop stall: `"<url>".repeat(100_000)` — 488 KB, far under the 50 MB fetch cap — takes **59.9 s** of synchronous CPU, and `"<loc>".repeat(50_000)` takes 66 s. Ten times the input, two hundred times the work, on bytes the caller's own server chooses. One 5-cent call stalls every request in the process. The byte cap bounded the bytes and said nothing about the work spent on them. Replaced with `indexOf` scanning: same semantics, 5 ms for a 50,000-URL sitemap.

## Process notes

- **14/14 mutations caught.** Two exposed real gaps before they passed: an untested `trim()`, and the two-matcher pattern bug above.
- 3043 tests pass across `src/capabilities` and `src/lib` (serial; parallel shows the known CPU-contention timeouts).
- `validate-capability` green for every touched slug except `email-pattern-discover`, which fails identically on `main` — verified, not assumed.
- Worktree `strale-wt-wp17` (removed at session end).

## Needs Petter — one item, and it is optional

Production runs `page-speed-test` keyless on a **shared anonymous Google quota** (`project_number:5837973…`, "Queries per day"). It has worked for 90 days straight, so this is availability hygiene rather than a fix: a free Google Cloud API key (PSI free tier is 25k/day) would move it to a private bucket. Creating that project and key is account-level and outside the autonomous envelope. Filed in #436, not escalated.

## Left in #436

`page-speed-test` routes **sync** (`avg_latency_ms = 8000` < the 10,000 threshold) into the wallet transaction's 15 s wall, while its p95 is **19 s** — so the slowest tenth of real customer calls are killed by a wall the harness never meets. Remedy is one UPDATE, blocked only by the absent write grant. Plus the two-matcher pattern list, the shared-quota key, and a real XML parser for sitemaps.
