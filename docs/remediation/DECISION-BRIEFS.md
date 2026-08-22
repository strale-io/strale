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

## The one genuine complication

**Row 10 (`4994f0b2`, 2026-04-18) is in the audit chain** — `integrity_hash` set,
`compliance_hash_state = 'complete'`. Its hash was computed over its fields,
**including `status = 'executing'`**.

Flipping its status to `failed` breaks its recorded hash. It would then look
exactly like tampering to anyone verifying that record.

This is the WP7 defect in miniature: non-terminal rows were admitted to the
chain, so the value that needs correcting is baked into evidence. WP7 stopped
new rows entering that way; it did not resolve the ones already there.

Three options for row 10, and I recommend the third:

1. **Leave it `executing` forever.** Honest, and permanently wrong in the status
   column.
2. **Flip it and accept the broken hash.** Correct data, one record that fails
   verification with no explanation.
3. **Flip it and record the reason in `chain_integrity_windows.ts`**, alongside
   the 2026-05-04 ordering window. The hash mismatch becomes a disclosed,
   dated, explained fact rather than an anomaly. Consistent with the decision
   not to rewrite chain history.

## Proposed remediation — one idempotent statement

```sql
-- Rows 1-10: close the status. No money involved.
UPDATE transactions
   SET status = 'failed',
       error = 'Execution abandoned before WP3 reservations existed; '
               'no output was produced and no charge was taken. '
               'Closed by the 2026-08-21 stranded-row reconciliation.',
       completed_at = COALESCE(completed_at, now())
 WHERE status = 'executing'
   AND price_cents = 0;

-- Row 11: close the status AND return the money, in one transaction,
-- through the wallet service so the ledger row is written with it.
```

Idempotent by construction: the `WHERE status = 'executing'` predicate matches
nothing on a second run. The refund goes through `walletService.refund` (WP2),
so the balance change and its ledger row cannot diverge.

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
| Rows in `status='executing'` | 11 | 0 |
| Charge standing against undelivered work | 100c | 0c |
| Wallet `2e3d9f92` balance | 3052c | 3152c |
| Ledger rows referencing these transactions | 1 (`purchase −100c`) | 2 (`purchase −100c`, `refund +100c`) |
| External customer money affected | **none** | none |

## Recommendation

**Approve rows 1–10 now** — they are free-tier status hygiene with no economic
content and no chain impact except row 10.

**Approve row 11 with them** — €1.00 to an internal account; the value is a
correct ledger, not the money.

**Approve option 3 for row 10's hash**, so the one broken verification is
disclosed rather than discovered.

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

## Proposed replacement copy

Deliberately narrow to what is provable, and it survives the incident rather
than needing revision if another is found.

**Methodology / Security (the two strong claims):**

> Every successful transaction produces a hash-chained audit record, retrievable
> independently of the original call. Each record's content hash covers its own
> data and its recorded predecessor, so alteration of an individual record is
> detectable. Records created between 2026-05-04 and 2026-08-21 carry a known
> limitation: a defect in chain-head selection meant records in that period do
> not evidence their ordering relative to one another. The defect was corrected
> on 2026-08-21 and the affected period is disclosed in every verification
> response.

**Privacy / QualityScoringSection (the passing references):**
Replace "tamper-evident audit chains" with "**hash-chained audit records**".
Accurate without asserting the property that fails.

**learnGuides:** replace "immutable transaction record" with "**durable
transaction record**". Records are redacted at 90 days by design, so "immutable"
was never true.

## Recommendation

**Change the copy.** "Tamper-evident" is doing specific work for compliance
buyers, and for a 3.5-month window it overstates what the system provides.

**Priority order:** `Methodology.tsx` and `Security.tsx` first — those are the
load-bearing claims a compliance reviewer would cite. The passing references can
follow.

**Also worth doing, and cheap:** make `/v1/verify` disclose the window for
affected records. The text is already drafted in
`apps/api/src/lib/chain-integrity-windows.ts` as `orderingDisclosureText()`,
deliberately unwired. Without it, the endpoint returns `verified: true` for a
record whose ordering we know we cannot evidence.

**What I would not do:** remove the claims entirely. Per-record tamper evidence
is real, it is working, and it is worth stating — precisely.
