# Morning check-in — 2026-08-25

**Intent:** run the daily operating session under DEC-20260815-A as amended by
DEC-20260822-A: measure the business, dispose of overnight health and stale
work, do the highest-leverage thing against M1, and hand back two artifacts.

Proactivity level 5. Deployed and verified: `171c2bf`.

---

## Headline

**A customer paid us by card for the first time in 120 days, and they are
buying the compliance wedge rather than the growth cluster.** That contradicts a
claim GOALS.md has carried since 2026-08-16 and is the most commercially
significant fact this run produced.

Second: **the 2026-08-22 revenue collapse was one day, not a trend.** The week
it belongs to closed as the highest in the series.

Third: **the approved public-copy correction was half-executed and nobody had
noticed.** The website half shipped; the machine-readable half — what agents
actually read — was still serving the strongest claim on the platform. Fixed,
deployed, verified live, and guarded.

---

## A. Measure the business

Both instruments run read-only through `lib/metrics`. No hand-rolled query
produced any number in this file.

### Discrete weeks (`scripts/commercial-brief.ts`)

| week | revenue | calls |
|---|---|---|
| 2026-08-24 | €15.41 | 202 *(day 2 of 7 — NOT comparable)* |
| 2026-08-17 | **€66.31** | **1,000** |
| 2026-08-10 | €39.24 | 620 |
| 2026-08-03 | €27.38 | 451 |
| 2026-07-27 | €10.85 | 193 |
| 2026-07-20 | €37.98 | 522 |

`growth()` over the completed series: **rising** — three consecutive completed
rises (07-27 → 08-03 → 08-10 → 08-17). The week of 08-17 is the highest in the
series on both revenue and calls.

Dashboard regenerated: 7d revenue €60.30, buyers ≥9 (lower bound, instrument
age), identity coverage 97.6%, estimated external spend €2.46 — inside the
€50/week envelope with wide margin.

### Per-day, to settle the 08-22 scare

Through `revenueCents` on explicit one-day windows, canonical external
population:

```
08-17 €16.29 · 08-18 €10.97 · 08-19 €8.72 · 08-20 €9.29 · 08-21 €9.32
08-22 €4.74  · 08-23 €6.98  · 08-24 €11.51 · 08-25 €3.90 (to 05:40Z)
```

The 08-23 GOALS entry recorded a possible durable decline and **explicitly
refused to call it one**. That refusal was correct. 08-22 is the only depressed
day; 08-24 is the second-highest day in the nine-day series. The alert that
paged at 20:47Z on 08-22 was measuring variance.

Worth carrying forward: **at this volume one day is inside the noise in both
directions.** The 08-23 run noted that the matched overnight window on 08-21
carried the same 3 calls as the apparent collapse — that comparison is what kept
a wrong conclusion out of the record.

### Concentration — and a comparison deliberately NOT made

| window | payers | top share | top | others | attributable | comparable |
|---|---|---|---|---|---|---|
| 08-10 (completed) | — | — | — | — | — | **unavailable** |
| 08-17 (completed) | 5 | 96.4% | €63.91 | €2.40 | 100% | true |
| 08-24 (2 days) | 5 | 79.3% | €12.22 | €3.19 | 100% | **false** |

`Concentration.comparable` is `false` on the current window because it is a
partial week. **79.3% is therefore not an improvement on 96.4%, and is not
written down as one anywhere.** On any Monday or Tuesday a partial week reads as
a concentration movement that is purely an artefact of which days have elapsed —
the same trap as F2 incident 7, and the module refuses it by contract. The first
honest read is after this week closes.

`newPayers` / `returningPayers` remain `null` on both windows: the lookback
reaches back past 2026-08-15, when payer identity began recording.

---

## The new customer — the finding of the day

Account `e3c68534-4d7b-4387-9156-a1913f3bc52b`, domain `dlgt.io`.

```
2026-08-23 21:12:21Z  registered
2026-08-23 21:14:44Z  first purchase — competitor-compare, €1.00  (trial credit)
2026-08-23 21:18:34Z  competitor-compare, €1.00                   (trial credit exhausted)
2026-08-24 23:58:39Z  top_up €10.00 — Stripe session id present
2026-08-25 00:00:10Z  buying resumes, 10 seconds after the top-up clears
2026-08-25 02:01-02:12Z  stock-quote, pep-check, lei-lookup, insolvency-check,
                         uk-company-data, uk-disqualified-director-check,
                         us-company-data, vat-validate
```

16 paid calls, €5.09 spent, €6.91 balance remaining, **zero failed calls**, two
distinct active days. User agents: `Python-urllib/3.12` (10), `python-httpx`
(4), `curl/8.5.0` (2) — an agent integration, not a person clicking.

**Second-sourced four ways, because this is the number everything else hangs on:**

1. The wallet ledger shows the full sequence — trial grant, two trial
   purchases, the €10.00 `top_up` **carrying a Stripe session id**, then
   purchases against real balance. Not trial credit.
2. **It is the only Stripe top-up in the last 120 days.** Every euro of revenue
   before it arrived over x402.
3. `dlgt.io` is outside `INTERNAL_EMAIL_SUFFIXES`, so the canonical
   `externalCustomers()` filter counts them external by the same rule every
   revenue figure in this file uses. Exactly one account exists on that domain.
4. Zero failures, so there is no "they tried and it broke" reading to prefer.

**What it contradicts.** GOALS.md has said since 2026-08-16 that *all revenue is
one cluster — SEO and growth research*, and that *x402 buyers buy utility
primitives, not the KYB wedge*. The seven capabilities called in a five-second
burst on 08-25 are a KYB screening workflow. DQ-9 — Petter's 2026-08-16 refusal
to re-point the company at growth and away from compliance — now has its first
supporting evidence rather than only the argument. GOALS.md updated.

**What is NOT established.** That this is durable. It is two days and €10. The
honest next measurement is a second top-up. Recorded as such, not as a trend.

**Customer-data boundary observed.** The identity surfaced as a side effect of
metric hygiene — checking the payer was not one of our own test accounts. Per
CHARTER § "What we may do with customer data" it is reported here and dropped:
no outreach was performed, the domain does not appear in the CEO brief, and it
has not been added to any prospect list. Whether we contact them at all is on
the brief as a founder decision, because the charter's rule 1 (no outreach
derived from transaction evidence) and rules 3–4 (a registration is a
relationship) point in different directions here, and rule 6 makes resolving
that his.

---

## B. Overnight health

| finding | verdict |
|---|---|
| Circuit breakers open: 1 — `us-court-search`, open since 2026-08-17 | **Known, not a defect.** Its CourtListener key expired; the capability is `is_active = false`. DQ-14 item 1, founder-gated. |
| CI on `main` | Green through `82c59e0`. |
| Deployed commit vs `main` tip | Equal at session start (`82c59e0`), and again after today's merge. |
| `quality_floor_events` table | Does not exist — my query was wrong, not the platform. No floor action inferred from it. |
| `youtube-summarize`: `is_active = false` **but** `x402_enabled = true` | **Checked and cleared.** Looked like a repeat of F1 incident 7 (advertised but unservable). Production says no: absent from `/x402/catalog` (271 capabilities, 82 solutions), absent from `/v1/capabilities`, and a live call returns a correct 404. The flag is stale DB state with no serving consequence. The second-source rule is the only reason this is not in the brief as an incident. |

---

## B2 / B2b / B3 — stale work

**Open PRs at start: 1. At end: 0.**

- **#387** (governance rebaseline, docs-only, both gates green) — merged. It
  carried a real finding: a WP8 acceptance commit with production evidence had
  never reached `main`, so for three days the programme record showed a package
  in an undefined state when it had been accepted.
- **#388** (this session's work) — opened, three gates green, merged as
  `171c2bf`, deploy verified by served artifact.

**Branches: 20 → 17**, verified against `git ls-remote`, not the local ref cache
(F7's rule: a deletion written down is not a deletion executed).

| deleted | commit id | why |
|---|---|---|
| `rescue/wip-2026-07-16-feat-phase-7a-it-stakeholders-ca1ab4e` | `ca1ab4e47b5cb4576ccf6a03960420314bd4e303` | 40 days old, no PR; janitor snapshot of one superseded handoff doc |
| `rescue/wip-2026-07-16-docs-phase-7b-enumeration-edc1d46` | `edc1d4686784de7e49e1a1d6c09664702d2dc683` | 40 days old, no PR; May-2026 audit outputs and handoffs, all superseded |
| `docs/remediation-rebaseline` | `bab183c0964de18607939ab9f507aec1897965bc` | merged as #387; the remote ref survived because the local delete failed on a worktree lock |

All three restorable from the ids above.

**Checked and cleared while triaging:** `feat/phase-7a-it-stakeholders` carries
a commit titled *"fix(pii): scrub real personal data the manifest fix left
behind"* that is not on `main`, which reads as unscrubbed personal data sitting
on the main line. It is not: none of the three files that commit touches exists
on `main` at all — the Italian stakeholders feature never landed. No exposure.
The branch is genuine unfinished feature work, 11 days idle, **no owner and no
PR** — see "for the next session".

**Two incident records existed only on one machine's disk.** The two
2026-08-22 handoffs, including
`2026-08-22-PROCESS-VIOLATION-unapproved-prod-mutation.md` — the contemporaneous
account of F10 incident 1 — were untracked in the primary checkout for three
days. Committed unchanged. Losing that directory would have left only the
summaries written afterwards by the actor.

### A hollow gate — new LESSONS F5 incident (count 6 → 7)

`session-close-check.ts --hygiene-only` returned **0 red, 1 yellow** when run
from the check-in worktree. Run from the primary checkout the same morning it
returned **4 warnings**, and the three it added are precisely the ones the check
exists to raise: the checkout parked on `remediation/wp9-artifacts` 29 commits
behind main, no upstream on that branch, and the two uncommitted incident
records above.

Cause, one line: `REPO_ROOT = resolve(import.meta.dirname, "../../..")` — it
audits whichever checkout it is installed in. DAILY-RUN.md B2b claimed it
"reports which branch the primary checkout sits on"; that was false, and B2b's
own caution about not switching branches in the main tree is what pushes a
session into a worktree in the first place.

Why this one is sharper than F5's first six: the input set was neither empty nor
absent. It was a complete, valid repository that was simply not the one anyone
wanted checked — so the fail-on-empty helper proposed as the family's repair
**would not have caught it**. The invariant has to be "examined the artefact it
claims to guard", not "examined something". Recorded against LESSONS step 3, and
DAILY-RUN.md B2b corrected with the measured evidence.

---

## C. Decision queue

- **DQ-14** (four founder-only items) — unchanged, none blocking.
- **DQ-18** — both items settled; item 2's execution advanced substantially
  today (below). Not re-presented to Petter under any status.
- Added **DQ-24** (copy correction executed) and **DQ-25** (branch sweep and
  incident-record rescue), both `decided`.

---

## D. Highest-leverage work — the copy correction

**The approved correction was half-done, and the unfinished half was the more
public one.**

DQ-18 item 2: Petter approved removing unsupported tamper-evidence and
downstream-regulatory-verification claims, with **no replacement claim**. The
operative surface list is `docs/remediation/PUBLIC-COPY-CORRECTION.md`, twice
independently reviewed, and it was stranded on a branch — DQ-18 had to *name* it
rather than link it.

**Verified before acting, both directions:**

- Frontend (§1, §2): **done.** The live 345KB bundle at `strale.dev` carries
  zero occurrences of `tamper`, `hash chain`, `immutab`, `cryptographically` or
  `verifiable`; `public/llms.txt` clean. *(Grepping the SPA shell alone proves
  nothing — it is 4,811 bytes. The bundle is the artefact.)*
- API, MCP, repo (§3, §4, §5): **not done**, all still live.

What was serving, and what production says about each:

| surface | claim | the measurement that contradicts it |
|---|---|---|
| `/llms.txt` | audit record retrievable "for downstream regulatory verification" | asserts fitness for a regulatory purpose, not a mechanism — the plan puts it first |
| `/llms.txt`, `/openapi.json`, `/.well-known/agent-card.json`, `/.well-known/mcp.json` | "an audit record **with cryptographic chain hashing**" | one parent hash has 150,796 children over 2026-05-04 → 2026-08-21 |
| `/openapi.json` verify endpoint | walks the chain "**backward to genesis**" | depth-capped at 20, hard cap 50; always returns `reaches_genesis: false` |
| `/v1/web3-assurance/methodology` | per-day chaining · "**Indefinite**" retention · **replay capability** | the fork above; content is redacted at 90 days, which also makes replay impossible |
| two published DPIAs | "audit chain integrity, **replay capability**" as delivered DEC-20260428-B controls | same redaction — a DPIA is the one document type whose purpose is an accurate statement of controls |

**Applied**: §3, §4 (`tools.ts`, which serves live via `/mcp`) and §5, exactly as
the reviewed diffs specify. Pure subtraction; no replacement claim.

**Verified live on `171c2bf`, by served artifact rather than by log line**
(DEC-20260504-C): `/llms.txt`, `/.well-known/agent-card.json`,
`/.well-known/mcp.json`, `/openapi.json` and `/v1/web3-assurance/methodology`
all return **0** matches for the withdrawn vocabulary. `/llms.txt` line 81 now
reads "produces an audit record retrievable at /v1/audit/{transactionId}"; the
methodology endpoint's policy object has lost `replay_capability` and states the
3-year/90-day retention; and a live `tools/call` to `/mcp` returns "Every call
returns an audit record" and "a content hash" — proving the deploy fixed the MCP
text through the `strale-mcp/tools` import, without any publish.

**Deliberately not done:**

- **The npm publish of `strale-mcp`.** One-way public act, founder-gated. The
  deploy already fixed the live text; only the package version trails. §9 step 4
  of the plan, and it is not mine.
- **Any replacement claim.** §7: a claim returns only when `/v1/verify` can
  detect what it asserts, and it cannot.
- **`/v1/verify` still returning `verified: true`** for records whose ordering
  and completeness cannot be evidenced — including records where 20 of 21 links
  are redacted. That is the largest remaining overstatement, it is an API
  correction rather than a copy one, and §8 assigns it to WP14. Untouched.
- **`docs/remediation/DECISION-BRIEFS.md` not landed on `main`.** It is headed
  *"Both need your call"* and asks for two decisions Petter has since made.
  Landing it would put two settled matters back into the record as open —
  F10 incident 4 exactly. Its substance survives in DQ-18 with both corrections
  attached. Stays on `remediation/wp9-artifacts` at `258a877`, restorable.

### The guard, and the fail-before

`apps/api/src/lib/withdrawn-integrity-claims.test.ts` — 21 assertions over ten
public-prose surfaces. It exists rather than a note because LESSONS F6's open
question is literally *"which public claims have no automated tie to the fact
they assert"*.

Two limits, stated in the file rather than glossed: it asserts **absence only**
(approving replacement wording would claim an authority this side does not
have), and it knows only phrasings we have actually published. It also asserts
each surface exists and is non-empty **before** scanning, so it cannot pass by
reading nothing.

Fail-before run through `scripts/mutation-test.mjs` — **not** by hand, because
F11 is at six incidents, four of which destroyed uncommitted work with
`git checkout --`, and its finding is that the guard already existed and nobody
reached for it:

```
apps/api/src/routes/llms-txt.ts    restore the regulatory-verification claim → MUTATION CAUGHT
docs/dpia/adverse-media-check.md   restore the replay-capability control     → MUTATION CAUGHT
```

Both green → red → green, clean tree, verified-green baseline on both sides.

### One self-correction, left on the record

A commit message claimed DAILY-RUN.md was corrected when the edit had died on a
Windows path escape and only the other three files were staged. The follow-up
commit applies the correction and says so plainly rather than amending it away —
a commit message asserting a change it did not make is the same shape as the
state-drift family it was documenting.

---

## E. Authorities updated

- **GOALS.md** — the card-paying customer and what it contradicts; the 08-22
  scare resolved with the per-day series; the partial-week concentration
  explicitly recorded as not-a-comparison.
- **LESSONS.md** — F5 → 7 with the wrong-repository incident and why the
  proposed repair would have missed it; F6 gains its first automated tie, with
  limits.
- **DAILY-RUN.md** — B2b's false claim corrected.
- **DECISION-QUEUE.md** — DQ-24, DQ-25.
- **`ceo-brief-lint.ts`** — its settled-matter explanation said the correction
  plan "lives on the remediation branch, not yet on main". True when written,
  false once the plan landed. Now names the file and its applied state; 72 lint
  tests pass.

---

## For the next session

1. **Watch for a second top-up from the new customer.** One repeat purchase
   turns two days into a customer. Nothing else measurable this week matters as
   much, and it needs no action — only checking.
2. **Read concentration properly once this week closes.** That will be the first
   honest week-on-week concentration figure the platform has ever had, because
   both weeks will sit entirely after 2026-08-15.
3. **`feat/phase-7a-it-stakeholders` has no owner.** Real unfinished feature
   work, 11 days idle, no PR, no PII risk (verified). Either revive it into a PR
   and own it to completion, or close it — B3 does not permit a third morning of
   "still there".
4. **F1's step 4 is still owed** and is still the largest quality problem:
   `internal` must stop being the taxonomy's fallback. Measured at 82%
   lower-bound misattribution. The stated blocker on 08-23 was the remediation
   programme's concurrent edits to `execution-outcome.ts`; every open PR is now
   merged, so that reason has expired.
5. **F5's step 3 hypothesis needs rewriting** after today's incident 7. "A gate
   that asserted a non-empty input set would have caught incidents 1, 4 and 5"
   is still worth testing, but it demonstrably does not cover 7.
