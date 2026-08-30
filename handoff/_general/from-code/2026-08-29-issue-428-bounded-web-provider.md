# 2026-08-29 — Issue #428: bounded the shared web-provider fetch layer

Intent: establish a bounded-HTML-fetch authority for `web-provider.ts` (the fetch path for 37 capabilities) and give its response cache a byte budget.

## Outcome: SHIPPED and verified

- PR #431 squash-merged as `111bf54d`; CI green on the exact reviewed head `b4ab24e0`; prod `/health` verified serving `111bf54d` at 10:58 CET. Live non-destructive check: free-tier `url-to-markdown` returned correct markdown in 990 ms at €0 through the changed path.
- Issue #428 closed with the tier map + evidence. Follow-up **#432** filed (20 ledgered caller-URL capabilities + 6 recorded residuals).

## What shipped

- All three tiers read through `readPageHtml` at **`MAX_FETCHED_HTML_BYTES` = 16 MiB**. The number is measured: real HTML documents run 35 KB (Hacker News) → 3.18 MB (Wikipedia COVID-19), and 16 MiB still clears the single-page WHATWG HTML spec at 15.58 MB. 8 MiB was rejected for refusing it.
- **Oversize is terminal**, not a fallback trigger — the anti-amplification property the issue existed for. Every legitimate fallback (short/challenge/bot-gating/5xx) still works, each with a positive control.
- Cache gains **`MAX_WEB_PROVIDER_CACHE_BYTES` = 64 MiB**; the running total was dropped in favour of summing ≤200 entries on insert, making drift unrepresentable.
- Error bodies truncated at 64 KiB (not refused — refusing would discard the diagnostic). Fall-through paths cancel unread bodies via `discardBody`, now shared in `lib/safe-fetch.ts`.
- Round-1/2 finds: three capabilities POST Browserless `/content` directly (bypassing the shared layer entirely), and `lib/jina-reader.ts` is a second Jina path buffering with `.json()`. All bounded.

## The important catch (and the lesson)

The six-lens review found a **HIGH**: `circuit-breaker.isUserInputError` returned false for *every* byte-limit refusal — #412's and #426's too — so three oversized pages in a row would have opened the breaker and taken the capability down for everyone. `quality-capture` bucketed it `internal_error`.

**I had verified the taxonomy and stopped there.** There are *three* health consumers wired to `lib/capability-refusal.ts` and its own header names all three. Root-caused at the error class (`ImageLimitError` now carries `isCapabilityRefusal`; the size/geometry message tails joined `REFUSAL_MESSAGE_PATTERNS`), which fixes #412 and #426 retroactively.

The reviewer's second HIGH did **not** reproduce — a wrapped message classifies `unclassified`, which is also floor-exempt. Verified before acting rather than taken on assertion.

## Process notes

- Four adversarial rounds + a six-mutation matrix (all caught), re-run after the /simplify refactor.
- **Mistake worth remembering:** I used `git checkout HEAD --` to restore after a mutation while the /simplify edits were uncommitted, and lost them on three files. Fully recovered by redoing them, but the rule is: commit before mutation-testing, and restore with a diff you own.
- Worktree `strale-wt-wp15` (removed at session end).

## Pending operator step (unchanged)

Manifest `limitations` still need a `DATABASE_URL_WRITE`-granted `onboard.ts --backfill` to reach the DB — now covering #412's six, #426's seven, and `web-extract`. Confirmed again this session that the public capability endpoint does not serve `limitations` at all, so urgency stays low.
