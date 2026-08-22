# Two decision briefs

Prepared 2026-08-21. **Nothing in production or public copy has been changed.**
Both need your call.

---

# Brief A — the 11 stranded transactions

## The headline correction

I have been describing these as "11 stranded customer charges since 2026-04-07".
That was wrong, and the per-row data is much less alarming than the framing.

**Ten of the eleven involve no money at all.** They are free-tier calls with
`price_cents = 0` and `user_id = NULL`. No wallet was touched, no ledger row
exists, nothing was charged. The eleventh is a €1.00 debit on an **internal test
account**.

**There is no external customer money at stake in any of the eleven.**

## Per-row state

| # | When | Capability | Charged | Ledger | Output | Account |
|---|---|---|---|---|---|---|
| 1–8 | 2026-04-07 → 04-11 | `url-to-markdown` | €0 | none | none | free tier, no user |
| 9 | 2026-04-15 | `iban-validate` | €0 | none | none | free tier, no user |
| 10 | 2026-04-18 | `url-to-markdown` | €0 | none | none | free tier, no user |
| 11 | 2026-08-12 | `competitor-compare` | **€1.00** | `purchase −100c` | none | `test2@strale.io` (internal) |

## Economically correct terminal state

**Rows 1–10:** `failed`. They produced no output and no charge. `executing` is
simply a status that was never closed. Zero economic content.

**Row 11:** `failed`, **plus a €1.00 refund**. The wallet was debited and no
output was delivered — DEC-14 says we do not charge for work not delivered. The
account is internal, so the refund is bookkeeping accuracy rather than customer
restitution, but leaving a debit against undelivered work misstates the ledger
either way.

## The "complication" I reported was false — corrected

I previously wrote that row 10 (`4994f0b2`, 2026-04-18) is in the audit chain,
that closing it would break its integrity hash, and that this needed a decision
between three options.

**All of that was wrong.** Verified against production:

- The row was **redacted on 2026-08-16** by the 90-day retention purge
  (`deletion_reason = content_retention_purge`), six days before this plan.
- Its hash **already mismatches**, and has since that purge. The reconciliation
  does not cause it.
- `/v1/verify` short-circuits on `redactedAt` **before** comparing hashes, so it
  already returns `hash_valid: null` with an accurate retention explanation:
  *"This is routine and not tampering."*

The status flip is **invisible to verification**. There is nothing to decide.

Worse, my recommended option 3 would have published a **false attribution** —
announcing a hash break caused by this reconciliation when the break was caused
by routine retention and is already correctly disclosed. The mechanism could not
have expressed it anyway: `windowsCovering()` keys on a record's creation
instant, so an entry would have declared integrity lost for *every* record
created on 2026-04-18.

**Correct action: nothing special.** Close the row with the other nine.

One thing worth knowing before touching it at all, which the review surfaced:
`4994f0b2` is the **third-largest fork point in the chain** — 2,192 direct
children, and 92.5% of all transactions have it as an ancestor within the
default depth-20 walk. Its mismatch is invisible *only* because the redaction
short-circuit fires first. If `redacted_at` were ever cleared, `/v1/verify`
would return `verified: false` for most of the platform. That is true today,
this change does not affect it, and it strengthens the case for leaving the row
otherwise alone.

## Proposed remediation

**This section previously printed an `UPDATE ... WHERE status = 'executing' AND
price_cents = 0` statement.** That was the dangerous form — `executing` is the
LIVE transient state of every call currently in flight, and production runs ~408
transactions an hour. It is not what will run, and it has been removed rather
than left as a description an approval could be given against.

What runs is `apps/api/scripts/reconcile-stranded-executing.ts`, and its
behaviour is:

- **Pinned to eleven literal UUIDs.** Nothing is discovered by querying status.
  Three independent conditions (`id IN (…)`, `status='executing'`,
  `created_at < cutoff`) each exclude a live row on their own.
- **Refuses and exits** if the snapshot returns anything other than 11 rows, if
  any row carries output, or if any row carries a charge with no wallet owner
  (the x402 shape — reversing one of those means reversing an on-chain
  settlement, which this script cannot do and must not report as "no charge
  exists").
- **One database transaction** for refunds, the status close and the durable
  record. An abort rolls back all three; there is no half-applied state.
- **Does not stamp `completed_at`.** These executions never completed. It is
  also load-bearing: `integrity-hash-retry` admits only rows with a
  `completed_at`, so leaving it NULL is what keeps that job away from them.
- **Writes a `manual_reconciliation` event per row** to `health_monitor_events`,
  carrying the transaction id, the before/after status, whether a refund
  occurred, and the founder policy verbatim. Ten of the eleven rows are already
  content-redacted, so the closure note cannot be written into their `error`
  column — without this event those ten would have been mutated with no record
  anywhere of who changed them or why.

Idempotent: a second run finds zero targets still `executing` and refuses at the
count check before writing. The refund additionally checks for a prior refund
ledger row against the same transaction, and goes through `walletService.refund`
(WP2) so the balance change and its ledger row cannot diverge.

## Rollback and proof

- **Before:** capture all 11 rows and the wallet balance to a file.
- **Proof of correctness:** re-run the census — `status='executing'` returns 0;
  the refunded wallet balance rises by exactly 100c; a `refund +100c` ledger row
  exists referencing transaction 11.
- **Rollback:** the statements are reversible from the captured snapshot. The
  refund is not "un-done" by reversing the ledger — it would be a compensating
  entry, which is the correct accounting treatment.

## Founder policy, applied

> "When successful billable delivery cannot be proven from durable evidence,
>  resolve ambiguity in the customer's favour; do not create or preserve a
>  charge based on inference."

Every one of the eleven has `output IS NULL` and no error. There is no durable
evidence that anything was delivered, so no charge may stand. The policy also
forbids the reasoning I might otherwise have reached for — that the executor
"probably ran" — and the script refuses outright if any row carries output,
because that would be the other branch of the policy and needs deciding
individually rather than in a batch.

Ten rows carry no charge, so the policy is silent on them; they are a status
correction with no economic content.

## Verified dry run against production

`apps/api/scripts/reconcile-stranded-executing.ts`, read-only, 2026-08-21:

```
BEFORE — 11 rows in status='executing'
  total charged against undelivered work: 100c

PLANNED ACTIONS
  10 row(s): close status only (no charge exists)
  e995cbb7: close status + refund 100c

DRY RUN — nothing written.
```

## Before / after economic state

| | Before | After |
|---|---|---|
| **Targets** in `status='executing'` | 11 | 0 |
| Charge standing against undelivered work | 100c | 0c |
| Wallet `2e3d9f92` balance | *live value at run time* | **+100c** |
| Ledger rows referencing these transactions | 1 (`purchase −100c`) | 2 (`purchase −100c`, `refund +100c`) |
| `manual_reconciliation` events | 0 | 11 |
| External customer money affected | **none** | none |

Two corrections to how this table used to read. It quoted an absolute wallet
balance of `3052c → 3152c`; that wallet is live and had already moved to 3047c
by the time the figure was reviewed. **The durable fact is the delta, +100c** —
the script prints the real before and after at run time. And the first row now
says *targets*: an unbounded census of `status='executing'` reads calls that are
merely in flight, so a completely successful run could report a non-zero count
and be misread as a failure.

## Recommendation

**Approve all eleven as one batch.** Ten are free-tier status hygiene with no
economic content. The eleventh returns €1.00 to an internal account, where the
value is a correct ledger rather than the money.

**No separate decision is needed for row 10's hash.** The earlier version of this
brief recommended publishing a chain-integrity disclosure for it. That
recommendation is withdrawn — the same document establishes four paragraphs
earlier that the mismatch was caused by the 2026-08-16 retention purge, is
already correctly disclosed by `/v1/verify`, and has nothing to do with this
reconciliation. Publishing a disclosure would have attributed it to us falsely.

This is a much smaller decision than I previously represented, and I am sorry
for the earlier framing — I carried "11 stranded charges" forward for several
turns without opening the rows.

---

# Brief B — the public tamper-evidence claim

## The exact current claims

Six surfaces, verbatim from `strale-frontend`:

| File | Claim |
|---|---|
| `pages/Methodology.tsx:239` | "Every successful transaction produces a hash-chained audit record — **tamper-evident**, and retrievable independently of the original call." |
| `pages/Security.tsx:265` | "Every transaction is linked via a hash chain, providing **tamper-evident integrity** for audit records." |
| `pages/Privacy.tsx:328` | "...audit logging, and **tamper-evident audit chains**." |
| `components/QualityScoringSection.tsx:65` | "Hash-chained record — **Tamper-evident audit trail**, retrievable per transaction" |
| `pages/CapabilityDetail.tsx:416` + `SolutionDetail.tsx:192` | "Every successful call returns a **hash-chained audit** record" |
| `data/learnGuides.ts:2054` | "Every strale.do() call creates an **immutable transaction record**" |

## What `/v1/verify` actually does

It walks the chain **backwards** from the target row, following `previous_hash`,
up to a depth cap. It reports `verified: true` when the target's own link is
valid and `brokenLinks === 0`, plus a `truncated` flag.

**This is the critical detail:** a backward walk is well-defined even in a
forked chain. Each row has exactly one recorded parent, so walking child → parent
succeeds regardless of how many *siblings* that parent has.

During the 2026-05-04 → 2026-08-21 window one parent acquired **150,719
children**. `/v1/verify` returns `verified: true` for every one of them. **The
endpoint cannot detect the defect it exists to detect**, because detecting a fork
requires looking forward, and detecting a deletion requires knowing what should
have been there.

## What is actually true today

| Property | Status |
|---|---|
| A given record's **content** is unaltered since hashing | **TRUE** — 99.7% of rows inside the 90-day window verify |
| Records are in a **provable order** | **FALSE for 2026-05-04 → 2026-08-21** |
| **No record was deleted** from the chain | **FALSE for the same window** |
| Records outside that window | ordering and completeness intact |
| Rows past 90-day redaction | hash deliberately will not match; already disclosed by `/v1/verify` |

"Tamper-evident" is defensible for *alteration of an individual record*. It is
not defensible for ordering or deletion across that window — and those are what
most readers of "hash chain" assume.

## Proposed replacement copy — SUPERSEDED

This section previously proposed a hedged replacement paragraph. **It is
withdrawn**, for two reasons:

1. It ended *"…the affected period is disclosed in every verification
   response."* **That sentence is false.** `orderingDisclosureText()` is
   unwired — no production consumer — and live responses carry no such
   disclosure. It would have replaced one overstatement with a fabricated one.
2. It proposed a replacement cryptographic claim, which the founder instruction
   forbids unless every word is supported by production behaviour.

**The operative plan is `docs/remediation/PUBLIC-COPY-CORRECTION.md`**, which is
pure subtraction with no replacement claim. Where the two documents differ, that
one governs.

## The surface list is much larger than this brief first said

Two rounds of independent review each found surfaces the previous round had
missed. The current count is **32 locations across four deploy units**, and the
three most consequential were absent from the first two versions of the plan:

- **`Privacy.tsx:42-43` states the opposite of production behaviour** — that
  redaction preserves hash verifiability, when redaction is exactly what breaks
  it. Not an overstatement; false.
- **The shareable audit page and its PDF assert "Verified compliance record"
  unconditionally** and never call `/v1/verify`. That page is the artefact a
  compliance reviewer actually receives.
- **A diff in version 2 did not match the line it claimed to change**, so the
  word "immutable" would have survived inside FAQPage structured data on a
  public `/learn/` route.

## Recommendation

**Apply the full plan in `docs/remediation/PUBLIC-COPY-CORRECTION.md`.** That
document governs; where this brief and that one differ, that one is right.

**Sequence:** API deploy first (it carries the strongest claim on the platform —
`llms-txt.ts:110` asserts fitness for *regulatory verification*), then the
frontend release, then the repo commit, then the npm publish.

**No replacement claim of any kind.** An earlier version of this brief argued for
keeping a precise per-record tamper-evidence statement. That is withdrawn: per
the founder instruction a claim returns only when every word is supported by
production behaviour, and demonstrating per-record tamper evidence to a reader
requires a verification endpoint that detects what the claim asserts.
`/v1/verify` currently returns `verified: true` for records where twenty of
twenty-one chain links are redacted. Until that changes, the honest position is
to describe the mechanism and claim nothing about it.

**Also not proposed:** wiring `orderingDisclosureText()` into `/v1/verify`. It
would add a new public statement, and the instruction is to remove first. It
stays drafted and unwired. Making the endpoint able to detect a fork — and
therefore able to support a claim again — is WP14.
