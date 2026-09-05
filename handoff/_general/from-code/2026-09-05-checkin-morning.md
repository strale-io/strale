# 2026-09-05 — morning operating run

**Intent:** run the daily operating session (DAILY-RUN.md steps A–E), and
dispose of the 2026-09-04 run's work, which never shipped.

Proactivity level 5. Production access was read-only throughout; no write was
attempted and none is owed.

---

## 0. The state this run inherited

The 2026-09-04 run produced both its artifacts and opened **#507**, and then
stopped. The branch sat 45 commits ahead of `main` with **four consecutive red
CI runs**, so yesterday's brief, its operating record and its code fix were
never on `main` and never deployed. The morning-check task is the only thing
that reads that branch, and nothing had.

Every one of those four runs (33844706878, 33845134155, 33845805355,
33845838196) failed the same step — `node scripts/guard-production-write-access.mjs`
— naming the same file. That is the fail-before evidence for §2 below; the
guard was never in doubt.

---

## 1. Business measurement (step A)

Both instruments run from `apps/api`, production read-only.

`scripts/commercial-brief.ts`, discrete ISO weeks:

| week | revenue | calls |
|---|---|---|
| 2026-08-31 (day 6 of 7 — **not comparable**) | €48.44 | 991 |
| **2026-08-24 (last completed)** | **€73.03** | 1295 |
| 2026-08-17 | €66.31 | 1000 |
| 2026-08-10 | €39.24 | 620 |
| 2026-08-03 | €27.38 | 451 |
| 2026-07-27 | €10.85 | 193 |

`growth()` → **rising**, fourth consecutive completed-week rise.

**Concentration moved, and this is the headline.** Last completed week:
**13 distinct payers, top share 76.0%** (€55.49 against €17.54 from everyone
else), **100% of revenue attributable**. The week before: **96.4% across 5
payers**. Both weeks sit entirely after the 2026-08-15 identity instrument and
both clear `Concentration.comparable` (`coversWindow` ok, attributedShare ≥ 0.8,
not partial), so this is a legitimate week-on-week comparison and not the
coverage artefact that was corrected on 2026-08-22.

Against M1 (≥5 distinct payers, none above 60%): the payer-count bar is now
**cleared**; the concentration bar is **16 points short**.

`newPayers` / `returningPayers` remain `unavailable` and were not guessed.

**Second source.** `scripts/ceo-dashboard.ts`: 7d revenue **€60.56**, buyers
**19 (lower bound)**, identity coverage 100%, external spend **€2.21** of the
€50/wk envelope. Consistent with the pack. Canonical 30d external revenue
`revenueCents()` = **€252.87**; my independent per-payer sum came to €251.79 —
agreement to about a euro.

Top external payers, 30d: `e9e672ef…` €174.65 / 3496 calls · unattributed
€57.62 / 1210 · `account:e3c68534…` €11.09 · `35f8dfc0…` €5.99 ·
`6bfcaec6…` €2.05 · `e75ee192…` €0.39.

---

## 2. Overnight health (step B)

`npm run vendor:status` — **ACTION NEEDED**.

- **CRITICAL openregister** — 0/500 credits, free plan, no overage. Reset
  **2026-09-06T23:40:04Z**. `german-company-data` and the three German
  solutions (`invoice-verify-de`, `kyb-complete-de`, `kyb-essentials-de`) are
  **automatically suspended**. Self-restoring; nothing is owed, nothing to buy.
- WARNING esortcode — finite prepaid credits, no balance endpoint integrated.
  Durable by design (DAILY-RUN.md §B); not re-tested with paid traffic.
- WARNING anthropic / cdp — spend monitoring declared, no reading yet.
- WARNING cobalt-intelligence / einsearch / sec-api-io — paid/finite providers
  with no vendor account record. Consistent with DQ-30 (no subscription exists).
- Browserless 998/1000, Serper 47286/50000 (expires 2026-11-08), Dilisense and
  Anthropic healthy.

**Deployed commit equals `main`.** `GET /health` → `14f3fa27c034`;
`git log origin/main -1` → `14f3fa27c034…`. No drift.

CI on `main`: green.

---

## 3. The finding of the day — and the hypothesis it killed

### 3.1 What happened

On **2026-08-24** the wallet behind €174.65 of the last 30 days' revenue — our
largest payer — ran **195 `german-company-data` calls in a single day**. 36
completed, **159 refused**. Every refused query is a German insurance broker by
name ("Beckmann Versicherungsmakler GmbH", "Assekuranz Stahl GmbH", "Martens &
Prahl"): one buyer working down a list.

**In the twelve days since: zero German calls.** The same wallet keeps buying
160–320 calls/day of everything else. Their basket, 30d:

| slug | calls | ok |
|---|---|---|
| email-validate | 1631 | 100% |
| google-search | 297 | 100% |
| keyword-suggest | 204 | 100% |
| **german-company-data** | **195** | **18%** |
| image-to-text | 175 | 92% |
| startup-domain-check | 159 | 100% |

It is the only thing they buy that fails.

**Nobody was charged.** Revenue is `status = 'completed'`; the €7.95 of list
price on the 159 refused rows is declined demand, 4.4× the €1.80 earned on the
36 answered.

### 3.2 The hypothesis I had, which was wrong

`german-company-data` shows `x402_enabled = false`. Given this repository has a
tracked family for exactly this (a correct refusal counted as a capability
fault), the obvious read was that the quality floor delisted it. **It did not,
and both automatic mechanisms behaved correctly.**

From `health_monitor_events`:

- `quality_floor` / `german-company-data`, 2026-08-24 09:27 **and** 2026-08-25
  09:28, both `action_taken: flagged_only`, `quarantined: []`, reason:
  *"completion 21% on 179 eligible calls/30d, but counted failures span only
  1 day(s) (< 2) — burst, not a trend; deferred"*. The burst guard held.
- `vendor_suspension` / `german-company-data`, **2026-08-25 16:07**, *"Suspended
  until OpenRegister reports usable credits"*, `observed_reset_at`
  2026-09-06T23:40Z. **This** is the delisting, and it is right.

**Causation, stated carefully:** the customer's last German attempt was
2026-08-24; the suspension landed 2026-08-25. They stopped *before* we turned it
off. The suspension did not cost us this workload — the 18% success rate did.

### 3.3 The refusals are correct; their shape is not

`pickByName` (`german-company-data.ts:176`) refuses when two distinct German
registrations tie at equal confidence, because "Otto GmbH" and "Otto GmbH & Co
KG" are separate legal entities with separate liability, and silently returning
one is the #161 wrong-company class already fixed for FI/NO/EE/CH. For a KYB
product this is right and must not be weakened.

What is wrong is that the candidates — up to four of them, with register type,
register number and `company_id` — are already computed and then **embedded in
the prose of a thrown `Error`**. An agent buyer cannot act on an English
sentence. Returned as structured candidates, "we refused" becomes "here are your
two options, call again with this id", resolvable by the caller's own agent.

**Not attempted today, deliberately.** It changes a customer-facing output
contract, needs the manifest/test pipeline, and **cannot be verified end-to-end
until the allowance resets 2026-09-06T23:40Z** — the upstream has 0 credits.
`pickByName` is a pure function of `(query, results)` and is unit-testable
before then. This is the next session's highest-value work.

### 3.4 The generalisation, which is worth more than the incident

Every external capability with ≥20 real calls in 30 days and <75% completion —
the whole list:

| capability | external calls | completed | declined (list price) |
|---|---|---|---|
| german-company-data | 196 | 19% | €7.95 |
| product-reviews-extract | 25 | 8% | €5.75 |
| brazilian-company-data | 33 | 64% | €0.60 |
| url-to-text | 49 | 71% | €0.28 |

**€14.58 declined in 30 days against €252.87 earned** — about one euro refused
for every seventeen taken. **Not one is a defect.** `product-reviews-extract`
refuses Trustpilot **14 times** because its ToS prohibits automated access
(DEC-20260428-A working as written); the rest are caller 404s and someone
else's bot protection.

The finding is the **missing instrument**. Completion percentage — what the
quality floor acts on and what a trust surface displays — cannot separate "we
broke" from "we declined". On `german-company-data` that arithmetic reached 21%
and produced a deactivation proposal against a capability doing exactly its job;
a burst guard is what stopped it, and a burst guard is a timing accident, not a
semantics fix. Two signals are being thrown away in one subtraction: a refusal
is not a quality signal, and a refusal *is* a demand signal.

Recorded in GOALS.md § "What we currently know" (two entries).

---

## 4. Code shipped this run

### 4.1 `who-called.ts` reaches production read-only (`fefc3319`)

Its docstring said "Production read-only"; its handle was `getDb()`, the
application read-write pool. Now `openOperatorDrizzle()` — read-only enforced by
Postgres (SQLSTATE 25006), not by the script's intentions. Fail-before evidence:
the four red CI runs in §0.

Second defect, found by *running* it rather than reading it: the operator handle
loads no environment of its own, so the swap alone left it dying with
"DATABASE_URL is required". It now loads the same repo-root `.env` every other
operator script reads.

### 4.2 Independent review returned FAIL, and it was right (`d7427bb5`)

Per DEC-20260903-A a fresh read-only agent that did not author the batch
reviewed #507. Verdict **FAIL**, one blocker. Both findings reproduced against
production before being fixed.

**BLOCKER — our own liveness probes were printed as failing customers.**
`transactions.status` has a fifth value the schema comment does not list:
`health_probe`, written by our own server (`app.ts`) with no user, no price and
no payer. **507 rows**, 2026-04-16 → 2026-08-21, permanently in the table (they
are in the audit chain and cannot be deleted). The partition asked only whether
`user_id` was null, so every one classified `anonymous`:

```
before:  anonymous (x402)   78   completed 0   failed 78
         -> 78 customer call(s), of which 78 failed
after:   x402 (wallet paid)  1   completed 0   failed  1
         -> 1 paying call(s), of which 1 failed
```

**77 of 78 were our own probes — a 78× overstatement**, in the one tool built to
stop a harness count being read as customer impact, on the first group it
prints, and DAILY-RUN.md now points the daily run at it. The repository already
knew these rows are not executions in two other places
(`rail-coverage.test.ts`, `integrity-hash-retry.ts`); this predicate did not.
`externalCustomers()` had the same hole — invisible to revenue (every revenue
consumer filters `completed`), live for `identityCoverage()`, which counts rows.

**SECOND — `anonymous` was labelled "x402" and is not.** `do.ts` says a null
user serves three cases; over 30 days **59** anonymous rows had no wallet at all
(Deno, curl, and browser hits refered from strale.dev). Split on
`x402_payer_hash`, already indexed. Four classes now: `harness`, `account`,
`x402`, `anonymous`, and the summary line no longer calls a crawler a customer.

Also: `--failing` used `status <> 'completed'`, a denylist that swept in the
probes and would have counted an in-flight call as a failure. It names `failed`.

**Third — a wrong number in my own GOALS entry from this morning.** It paired
the day's refusals with 30-day earnings ("€1.85 on 37") in one sentence.
Corrected to €1.80 on 36, both figures the single day, with the mix noted.

**Tests discriminate — proven, not asserted.** Four mutations planted, each
caught by exactly one test: drop the `health_probe` branch (the blocker's
original state); drop the x402 split; drop the exclusion from
`externalCustomers`; make the TS twin ignore status while the SQL stays right.
16 tests green unmutated. One pre-existing repair: the drift test compared
rendered SQL literally, and adding a bind ahead of the identity subquery
renumbers every placeholder inside it — it now normalises placeholder numbering
and run-matches the binds, so it still fails on reordering or dropping any.

---

## 5. Housekeeping (steps B2, B2b, B3, C)

- **B2b hygiene** — `session-close-check.ts --hygiene-only`, run from the
  primary checkout as DAILY-RUN.md requires: **all clear**.
- **B3 branch graveyard** — **12 remote branches deleted**, all with MERGED PRs
  (they read as "ahead" only because of squash merges; PR state was the
  authority). Local ref first, then remote, then re-verified against
  `git ls-remote` rather than the local cache. Remote is now three branches:
  `main`, `chore/checkin-2026-09-04`, `docs/m2-g2-batch-2-collisions`.
  Restore record (branch → commit), so every deletion is recoverable:

  | branch | commit |
  |---|---|
  | ci/docs-only-fast-path | dd0286ac0bcfeb256f2c26af3975c084fc376549 |
  | docs/m2-batch-11-counterparty-assurance | aaf726f9bbd9726ef9aaa6fea5f515c3b95368c3 |
  | docs/m2-batch-12-vendors-registries | 408c8d15eb46dcba1b8608f4f33987da6ee191d3 |
  | docs/m2-batch-13-founding-decisions | b073303d0fdb353a9c68d732d4ec15a9f40a03a5 |
  | docs/m2-batch-14-founding-week-two | 89c8539257f6f0bd273606d43f356c904d47335e |
  | docs/m2-batch-15-march-first-half | bef4373473ab91d44be087fd5bafa91b76facfc4 |
  | docs/m2-batch-16-march-second-half | 969b7bee1cdc57502f6fea2cf4645b4b455bfb54 |
  | docs/m2-batch-17-april-to-early-may | b4fb78b588a497b9da5132b3128a9cb3045aaba0 |
  | docs/m2-batch-18-may-rows | 93ee0ea361470f30ece4d4af36baa01e8a827de4 |
  | docs/m2-g2-batch-1-collisions | 75676df30b13ef4c97fccacedafe9d45b9fd49af |
  | feat/free-api-agent-capabilities | a449c09e768064c985cb8b9036b6ce10e14c6a8a |
  | fix/codex-backlog-test-teardown-race | a970cae06a2d789f12432a17092882e94f06ba9c |

  Local-only `pr-542-review` (2e133bbe366a8b00f91fd9c064b940fac0213e00) also
  deleted — a review scratch branch whose PR merged.
- **Step C, decision queue** — no `preauthorized_notice` item has matured.
  **DQ-27** and **DQ-14** stay `your_call`; both carried into the brief
  unchanged as `AUTHORIZATION_UNAVAILABLE`. Moving either into my own column
  would be the F10 breach, and neither blocks any work stream.

### Not disposed of, with an owner

- **PR #555** (`docs/m2-g2-batch-2-collisions`, M2 G2 batch 2) — green, not
  draft, another session's live work; its worktree under `.claude/worktrees/`
  is **locked**. Merging it out from under that session is not this run's call.
  **Owner:** the M2/T10 session. Expected follow-up is the usual "recorded" PR.
- **`C:/tmp/strale-review-547` and `C:/tmp/strale-review-555`** — detached
  review worktrees belonging to other sessions. Removing another session's
  worktree is not an unattended-run operation and a clean tree is not proof of
  idleness. **Owner:** whoever owns those reviews. They are why
  `handoff:check`'s one-batch-worktree rule cannot pass honestly right now; see
  §7.

---

## 6. Authorities updated (step E)

- **GOALS.md** — two new entries at the head of "What we currently know": the
  German workload and the declined-demand pattern.
- **LESSONS.md** — **no new incident recorded, deliberately.** The natural
  candidate was the tracked "correct refusal counted as a fault" family, and
  the evidence says the guard held. Filing a family instance that the data
  contradicts is how a count becomes fiction, and this file already carries a
  correction for exactly that.
- **DECISION-QUEUE.md** — unchanged; nothing matured, nothing resolved.
- **BUDGET.md** — no new external-cost source. Spend €2.21 of €50 this week.

---

## 7. What the next session picks up

1. **Structured candidates for `german-company-data` refusals.** The design is
   settled (§3.3); the work is a customer-facing output-contract change through
   the manifest/test pipeline. **`pickByName` is unit-testable now; the
   end-to-end path is blocked until 2026-09-06T23:40Z** when the allowance
   resets. Confirm the vendor tower actually un-suspends the capability and the
   three German solutions after the reset — verify against production, not
   against the `observed_reset_at` field.
2. **Separate "declined" from "broke"** in whatever the quality floor and the
   trust surfaces read (§3.4). Highest-leverage instrument work; €14.58/30d of
   declined demand is currently indistinguishable from breakage.
3. **Where the new payers came from.** 5 → 13 payers and 96.4% → 76.0% in one
   week is the best commercial news in the series and nothing yet explains it.
   `newPayers` cannot answer and must not be made to.
4. **#507 is on the Codex re-review backlog as CX-29** (CX-28 was taken by a
   concurrent session merging #555 while this run was in CI) and owes a Codex verdict
   when the quota returns (DEC-20260903-A).

## 8. Verified state at close

Written after the work, not predicted before it. An earlier draft of this
section said `handoff:check` would fail on more than one batch worktree,
because two detached review worktrees belonging to other sessions were sitting
in `C:/tmp/` mid-run. By close they were gone — their owners cleared them — so
that sentence described a state that no longer existed. It is replaced rather
than left standing: a closing status that was true when drafted and false when
read is the state-drift shape, and this file is the first thing the next
session opens.

- **`handoff:check`: PASSES**, `main` in the trunk worktree, clean.
- **Both PRs merged.** #507 as `b9739d12`, #557 as `dc226db3`.
- **Deployed commit equals `main`:** `GET /health` → `dc226db3f957`, against a
  tip of `dc226db3f957…`. Confirmed after the merge, not assumed from it.
- **Branches:** the two `chore/checkin-*` branches deleted, local ref first
  then remote, both gated on PR state `MERGED`. Remote now carries `main` and
  one other session's open branch. Two stale `worktree-agent-*` local refs
  were deleted with `git branch -d` — both ancestors of `main`, neither
  checked out in any worktree, neither on the remote, so nothing was taken
  from anyone.
- **Left alone, deliberately:** two locked agent worktrees under
  `.claude/worktrees/` carrying uncommitted work, belonging to a running
  session. The gate reports them as notes, not failures. Removing another live
  session's worktree to tidy a gate is the documented F12 mistake and was not
  done.
