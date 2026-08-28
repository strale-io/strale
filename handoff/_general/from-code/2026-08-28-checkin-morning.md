Intent: run the morning operating session under DAILY-RUN.md — measure the
business, clear overnight health, empty the PR and branch queues, and settle
what the 08-27 brief left as the week's most informative pending event.

Proactivity level 5.

## Headline numbers

| | |
|---|---|
| Last completed week (08-17) | €66.31 / 1,000 calls |
| Week in progress (08-24, day 5 of 7) | €47.93 / 828 calls — **not comparable** on totals |
| **Revenue from all payers except the largest, this week** | **€14.03 — a record, and the comparison is sound** (prev. best €7.47) |
| Distinct payers | **9 this week vs 5 last week** |
| Card customer | **stopped while funded** — €3.91 unspent, silent since 08-26T19:02Z |
| External spend, 7d | €5.27 of the €50 envelope |
| Deployed commit | `f767264a` == `origin/main` tip at check |
| Open PRs | 2 at start → 1 at end (#409, disposed with owner + deadline) |
| Remote branches | **30 → 23** (7 deleted, each verified merged then verified gone) |
| Vendor tower | ACTION NEEDED — 4 CRITICAL, all OpenRegister, all known and by design |

## The commercial read

### The single-buyer dependency broke, and the honest way to say it is in euros

Revenue from **everyone except that week's largest payer**, discrete ISO weeks,
canonical external population via `lib/metrics`:

```
07-13  €0.00 (1 payer)     08-03  €0.73 (2)
07-20  €2.15 (3)           08-10  €7.47 (2)
07-27  €0.45 (2)           08-17  €2.40 (5)
                           08-24  €14.03 (9)  <- 5 of 7 days elapsed
```

**Why this is a legitimate comparison where the concentration ratio is not.**
`Concentration.comparable` returns false on a partial week and is right to —
a top-share *percentage* on a Tuesday is an artefact of which days elapsed.
But an absolute euro count from non-largest payers in a partial week can only
**understate** the completed week, and a payer count only accumulates. So both
of those move safely in one direction. The top share does read 70.7% against
last week's 96.4%; **that pair is deliberately not written down as a movement**
(the 2026-08-22 F2 correction), and it is not in the brief either.

Second-sourced two independent ways: the per-payer breakdown (€47.93 − €33.90 =
€14.03) and the windowed rank query agree exactly.

### The largest buyer did not shrink to produce it

`e9e672ef719ee934` per-day: **€9.13/day** across the completed week of 08-17,
**€8.08/day** across the four completed days of 08-24. An 11% difference at a
volume where a single day moved 3.4× in either direction last week — noise, and
it is not reported as a decline. **The business grew around its largest buyer,
not away from him.** First evidence for M1's concentration bar since it was set.

### The card customer stopped while still funded — the 08-27 watch was aimed at the wrong event

`provider@dlgt.io`. Last purchase **2026-08-26T19:02:51Z**. Wallet still holds
**€3.91**, unmoved for two days. The 08-27 brief framed the coming event as
"they run out in days; watch for a second top-up". They did not run out.

**Nothing on our side turned them away, and that was checked rather than
assumed:** 19 transactions, every one `completed`; zero rows in any other
status; zero `failed_requests`; no error string on any row. Two tables agree on
the last-seen timestamp. So we have **no evidence of a cause**, and the absence
is the finding — a customer who stops while funded and unblocked is a demand or
fit signal, not a reliability one.

Full ledger: €2.00 trial (08-23) → €10.00 Stripe top-up (08-24T23:58Z) →
€8.09 spent → €3.91 left. €7.00 of the €8.09 is `competitor-compare` at €1.00.

**The one lead worth pulling is what their calls cost them in time.** Every
`competitor-compare` call they made: 14,949 · 14,276 · 14,056 · 11,892 · 14,791
· 14,776 · 14,855 ms. Their last session was three of those inside 49 seconds —
the hand-assembled three-way comparison. The shape they want costs them **€3.00
and ~45 seconds of waiting**.

> **Explicitly NOT a defect claim, and the reasoning is recorded so the next
> session does not re-run it.** The proximity to the 15s in-transaction ceiling
> on `/v1/do` is a coincidence, not a mechanism: the capability declares
> `avg_latency_ms = 15000`, which is above the 10s `ASYNC_THRESHOLD_MS`, so
> these route **async** and the 15s ceiling does not apply. One internal call
> did record 15,751 ms and completed normally. No timeout has been demonstrated
> and none is claimed.

### E4 — day 10 of 14, zero sales, and the kill criterion needs a caveat

Zero external sales across `competitor-read` / `page-seo-check` /
`prospect-brief` / `keyword-scout` since they went payable on 08-18. Kill fires
**2026-09-01**.

**But the control moved too:** `lead-email-verify` took 26 external orders in
the week of 08-17 and 3 so far in the week of 08-24 (8 orders / €1.60 since
08-18, last sale 08-24). "The four do not sell" and "bundle traffic is down
generally" are **not distinguishable from this data**. Whoever closes E4 on
09-01 must say which, or record that they could not. Owner: next session.

## Overnight health (step B)

Vendor tower **ACTION NEEDED**, nothing new. Four CRITICAL lines, all
OpenRegister: no credits, and `german-company-data` + the three German bundles
auto-suspended until the **2026-09-06T23:40Z** free reset. Settled 08-27 as not
worth buying (€1.80 of demand, all from the wallet we already have, against
€59/month). Three WARNINGs for paid providers with no vendor account record
(`cobalt-intelligence`, `einsearch`, `sec-api-io`) and two for
declared-but-unreported spend monitoring — all pre-existing.

Deployed commit `f767264a` matched `origin/main` at check time.

## Shipped

| | what |
|---|---|
| **#420 merged** (`e6079708`) | manifest-sync field scope explicit and enforceable; a destructive default that fires when you say nothing is now refused |
| **#421 opened** | `/x402/catalog` output_schema projection, opt-in |
| `8e9e23c7` | preserved the 2026-08-27 Austria record (see below) |
| `38e98b99` | redacted the write-credential name from it |

### #421 — disposing of the first outside contributor's second PR

#409 (`epistemedeus`, FIRST_TIME_CONTRIBUTOR, fork) proposes projecting
`output_schema` on every `/x402/catalog` entry. Unlike #402 this touches
**serving code** on the revenue rail, so it was reviewed rather than waved
through.

What I verified independently of the contributor's tests:

- The one-line production change is **not a no-op** — `ensureCache` already
  selects and caches `outputSchema` (`x402-gateway-v2.ts:149,182`).
- It **leaks nothing**: `/v1/capabilities` has exposed `output_schema` all
  along. This was an inconsistency between two views of one column.
- **Its stated rationale is already satisfied.** "So a buyer can inspect the
  contract before authorization" — the 402 challenge for a slug already embeds
  the same schema under `accepts[].outputSchema`, at the moment of
  authorization, in ~3.5 KB. Verified live against `/x402/paid-api-preflight`.
- **The cost the PR does not mention.** All 297 capabilities carry a populated
  schema, so this lands on all 271 listed entries. Measured on the real payload:

  | | raw | gzipped (what crosses the wire) |
  |---|---|---|
  | today | 203 KB | **40 KB** |
  | always-on | 574 KB | **182 KB** |
  | | x2.83 | **x4.50** |

  Gzip makes the ratio *worse* — the existing catalogue is highly repetitive
  and the schemas are not. That is a 4.5x regression on an unauthenticated
  endpoint discovery crawlers poll.

So #421 carries the substance with the default narrowed to
`?include=output_schema`. Solutions never gain the key (no source column —
absent must stay absent, not become `null`); an authoritative `{}` projects as
`{}`; unknown include names are ignored rather than refused.

**Discrimination via `mutation-test.mjs`, both directions, clean tree,
green → red → green:**

| mutation | result |
|---|---|
| projection always on (the un-narrowed #409 form) | **CAUGHT** — 2 of 7 fail |
| opt-in silently ignored | **CAUGHT** — 4 of 7 fail |

**#409 itself is left open, owner me, deadline the next synthesis** — it closes
when #421 merges. I did **not** comment on or close the fork PR: the "who may
propose changes at all" question the 08-27 brief put to Petter is unanswered,
and a public maintainer act on an outside contribution is the wrong thing to do
while it is open. That is a deliberate hold, not an oversight.

## Stale-work sweep (B2 / B2b / B3)

### The hygiene check ran a stale copy of its own repair — LESSONS F5 incident 9

Run from the primary checkout as B2b requires: **0 red, 4 yellow.** The
orphaned-handoff warning named three files. Verified by **content** against
`origin/main` rather than believed:

```
2026-08-22-PROCESS-VIOLATION-...   local=c97235f1  main=c97235f1  IDENTICAL  <- false positive
2026-08-22-starve-set-1-...        local=9d9f630d  main=9d9f630d  IDENTICAL  <- false positive
2026-08-27-at-firmenbuch-migration local=edff5dd2  main=ABSENT     GENUINE   <- real, now committed
```

Two of three are the exact false positives **#407 was written to eliminate**.
The reason they came back: #407 is on main, and the primary checkout sits on
`remediation/wp9-artifacts`, now **62 commits behind**, so it runs its own
stale copy of the script. B2b's instruction to run it from the primary checkout
and B2b's caution against switching that checkout's branch combine into a
standing guarantee that **the staler the checkout, the staler the check run
against it** — and staleness is what the check exists to detect. Filed as F5
incident 9 with the repair direction (a version-independent check, or a
`--repo` argument run from a current checkout — not a third edit to the
predicate).

The genuine one was real: 78 lines of the Austria/Firmenbuch migration record,
existing nowhere else. Committed as `8e9e23c7`. It then **failed the
write-access guard** — it named the production write-credential variable in
prose, which only the authority module may do. Redacted (`38e98b99`) rather
than added to the guard's allowlist, because that allowlist is deliberately a
per-file decision and growing it per handoff erodes the guard.

### Branch graveyard: 30 → 23

Deleted, each verified content-merged with `git diff` **first** and verified
gone with `git ls-remote` **after** (F7: a deletion written down is not a
deletion executed). Restore record:

```
docs/receipt-phase5-accepted          0b674119ff20cd98d3bc23a2f677ae17c8f1fe1c
docs/remediation-rebaseline           bab183c0964de18607939ab9f507aec1897965bc
fix/js-yaml-test-review-followup      a14f149ac0a8490637f134b6a950e72f3f800d22
fix/sharp-test-review-followup        0a2d762f224092ddc6bcb250d0f3fa3aaae1d2a3
feat/competitor-compare-cache         91289d49263e27de2b7b5b12326b8b26be252272
fix/image-resize-format-validation    5588e82f2aea87e7c5ff16cd9ef5566455512a5c
feat/sync-field-allowlist             4caa0ccaae262ad81d024872dd7bf83f5cd910ba
```

**A measurement fault in the sweep itself, caught before it decided anything —
logged as F2 incident 8.** The first pass computed unique-work per branch by
comparing blob ids from `git rev-parse origin/main:<path>`. For any path
starting with a dot (`.claude/…`, `.agents/…`) git resolves `<rev>:<path>`
**relative to the current directory**, so both lookups errored and the
comparison ran on two sentinels — reporting a fully-merged branch as carrying
two unique files. Caught only because it contradicted `git diff`, and the
contradiction was chased rather than averaged. The error direction was
fail-safe here (retain, not delete), but the same bug with both sentinels equal
silently marks a divergent file as merged, and this sweep **deletes branches**.
Every deletion above was re-verified with `git diff` before execution.

### Still open, with owner and deadline

- **The primary checkout is still parked on `remediation/wp9-artifacts`**, now
  62 behind main, 3 modified tracked files plus untracked scratch. Not switched
  — 22 of 22 touched files still differ from main, so this is real unmerged
  work. Owner: the remediation programme. **Deadline 2026-08-31** (unchanged
  from 08-27; if untouched then, raise at synthesis). It is now also the
  *cause* of F5 incidents 8 and 9, which raises its cost beyond tidiness.
- **16 remaining unmerged branches**, none content-merged, none over a month
  old. Owner: me. Deadline: next synthesis — a PR or a deletion each, not a
  third listing.
- **#409.** Owner: me. Closes when #421 merges.

## Not investigated, deliberately

The four `competitor-compare` failures on 08-27 are our own harness being
correctly refused by the ALLOW_MATRIX cost guard (`internal_test` context,
`paid_prepaid` capability). A correct refusal, not a defect — recorded so it is
not chased again.

## For the next session

1. **The card customer is the open question and the framing has changed** —
   not "will they top up" but "why did they stop with €3.91 left". Nothing on
   our side explains it. The multi-entity comparison capability remains the
   strongest product lead on the board and is still not built.
2. **E4 closes 2026-09-01** and needs the control caveat above, or an explicit
   "could not distinguish".
3. **#421** — merge when green; then close #409.
4. **F5 incident 9's repair** — make the hygiene check version-independent, or
   give it `--repo`. Three incidents in four days on one script.
