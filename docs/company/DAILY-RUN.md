# The daily run — what it does, and what it produces

**Status: ACTIVE from 2026-08-22 (DEC-20260822-A).** This file is the authority
on how a daily operating session runs and what it hands back. The scheduled task
`strale-checkin-morning` is a *pointer* to this file, never a copy — before
today the procedure existed only in that task's SKILL.md, outside the repo,
where it could not be reviewed, tested, or corrected by a session that had not
been told to look at it. Duplicated authority is one of the failure families in
[LESSONS.md](LESSONS.md), and this file exists partly to stop being an instance
of it.

Authority above this file: [CHARTER.md](CHARTER.md). Ranking: [GOALS.md](GOALS.md).

---

## The one structural rule

**Two artifacts per run, in this order, and the second is never a summary of the
first's activity.**

| | internal operating record | CEO morning brief |
|---|---|---|
| written to | `handoff/_general/from-code/YYYY-MM-DD-<topic>.md` | `docs/company/briefs/YYYY-MM-DD.md` |
| audience | the next session, and an independent reviewer | Petter, and nobody else |
| contains | everything — evidence, measurements, query shapes, commit ids, file paths, failed attempts, unresolved technical work | business meaning only |
| written | during the work | **only after the operating work is finished** |
| length | as long as the evidence needs | ~300–600 words unless there is genuinely more |

The operating record is not a draft of the brief. They answer different
questions. The record answers *"what is true, and how do I know"*; the brief
answers *"what does this mean for the business, and what, if anything, is mine
to decide"*. A brief produced by shortening the record will fail the editorial
gate below, because shortening preserves the engineering frame.

Petter reads the brief. He does not read the record, and it is not written for
him to have to.

---

## Part 1 — the operating work

Steps A–E are the operating session. Everything here belongs to the internal
record; none of it belongs in the brief except through its business consequence.

**A. Measure the business.** Regenerate the CEO dashboard
(`cd apps/api && npx tsx scripts/ceo-dashboard.ts`, production read-only), and
run the commercial pack (`npx tsx scripts/commercial-brief.ts`). The commercial
pack is not optional and is not a nice-to-have — the commercial-intelligence
list below is the minimum the run must be able to answer.

**B. Overnight health.** Open breakers, newly quarantined capabilities, failing
CI on main, invariant alerts. For each: is it a defect, a correct refusal, or an
instrument fault? Answering that question is the run's job, not the brief's.

**B2. Stale-work sweep.** Every open PR, every branch ahead of main, every
uncommitted tracked change. Dispose of each *now*: merge if gates pass and it is
not `approval_required`-gated, finish it if close, close it if dead, otherwise
write owner and deadline into the record. Confirm the deployed commit equals
main's tip (`GET /health` against `git log origin/main -1`). "Still open" is not
an allowed end state — merging and deploying are execution, never questions for
Petter.

**B2b. Local repo hygiene.**
`cd apps/api && npx tsx scripts/session-close-check.ts --hygiene-only`. No DB, no
credentials. Deliberately not session-scoped: it reports which branch the primary
checkout sits on and how far behind main, handoffs never committed at any age,
and branches untouched 14+ days. Act on each finding the same morning.
*Caution:* if the checkout is off main, do **not** `git checkout` there casually —
that has corrupted the tree three times. Confirm the branch's content is already
on main by comparing **file contents**, never commit counts (squash merges make a
merged branch look permanently "ahead"), then switch only when nothing else is
running and verify with `node scripts/guard-tree-integrity.mjs`.

**B3. Branch graveyard.** Triage the 10 oldest unmerged remote branches. Delete
what is substantively on main or >1 month old with no open PR and no unique
value — recording the branch name and commit id in the record first, so every
deletion is restorable. Revive real unfinished work into a PR you then own to
completion. Verify the sweep against the remote branch list, not the local ref
cache: a deletion written down is not a deletion executed.

**C. Decision queue.** Process [DECISION-QUEUE.md](DECISION-QUEUE.md).
`preauthorized_notice` items whose window has matured execute on their stated
default. `approval_required` items hold indefinitely — check whether the work
stream around each can advance regardless, and route around it if it can.

**D. Do the highest-leverage work** against the active milestone in GOALS.md.
Prefer finishing one thing to starting three. Agents that edit files must run
with `isolation: "worktree"`.

**E. Update the authorities** whose evidence changed: GOALS.md's "what we
currently know", DECISION-QUEUE.md, and [LESSONS.md](LESSONS.md) if an incident
this run belongs to a tracked failure family.

### Non-negotiables during the operating work

- Never write to the production database. Read-only `SELECT` is fine; migration
  statements are plan-only-checked before merge, never executed by hand.
- Never switch branches in the main checkout. Use a separate worktree, and
  remove worktrees through git, never by deleting the directory.
- Never stash in any worktree of this clone — the stash ref is repo-wide.
- Every revenue/usage measurement goes through `apps/api/src/lib/metrics`.
  Never hand-rolled queries: ~98% of traffic is our own harness, and a
  hand-rolled population has produced wrong strategic conclusions three times.
- **Second-source rule.** Before any finding reaches either artifact, check it a
  second, different way — a different window or population for a number; an
  enumerated search space for an absence; the deployed commit rather than the
  local working tree for a claim about production. A finding that cannot be
  second-sourced is written as `unverified:` and is not acted on.
- Tests must discriminate: they must fail against the un-fixed state.

---

## Part 2 — commercial intelligence

**Total revenue and call count are not a business read.** The run must compute
and *interpret* the following, wherever the data permits.
`apps/api/src/lib/metrics/commercial.ts` computes all of them, and
`scripts/commercial-brief.ts` prints them with their conclusions:

1. current discrete week's revenue, and the comparable prior discrete weeks;
2. growth between them, stated as a direction with a reason, not a percentage;
3. unique paying identities;
4. the largest payer's share of revenue;
5. largest payer's revenue against everyone else's combined;
6. new payers vs returning payers this week;
7. repeat usage — how many payers bought on more than one day;
8. active paying days in the week;
9. how much of the growth came from existing payers vs from new ones;
10. which capabilities or bundles were the *first* purchase of a new payer;
11. whether any payer other than the largest is developing a recurring pattern;
12. payers that were active before and have gone quiet.

Where an instrument is too young to answer one of these, the metric returns
`unavailable` and the brief says so in words. It never fills the gap with a
number.

**The output is a conclusion, not a table.** "Revenue rose for the fourth week
running and every euro of the rise came from the same buyer" is a business read.
"€56.89, +45%" is not. The brief carries the former; the record may carry both.

---

## Part 3 — the CEO morning brief

Written **only after the operating work is complete**, into
`docs/company/briefs/YYYY-MM-DD.md`. Roughly 300–600 words unless there is
genuinely more material.

### Rules

- Normal non-technical English. A reader who has never opened the codebase
  understands every sentence.
- Lead with business meaning, not implementation.
- **No** filenames, commit ids, queries, database column or table names,
  migration or block numbers, branch names, pull-request numbers, test counts,
  package names, or jargon — unless one is genuinely indispensable to a decision
  Petter has to make, in which case it appears once, in plain words around it.
- Never merely enumerate what the engineering agent did. If a paragraph would
  survive unchanged in a status report to another engineer, it is the wrong
  paragraph.
- Numbers appear when they carry the meaning, and are always accompanied by what
  they imply.

### Structure (all five headings, in this order)

**1. Business performance.** Revenue trajectory, meaningful customers,
concentration, repeat usage — and the single most important commercial
conclusion, stated as a sentence.

**2. What materially changed.** Only changes relevant to customers, revenue,
product, risk or strategy. If nothing did, say so in one line.

**3. Fixed automatically.** Important problems the system diagnosed, repaired
and verified without Petter. Written as what would have happened otherwise, not
as what the fix was.

**4. Working on now.** At most three outcome-level priorities. Outcomes, not
tasks: "find a second paying customer", not "attribute the enumerator".

**5. Needs your decision.** Only genuine founder decisions, per CHARTER.md's
short list. Prefer **"Nothing needs your decision today."** — and mean it. Each
entry that does appear carries the five fields the charter requires: the actual
choice, the facts already established, the options, my recommendation, and the
concrete consequence of each option.

### The editorial gate — run before presenting, rewrite if any answer is wrong

1. Could a non-technical CEO understand every paragraph?
2. Does every paragraph answer "so what?"
3. Is anything in here only because engineering spent time on it?
4. Did I surface a problem without either acting on it or explaining why it is
   his decision?
5. Did I escalate anything further investigation could have resolved?
6. Have I identified recurring patterns rather than reporting isolated incidents?
7. Is "Needs your decision" genuinely limited to founder decisions?

Then run the machine check, which enforces the mechanical half of the above:

```
cd apps/api && npx tsx scripts/check-ceo-brief.ts
```

It fails the run on: a missing or reordered section, technical tokens in the
prose, an over-long brief, an activity-log opening, or a "Needs your decision"
entry missing any of its five required fields. It runs in CI over every brief in
`docs/company/briefs/`, so a later session cannot quietly regress the format.
The machine check is a floor, not the standard — question 3 above is the one
that actually matters and no script can ask it.

---

## What the run reports at the end

Into the internal record: headline numbers, what was done, what was decided,
what is queued for Petter, and what the next session should pick up — at
proactivity level 5 (solved, contingency stated, next step proposed).

Into the brief: the five sections above, and nothing else.
