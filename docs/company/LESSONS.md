# System mistakes and operating lessons

**Status: ACTIVE from 2026-08-22 (DEC-20260822-A).** The ledger of how this
operation gets things wrong, grouped by *family* rather than by incident, plus
the rule that converts a third repetition into a root-cause investigation
instead of a third patch.

Why families and not a bug list: the repo already records every individual
incident faithfully, in GOALS.md, DECISION-QUEUE.md and the session handoffs.
What it did not record was that several of them were *the same mistake*. On
2026-08-21 a handoff put it plainly — "DQ-12, E3 and this are the same bug three
times" — and the response was still a fourth local fix. Naming the family is
what makes the fourth fix visibly the wrong move.

Read by: [DAILY-RUN.md](DAILY-RUN.md) step E. Governed by:
[CHARTER.md](CHARTER.md).

---

## The three-strike rule

> **When a third materially similar incident occurs in one family, it stops
> being a bug and becomes a root-cause investigation. The third incident's local
> fix does not ship on its own.**

"Materially similar" means the incidents share a mechanism or an authority, not
a symptom. Three capabilities failing for three unrelated upstream reasons is
not a family. Three capabilities being *blamed* by the same instrument is.

The rule is deliberately mechanical, because the judgement it replaces has
already failed: at each of the first three false-quarantine incidents there was
a locally correct explanation for why *this one* was a one-off.

### The root-cause workflow

Once a family trips the threshold, the investigation runs all seven steps. A
partial run is recorded as partial and does not close the family.

1. **Identify the common authority or instrument.** Which single thing decided,
   measured, or asserted in every incident? If the answer is "several unrelated
   things", the family was mis-drawn — redraw it before continuing.
2. **Measure the full affected population.** Not the reported instances: every
   row, capability, claim or surface the mechanism touches. The reported
   instances are the ones that happened to be noticed, which is a biased sample
   by construction.
3. **Formulate the root-cause hypothesis, and state what would falsify it.**
   Then try to falsify it. A hypothesis with no stated falsifier is a story.
4. **Repair the shared mechanism**, not another local symptom. If the repair is
   genuinely too large for one session, ship a *bounded* interim that makes the
   family's damage visible rather than silent, and record why.
5. **Add discriminating protection** — a regression test or an invariant that
   fails against the un-repaired mechanism. The general form is usually an
   invariant ("no evidence cannot be scored as evidence of a defect"), not a
   case ("this capability is not broken").
6. **Replay the historical incidents against the new logic** where the data
   still exists. Each should now come out differently, and the ones that do not
   are either mis-assigned to the family or evidence the repair is incomplete.
7. **Verify in production after deployment**, by effect and not by log line.

---

## The families

Each entry: what goes wrong, the count, and the state. An incident is added to a
family by whichever session finds it — adding to the ledger is acts-alone work
and never needs asking.

### F1 · False quality attribution — **ROOT-CAUSE INVESTIGATION OPEN**

> An instrument scores something as a capability defect when the evidence does
> not say that: correct refusals, environmental failures, the caller's own
> input, our own harness's bookkeeping.

**Count: 7. Threshold passed long ago.** This family is the reason the rule
exists, and it is open as of 2026-08-22 rather than waiting for an eighth.

| # | date | incident | local fix |
|---|---|---|---|
| 1 | 2026-08-12 | Quality floor delisted `us-company-data` at "64% on 11 calls" — 7 successes, 1 genuine upstream error, 3 caller-input failures | E3, taxonomy widened |
| 2 | 2026-08-16 | Harness reported 100% for a week on three capabilities the floor delisted at 39–59% on real traffic | recorded in GOALS.md |
| 3 | 2026-08-17 | Ten capabilities emitted "correctness 0%" ~400×/day while answering correctly on production — a test-budget guard, an expired token and upstream 5xx counted as broken logic | environmental failures left the denominator |
| 4 | 2026-08-19 | The fixture-staleness guard's own message says "not evidence about the capability"; three consumers scored it as exactly that, and a docstring claimed a wiring that did not exist | classification corrected |
| 5 | 2026-08-21 | Two boot-time migration blocks fought over one flag, poisoning 12 fixture baselines per deploy; the whole of one capability's 51% score was that | blocks partitioned; metadata writes no longer stamp the edit field |
| 6 | 2026-08-22 | Free-tier front door quarantined on 15 calls, of which zero were defects (one correct "no text on this page", two caller-site errors, two caller-site rate limits) | refusal reclassified; capability re-listed |
| 7 | 2026-08-22 | Same incident, second mechanism: the floor *measures* paid traffic only but its *remedy* withdraws the free surface too, so a free front door is judged on traffic that is invisible to the decision | **unfixed** |

**The common authority is not the quality floor.** It is the *failure taxonomy*
— `classifyTransactionFailure` and the correctness invariants that read it —
plus the unstated premise that a failed call is our fault until proven
otherwise. Six of the seven incidents are that premise applied to evidence that
never said "defect": a refusal, an environment, a caller, or our own
bookkeeping. The seventh is the same premise expressed as a remedy that acts on
a population it did not measure.

**Why the local fixes did not hold.** Each widened the taxonomy by one string
or one case. The taxonomy's default stayed "ours", so every new error string
starts life misclassified and stays that way until it costs something visible.
That is a default-direction problem, not a coverage problem, and no number of
string additions reaches it.

**State: investigation open, owner Claude, opened 2026-08-22.** Steps 1 and 2 are
under way; the population to measure is every distinct error string that has
ever reached the classifier, not the ones that produced a complaint. The
falsifiable hypothesis: *if the taxonomy's default were "unclassified, excluded
from the denominator" rather than "ours", every one of incidents 1, 3, 4, 5 and
6 would have produced no quality action at all.* Step 6's replay is available —
the historical error strings are still in the transaction rows within the
90-day retention window.

### F2 · Wrong denominator / mislabelled window

> A correctly-executed query answering a subtly different question: a 30-day
> total labelled weekly, a one-day-old instrument read as a 30-day fact, funnel
> steps compared over different periods, a population defined by hand.

**Count: 7.** 2026-08-15 produced five in one afternoon; a sixth on 2026-08-21
(a hand-rolled filter that inner-joined `users` and therefore silently measured
~nothing, because nearly all revenue arrives with no user attached); a seventh
on 2026-08-22 — a largest-buyer share compared across two windows of different
instrument coverage, reported as "99.3%, up from 94.7%" and reproducible as
"99.3%, up from 19.0%" once the windows were made discrete. The prior figure was
one payer divided by a week in which payer identity had existed for two days.
The movement was entirely coverage.

**Root cause found and repaired**: `apps/api/src/lib/metrics` — measurements
carry their window, population and instrument age, and an unanswerable one has
no number to render. The seventh incident is worth its own line because of
*where* it happened: inside the module built to prevent this family, on its
first production run, written by a session that had read this file. A contract
that guards the value does not automatically guard a *comparison between two
values*, and nothing had said so. `Concentration.comparable` now carries that
judgement with the number, on the same principle as the rest of the contract.

**State: closed, with two standing rules** — any business number computed
outside that module is a new instance of this family, whoever computes it and
however careful they were; and any *comparison* of two measurements must check
that both windows are answerable on the same basis, not merely that each value
was individually available.

### F3 · Incorrect billing or economic judgement

> Money reasoning that is arithmetically fine and economically wrong: costs
> attributed to the wrong party, spend estimated from the wrong base, revenue
> credited to a rail that did not earn it.

**Count: 1 confirmed** (external spend reported from declared test costs rather
than invoices — disclosed as an estimate, which is the correct handling and the
reason it has not recurred). **State: monitored.** Below threshold. The reason
it is tracked at all is that the ledger is small enough today that an error of
this class would not be noticed by its size.

### F4 · Misleading metric

> A number that is correct and reads as something else. Distinct from F2: the
> measurement is right, the *inference* the reader will draw is wrong.

**Count: 3.** The x402 refusal table reading as 1,317 units of unmet demand when
it is one machine walking the catalogue; the quality floor's "daily" tick that
is in practice deploy-driven; visit-days presented in a way that reads as
visitors. **State: monitored, at threshold.** The repair pattern that works is
to make the misreading impossible in the value itself — the visit-day caveat is
a shared constant precisely so it cannot be softened — rather than to add a
footnote. If a fourth lands, open the investigation.

### F5 · Hollow or non-discriminating test

> A test, gate or check that passes whether or not the thing it guards is
> working.

**Count: 4.** Integration suites skipped for months because a required variable
was set in no workflow; a budget regression test that exercised the ORM rather
than the fix and passed either way; two gates that could not fail (a script
directory outside the typecheck glob, a row count read from the wrong property).
**State: monitored, at threshold.** Standing rule already in force: a test must
be verified failing against the un-fixed state, in both directions. What is not
yet systematic is proving a *gate* runs at all — three gates in one week were
green while doing nothing. A fifth incident opens the investigation, and its
step 1 answer is probably "we verify assertions, never reachability".

### F6 · Stale or unsupported public claim

> Something we tell the world that is no longer true, or was never quite true.

**Count: 4.** A methodology page naming a vendor we had left three days earlier;
listing copy selling compliance to a customer base buying growth tooling;
hardcoded capability lists advertising services we had withdrawn — and, still
open, "tamper-evident" on six pages, which holds for alteration of one record
and not for ordering or deletion across a 3.5-month window.
**State: monitored, at threshold.** Two of the four were caught by drift guards;
the other two were caught by a human reading the page. A fourth guard is cheaper
than a fifth incident: the investigation to open is "which public claims have no
automated tie to the fact they assert".

### F7 · State drift

> The recorded state and the real state disagree: a decision written down but
> never executed, a branch recorded as deleted that still exists, a document
> whose evidence went stale months ago.

**Count: 4.** A capability recorded as switched off that served errors for two
more days; three branches recorded as deleted that were still on the remote;
GOALS.md carrying three claims that re-measurement contradicted; a docstring
asserting a wiring that had never existed. **State: monitored, at threshold.**
The pattern in all four: the record was written by the actor who *intended* the
change, immediately after intending it. The repair direction is to verify
against the system rather than the intention — the daily run already does this
for branches and deploys, and the same discipline is owed to decisions and docs.

### F8 · Duplicated authority

> The same rule stated in two places, which then diverge.

**Count: 3.** The charter's escalation contract, which an earlier draft claimed
to extend while contradicting; two boot-time migration blocks deriving one
column from different sources and overwriting each other every deploy; the daily
run procedure, which until today existed only outside the repo while three
in-repo documents described parts of it. **State: monitored, at threshold.**
Standing rule: one authority per rule, and everything else points at it. This
file, DAILY-RUN.md and CHARTER.md are each written to be pointed at rather than
copied.

### F9 · Incorrect founder escalation

> Asking Petter something that further investigation, an existing policy, or a
> technical judgement already answers — or handing him a question at all rather
> than a decision.

**Count: 3 known.** Repeatedly deferring merge and deploy decisions to him until
he asked, in his own words, to have them moved away structurally; sending him to
register for a vendor token when the real finding was that the build was not
worth doing; presenting a technical choice as if it needed his arbitration.
**State: monitored, at threshold, and now guarded** — CHARTER.md's
investigate-before-escalating test and the five required fields on every
escalation are the repair. The measurement to watch is the count of items
reaching him per week, and how many of them he could have answered without
asking a question back.

---

## How this file is maintained

- Any session may add an incident to a family. No approval, no ceremony — one
  row, dated, with the local fix.
- A session that adds the incident which trips a threshold **opens the
  investigation in the same session**, at minimum through step 2 (measure the
  population). It does not hand the trigger to the next session.
- A family closes only when its root cause is repaired *and* a discriminating
  guard exists *and* the historical incidents replay differently. Closing on the
  first two is how F1 reached seven.
- The daily run reads this file at step E, and the CEO brief reports a family
  crossing its threshold as a business fact — recurring problems are a
  reliability story, not an engineering one.
