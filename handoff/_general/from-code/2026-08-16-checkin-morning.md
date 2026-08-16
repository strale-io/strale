# Intent: morning check-in — read the business, sweep stale work, and build whatever the numbers say is missing

Session 2026-08-16 morning. Ran under the Operating Charter, which became
effective overnight (PRs #271/#272 from another session — it was still
"approved, NOT YET EFFECTIVE" when I read it at the start).

## Headline numbers

| | |
|---|---|
| Revenue (7d, external filter) | **€43.80/wk** — flat vs the €45.58 baseline of 2026-08-15 |
| Distinct paying actors (28d) | **5** — but see the caveat below |
| Open circuit breakers | **0** |
| Test-suite failure rate | 2.5% today, against 1.9–2.8% for the previous ten days — no overnight regression |
| External spend | ~€4.56 of the €50/wk envelope |
| Deployed SHA | matched main's tip at every check |

**The "5 payers" number is not yet M1 evidence.** The x402 payer-identity
instrument shipped 2026-08-15, so its share of that count is one day old and is
a lower bound rather than a measurement. M1 needs ≥5 distinct external payers
sustained over two consecutive weeks; one day of instrument life is not that.

There was no overnight incident. The overnight `regression_detected` wave in
`health_monitor_events` looks alarming and is not — the daily failure rate is
flat over ten days, and those events are a per-run flapping detector firing on
ordinary noise.

## The finding that matters: our tests do not measure what customers experience

This came out of building something else, and it is the most important thing in
this handoff.

Three capabilities score **100% on our internal test harness over a full week**
and were **delisted by the quality floor** — in enforce mode — for failing real
paying customers:

| capability | our harness, 7d | real paid calls, 30d |
|---|---|---|
| `url-to-text` | 425/425 (100%) | **39%** completion, 18 calls |
| `brazilian-company-data` | 455/455 (100%) | **59%** completion, 29 calls |
| `screenshot-url` | 518/518 (100%) | **55%** completion, 47 calls |

I pulled the actual customer-facing errors behind those numbers. They decompose
into three quite different stories, and only one of them is a quality problem:

1. **`screenshot-url` has a plain bug that is ours.** 23 of its 25 failures are
   `HTTP 400: "waitForSelector" is not allowed` — a parameter *we* send that
   Browserless rejects. Deterministic, every affected customer call fails, and
   the harness never exercises that path. This is the cheapest revenue fix on
   the list.
2. **`brazilian-company-data` is rate-limited, not broken.** 11 of 12 failures
   are ReceitaWS `HTTP 429`.
3. **`us-company-data` was delisted for doing its job correctly.** Of 11 calls:
   7 succeeded, 1 was a genuine upstream SEC 500, and the rest were caller input
   — missing required fields, and several where an LLM's own error prose
   ("I cannot extract a US company name from FIX…") was passed in as the company
   name.

**Which leads to the second finding: the floor counts correct refusals as
capability faults.** I ran `classifyTransactionFailure` over the exact error
strings from prod:

```
COUNTED  internal   Invalid URL format.
COUNTED  internal   This URL targets a restricted address.      <- our own SSRF guard, working
COUNTED  internal   No US company found matching "Braize" in SEC EDGAR.
COUNTED  internal   ReceitaWS returned HTTP 404
caller   caller_input   No confident SEC EDGAR match for "Apple"...   <- the sibling string IS caught
```

The taxonomy catches one member of a family and misses its siblings. The floor
is armed in **enforce** mode, so this is not theoretical: it is actively
removing working capabilities from the catalogue and from x402, which is the
rail essentially all revenue arrives on. This is the documented
"a correct refusal is not a capability fault" rule being violated by the floor
itself.

**This is the top item for the next session** and it is squarely revenue work:
fixing the taxonomy may re-list inventory that never should have been delisted.
It is logged as experiment E3 in GOALS.md with a kill criterion.

Also corrected in GOALS.md: harness green is not evidence a capability works.
Any decision reading a pass rate must now say which instrument produced it.

## What I built

**The catalogue had no way back on.** `quality-floor.ts` takes capabilities off
the catalogue; nothing put them back. Its own header says so, and the SQS
lifecycle engine that used to run `validating → active` was deleted on
2026-05-05. Since May there has been no code path — scheduled, automatic, or
even manual-without-a-DB-write — that makes a capability visible. Five
capabilities dark-launched on 2026-08-13/14 at 91–100% are stuck there now, and
DEC-20260812-A's "invisible until first green week" only ever implemented the
first half of that sentence.

Shipped the counterpart job (`lib/capability-promotion.ts` +
`jobs/capability-promotion.ts` + a read-only `scripts/preview-promotions.ts`),
mirroring the floor's structure. **It is dry-run by default** —
`CAPABILITY_PROMOTION_ENFORCE=true` arms it. Next session should read a tick of
`dry_run_would_promote` events and then arm it; that is my call, not Petter's.

Cross-provider review (sol@high, OpenAI reviewing Claude-authored code) returned
1 critical + 5 high + 2 medium. **The critical finding described 3 of 3 real
candidates, not an edge case**: without a takedown interlock, this job re-lists
every capability the floor delists, nightly, on harness evidence. That is how I
found the harness/reality gap above. Six findings applied, one rebutted with
data (requiring a non-null breaker row would permanently exclude the 14
capabilities that have never failed), one accepted as a known boundary.

The review also overturned a judgment of mine that I had argued for in the PR
body: I claimed enforcing by default was safe because the floor would catch bad
promotions. The floor needs ≥10 external calls over 30 days before it can act —
so it will not catch one on a low-traffic capability, which is exactly the
population most at risk. That was a real hole and the reviewer was right.

**Preview against prod with the fixed gates: three flags, zero promotions.** The
correct answer. Without the interlock it would have promoted two capabilities
that fail 39–59% of real customer calls.

## A process failure worth fixing

**PR #269 auto-merged at its first commit while the review was still running.**
Main spent roughly 40 minutes carrying a job that enforces by default with no
floor interlock — it would have re-listed `brazilian-company-data` and
`url-to-text` twenty minutes after boot.

Caught it, verified against prod that no `capability_promotion` events existed
yet and all three slugs were still `visible=false`, and landed the review fixes
as PR #273 inside that window.

**Closed out before the session ended.** `cc45f65` deployed and equal to main's
tip, and the first tick fired at 07:24:00 UTC doing exactly what was predicted
for it in the PR body — verified by effect, not by log line (DEC-20260504-C):

```
07:24:00  tick_complete       (mode: dry_run)
07:24:00  flagged_for_human   url-to-text
07:24:00  flagged_for_human   brazilian-company-data
07:24:00  flagged_for_human   screenshot-url
FLAGS: all three still visible=false, x402_enabled=false
```

Three flags, zero promotions, no catalog change. Without the interlock that
same tick would have re-listed `url-to-text` and `brazilian-company-data` and
opened x402 on both.

The failure mode is repeatable and not bad luck: a PR that can merge at its
first commit while review is in flight will do it again. Options are to open
review-pending PRs as drafts, or to hold the first push until review returns. I
lean to drafts.

## Stale-work sweep

- **Open PRs: 0.** #269 (merged, at the wrong commit), #270 (docs, merged),
  #273 (the fix, merged and verified on main), #135 closed.
- **PR #135** (Italian directors, opened 2026-05-18, `BEHIND` main) — closed
  with reasons. It cannot serve traffic: every Openapi-routed capability is
  gated on `OPENAPI_ENABLED=true`, which refuses until the resale addendum
  (case 151296) is countersigned. It would also likely fail the PII gate now,
  since that gate was widened on 2026-08-14 to cover `scripts/` specifically
  because of this capability's fixture. Branch `feat/phase-7a-it-stakeholders`
  (`3fbbd31`) retained.
- **Branch graveyard: 96 → 91.** Triaged the ten oldest.
  - Deleted, PRs already resolved: `chore/payee-to-counterparty-rename`
    (`a7365cc`, #38 merged), `test/us-court-search-fixture-restructure`
    (`bacaeac`, #39 merged), `chore/window-failed-requests-show-failure-type`
    (`097587f`, #40 closed), `feat/retire-solutions-and-web3-assurance`
    (`06183f6`, #45 closed).
  - Preserved then deleted: five research branches whose twelve markdown notes
    existed nowhere else. Landed on main as #270 first —
    `research/bundesapi-civic-tech-2026-05-06` (`d75fe82`),
    `research/compass-manz-at-2026-05-06` (`d105fe4`),
    `research/gap8-direct-build-spikes` (`4093bd6`),
    `research/midrebuild-verify-spikes` (`a4d9f1a`),
    `research/kyckr-evaluation` (`78aa040`).
  - **Kept:** `test/openapi-com-sandbox-2026-05-06` (`131e0ed`) — carries a real
    vendor client (`lib/vendors/openapi-com/`), not just notes. Blocked on the
    same addendum as DQ-6. Revisit when that resolves.

## Queued for Petter

- **DQ-6 (new, `your_call`)** — the Openapi resale addendum, unsigned since May,
  holding **ten European country lookups** off the shelf (IT, AT, BG, CY, RO,
  PT, NL, HU, LU, MT). It was waiting on a Skatteverket VAT confirmation for
  Moonlighter AB; whether that came back is the part only he can check. Largest
  blocked chunk of catalogue we have, and already built. Worth an hour, not a
  week — no customer has asked for these countries yet.
- **DQ-3** (Mexico/INEGI key) unchanged, no deadline, nothing depends on it.
- **DQ-7, DQ-8** recorded as `decided` — the promotion job and the branch
  cleanup, both reversible, both listed so he can reverse them rather than
  approve them.

Nothing in the queue matured for auto-execution today.

## Next session should pick up, in order

Items 1 and 2 as originally written were both completed in this session — the
deploy/tick confirmation and the failure-taxonomy fix (E3). What remains:

1. **Re-list `us-company-data`.** The one capability the taxonomy fix proves was
   delisted wrongly: the floor quarantined it at 64% on 2026-08-12, and under
   the corrected taxonomy that window is 100% (7/7). Neither job will do it —
   the floor never promotes, and the promotion job correctly refuses to overturn
   a takedown — so it needs a deliberate publish.
2. **Fix `screenshot-url`'s `waitForSelector` request bug** — 23 paid failures
   from one parameter we should not be sending. Still the cheapest revenue fix
   on the list, and now also the last remaining cause behind that capability's
   quarantine.
3. **Arm `CAPABILITY_PROMOTION_ENFORCE`** once a tick of dry-run evidence reads
   correctly. The five real dark launches cross the five-day evidence threshold
   around 2026-08-18/19.
4. **Reword two refusals at the throw site** so they can be excused:
   `schema-infer`'s "CSV must have at least a header row" and
   `charity-lookup-uk`'s "Name search is not available via free APIs" both now
   count against their capability, because no shape separates them from an
   internal failure phrased identically. Leading with the quoted field, as the
   rest of the house style does, fixes both. 6 calls in 90 days — low priority,
   but it is a one-line change in each.
5. **Consider tightening `TIMEOUT_RE`** — the taxonomy review's one unaddressed
   finding. `'timeout' must be between 1 and 30 seconds` classifies as `timeout`
   rather than caller input. Pre-existing, over-counting direction, no observed
   instance; it reclassifies existing production strings so it wants its own
   change and its own measurement.
6. **Continue the graveyard** — next ten oldest.

## Notes for whoever runs the next session

- **`QUALITY_FLOOR_ENFORCE` is armed in production.** CLAUDE.md and the memory
  index both still describe it as dry-run. The floor has really quarantined six
  capabilities. Worth correcting in CLAUDE.md.
- **Two worktrees under `C:/tmp` were wiped mid-session**, including their
  `.git` files — a harder failure than the documented phantom-deletion bug. The
  main checkout and its `node_modules` were verified intact, and all work was
  already pushed. Worktrees under `C:/Users/pette/Projects/` (`strale-wt-fix`,
  and the replacement `strale-wt-promote2`) survived. **Put worktrees beside the
  project, not in `C:/tmp`.**
- `model-os` cross-provider review needs `--current-provider anthropic` on
  `dispatch.mjs` as well as `--author-provider anthropic` on `select.mjs`;
  without it the gate blocks with "requires the current/orchestrator provider
  provenance" and returns an empty result that looks like a hung dispatch.

---

# Addendum: the failure taxonomy, fixed the same day (`f19f9f8`)

Petter asked for E3 immediately rather than next session, so it shipped here.

## What was wrong

The quality floor excludes caller-caused failures from a capability's
completion rate. The type already said `caller_input` covers "bad/missing
input, wrong identifier, unresolvable name" — but the patterns only implemented
the phrasings that existed when they were written. A census of **every** distinct
external failure string over 90 days (188 strings, 491 calls) found 106 calls
landing in `internal`, which the module documents as "OUR bug until proven
otherwise", including our own SSRF guard refusing a caller-supplied address.

The line now drawn, and worth reusing: a failure is **the caller's** when the
capability did its job and the answer is "your input is malformed" or "your
input matches nothing"; it is **ours** whenever we could not complete the
operation, whatever the cause.

## Result

19 distinct strings / 55 calls change class over the floor's own 30-day window,
**all** `internal` → `caller_input`, none the other way.

| capability | before | after |
|---|---|---|
| `us-company-data` | 64% (7/11) — quarantinable | **100%** (7/7) |
| `tech-stack-detect` | 78% (162/207) | 94% (162/172) |
| `github-repo-analyze` | 94% (32/34) | 100% (32/32) |
| `url-to-text` | 40% (6/15) | 60% (6/10) — **still quarantinable** |
| `price-compare` | 44% (4/9) | 50% (4/8) — still below |

The two that stay below the floor are the reassuring part: the fix removes
misattribution without whitewashing capabilities that really fail.

## The methodological lesson, which is the durable bit

**The tests were written from the same census as the patterns, so they could not
see the patterns' blind spot.** Both my own hazard probe and the cross-provider
review found over-broad rules that the 52-test suite passed happily:

| pattern | what it wrongly excused |
|---|---|
| `must be ` | `Response validation failed: output must be an object` |
| `fetch … HTTP 40[34]` | `Could not fetch internal config (HTTP 404)` |
| `invalid \w+ format` | `Invalid response format` |
| `is not supported` | `Digest method is not supported` |
| `not available for\|via` | `Service is temporarily not available via API` |

Every one is the shape a **systematically broken** capability takes: identical
failure on every call, all of them excused, and the floor stops seeing the
capability at all. That is worse than the bug being fixed.

What caught them was **inventing failure strings that did not exist yet** and
checking the patterns against those. Writing tests from observed data proves you
handled the past; only invented adversarial cases probe the rule itself. Same
for mutation testing — the upstream/caller ordering mutation initially passed
because no tested string matched both lists, and the fix was to find a real
`HTTP 429` string that does. "Mutation-verified" is worth nothing if the
mutations are the ones you already knew you would catch.

## Verification

- 59 tests, 29 of which fail against `origin/main`. Full suite 1640 green; every
  CI gate clean; CI green on the reviewed commit before merge.
- Mutation-verified in the dangerous direction: disabling the raw-payload guard,
  widening 403/404 to all 4xx, dropping the scope-refusal or not-found patterns,
  and swapping the upstream/caller check order each fail the suite.
- Cross-provider review (sol@high): 3 HIGH + 1 MEDIUM. Three applied, one
  deferred with a stated reason.
- **Post-deploy verified by effect, not by SHA**: 14 behaviour assertions run
  against the code as it exists on `origin/main` (= deployed `f19f9f8`), all
  correct. The first attempt at this verification read the local working tree,
  which sits on `ops/company-scaffold` and is days behind — it reported 5 false
  failures. That is the fifth time that specific trap has been hit; the rule is
  `git show origin/main:<path>`, never the working copy.

## Deliberate costs, recorded so they are not rediscovered as mysteries

- Two real refusals are no longer excused (see item 4 above). 6 calls in 90 days.
- The review's MEDIUM `TIMEOUT_RE` finding is not addressed (see item 5).

## Process change adopted

This PR was opened as a **draft** and only marked ready after the review
returned. #269 auto-merging at its first commit mid-review this morning is what
prompted it, and drafts are the cheap structural fix.
