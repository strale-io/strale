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

**Count: 6 occasions, 7 mechanisms. Threshold passed long ago.** This family is
the reason the rule exists, and it is open as of 2026-08-22 rather than waiting
for another. Rows 6 and 7 are the same morning's incident by two different
routes, counted separately because the mechanisms are separate and only one of
them is fixed — six of these have had a repair, and the seventh has not.

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

**State: investigation open, owner Claude, opened 2026-08-22. Steps 1 and 2
DONE 2026-08-23; step 3 partly done; step 4 DONE 2026-08-25; 5–7 owed.**

**Step 2 — the full population, measured.** `apps/api/scripts/f1-failure-attribution.ts`
runs it and is read-only, so a later session can re-run it against the repaired
taxonomy and watch the numbers move — which is step 6's replay, made cheap on
purpose. Every distinct error string a failed transaction has carried in the
90-day retention window, classified: **541 strings, 280,945 calls.** 154 strings
and **47,582 calls land in `internal`** — the only class the floor counts
against a capability.

Applying rules that claim a string only on positive evidence it is *not* a
statement about our code, and leaving anything unclaimed in "possibly ours":

| share of the `internal` bucket | what it actually is |
|---|---|
| 29.2% (13,879 calls, 3 strings) | a bare runtime transport error — `fetch failed`, across 26 capabilities, still arriving today |
| 23.1% (10,982) | caller input: a required field absent or malformed |
| 15.4% (7,319) | a named third-party service returning an error |
| 9.3% (4,421) | caller input: an identifier or country we do not cover |
| 5.1% (2,438) | **our own guards refusing correctly** — the paid-API budget guard, the redirect limiter, the reserved-IP-range refusal, documented coverage limits |
| 18.0% (8,543) | unclaimed by any rule |

**82.0% is therefore a lower bound on misattribution**, not an estimate.
Second-sourced on the external paid population — the only traffic the floor
acts on, and a different cut of the table: 446 failed calls, 92 `internal`, the
same conservative rules claim 25%, and most of the remainder is a vendor API
quoting the *caller's* bad URL back at us.

**Step 3 — the hypothesis survives its first falsification attempt.** The
hypothesis is *if the default were "unclassified, excluded from the
denominator" rather than "ours", incidents 1, 3, 4, 5 and 6 would have produced
no quality action at all.* The obvious falsifier was economic: `CALLER_ATTRIBUTABLE`
is read by `execution-outcome.ts` as well as by the floor, so widening it might
change what customers are charged. Checked, and it does not — both branches of
`classifyExecutionOutcome` already set `billable: false`. The repair is not
blocked by billing.

**Step 4 was deliberately NOT a seventh string patch — DONE 2026-08-25.**
`fetch failed` alone is 29% of the bucket and one line would have removed it.
That is exactly the move this file forbids: six local widenings is how the
family reached seven. The shared repair shipped instead: `internal` is now
reachable only by positive match, and the fallback is a new `unclassified`
class that leaves the denominator *and* surfaces as an evidence shortfall, so
the floor reports "I could not attribute this" rather than "the capability is
broken". `foldTrafficRows` counts unattributed failures separately from
caller-attributable ones, and `evaluateFloor` carries the count on every
decision and in its reason string.

**What nearly went wrong, and is the transferable part.** Inverting a default
is only safe if the class losing its default has real positive evidence to
stand on. `INTERNAL_RE` was four parse-failure phrasings, so with the fallback
gone, every runtime crash — a `TypeError`, a null dereference — would have
become `unclassified` and the floor would have stopped seeing genuine defects.
That is this same family pointed the other way: a false accusation traded for
a blindness. It was caught by an existing test asserting a `TypeError` is
`internal`, not by design. `INTERNAL_RE` therefore also gained V8 error names
and V8 message text, plus the house `failed to extract` phrasing, each pinned
by a test that the widening steals nothing from `timeout`, `upstream`,
`config` or `caller_input`. **Generalisation: when a fallback is removed, the
question is not "is the new default safer" but "what did the old default carry
that nothing else now does".**

One test regressed silently in the same way and was repaired rather than
relaxed: `invocation-facts` pinned that a refusal whose wording the taxonomy
does not recognise is saved by the *structural* branch, not by the string.
Once the fallback became `unclassified`, `counts_against_capability` was false
either way, so the assertion would have passed with the branch deleted — the
exact failure its own comment warned about. Moved to `failure_class`, which
only the structural branch can set.

**Reported, not suppressed.** A large unattributed count does NOT defer the
floor's action. Whether it should is a real question and it is step 6's replay
to answer; arming a new suppression rule on an unmeasured threshold is how
this family started.

**Follow-ups this opened, both small and both recorded where they belong:**

1. `translate` throws `"Translation failed."` — two words naming no cause, no
   actor, quoting nothing. It IS our defect and the taxonomy cannot tell, so
   it now reads `unclassified`. The repair belongs in the message, not in a
   per-capability entry in `INTERNAL_RE`. The new default is what made this
   visible; previously the fallback absorbed it silently. Expect more of these
   as step 6 replays the census — that is the mechanism working.
2. A taxonomy-`internal` failure still maps to `provider_rejected` /
   `fault: "provider"` in `execution-outcome.ts`, which is the wrong actor for
   our own crash. `counts_against_capability` is unaffected, so it mislabels a
   report rather than a decision. Untouched here on purpose.

**Step 6's replay is now cheap and is the next measurement.**
`scripts/f1-failure-attribution.ts` is read-only and unchanged, so re-running
it against the repaired taxonomy reads the `unclassified` bucket back
directly: every recurring shape in it that is genuinely ours earns a rule in
`INTERNAL_RE` with its observed call count attached, and the bucket's size
over time is the honest measure of whether the taxonomy is catching up.

### F2 · Wrong denominator / mislabelled window

> A correctly-executed query answering a subtly different question: a 30-day
> total labelled weekly, a one-day-old instrument read as a 30-day fact, funnel
> steps compared over different periods, a population defined by hand.

**Count: 9.** 2026-08-15 produced five in one afternoon; a sixth on 2026-08-21
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

**State: REPAIRED BUT NOT CLOSED.** An earlier draft of this file wrote
"closed", which this file's own criterion forbids: a family closes only when the
root cause is repaired *and* a discriminating guard exists *and* the historical
incidents replay differently. The first two hold; **no replay has been run**,
and the seventh incident happened inside the module built to close it. Calling
that closed is how F1 reached seven. The replay is owed: re-derive the five
2026-08-15 conclusions through `lib/metrics` and confirm each now refuses or
changes.

**Incident 8, 2026-08-28 — a branch-triage measurement that answered a
different question, caught before it decided anything.** The daily run's B3
sweep needs, per branch, "how many of the files this branch changed are still
not on main". The sweep computed it by comparing blob ids from
`git rev-parse origin/main:<path>` against `git rev-parse origin/<branch>:<path>`.
For any path beginning with a dot — `.claude/skills/…`, `.agents/skills/…` —
git resolves `<rev>:<path>` **relative to the current working directory**, not
the repository root, so both lookups failed and the comparison ran on two error
sentinels. It reported a fully-merged branch as carrying two unique files.

Caught because the number contradicted a second measurement taken a different
way (`git diff origin/main <branch>`, which is authoritative and said the trees
were identical), and the contradiction was chased rather than averaged. The
error direction happened to be fail-safe — it makes a merged branch look
unmerged, so it retains rather than deletes — but the sweep it feeds **deletes
branches**, and the same bug pointed the other way (both sentinels equal ⇒
"identical") silently marks a divergent file as merged. Seven deletions were
executed this morning only after re-verifying each with `git diff`, and then
re-confirmed against `git ls-remote` per F7.

Generalisation, and it is the family's own rule applied to a tool rather than a
metric: **a comparison is only as trustworthy as its behaviour on the inputs
that make it fail silently.** `git rev-parse <rev>:<path>` has a
path-interpretation rule that differs from every other path argument in git,
and a comparison built on it needs `./`-prefixing or `git diff` instead.

**Incident 9, 2026-08-31 — the module's own guard was computed, documented, and
never read.** The commercial pack answered every payer question on the *week in
progress*. Run on a Monday for the first time, it reported one payer at a 100%
share off EUR 0.72 and 17 calls, and emitted as its headline conclusion — the
sentence DAILY-RUN.md instructs the brief to carry — "the business currently has
one customer and one point of failure", alongside "nobody bought on more than
one day". The last completed week had 13 payers, a 76.0% top share, and three
non-top buyers returning. **Every one of those readings was the inverse of the
truth**, and the pessimistic direction is why it was caught: it contradicted the
prior morning's record loudly enough to be chased.

The remarkable part is that nothing here was unforeseen. `concentration()` has
computed `partialWindow` since it was written, and its own comment says a
partial window "on a Monday reads as a jump to 100% concentration every single
time". `Concentration.comparable` folds `!partialWindow` in correctly. A test
named "refuses to compare when the window is a week still in progress" passes.
Two things defeated all of it: `interpret()` never read the field, and the
shipped caller never *set* it, so `partialWindow` took its `false` default and
`comparable` came back true on day 1 of 7.

Generalisation, and it is not the same as this family's existing rules: **a
guard that a caller must opt into is not a guard, it is a convention.** Both
prior F2 repairs added a field carrying a judgement alongside a value; both
assumed the consumer would consult it. `comparable` had one consumer doing so
(the prior-share gate) and one ignoring it, in the same file. Where the safe
value is also the default, an optional flag defaults to unsafe — the option
should have been "declare this window complete", not "declare it partial".

*Repaired 2026-08-31.* `interpret()` refuses the whole concentration section on
a partial window rather than one sentence of it, because dependency, acquisition
and repeat all read the same corrupted denominator. And — the half that matters,
per F1 step 4's transferable lesson about what a removed default used to carry —
silence alone would have traded a false statement for a blindness on the single
most important commercial fact we produce, so the payer questions now run on the
last completed week, exactly as `growth()` has always done for revenue. Five
tests, verified failing against the un-repaired code in both directions: four
fail if the guard is removed, and seven fail if the guard is made unconditional.

Two standing rules already in force — any business number computed outside that
module is a new instance of this family, whoever computes it and however careful
they were; and any *comparison* of two measurements must check that both windows
are answerable on the same basis, not merely that each value was individually
available.

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
visitors. **State: INVESTIGATION DUE.** At three, the rule says this is no longer a set
of incidents. The repair pattern that works is
to make the misreading impossible in the value itself — the visit-day caveat is
a shared constant precisely so it cannot be softened — rather than to add a
footnote. If a fourth lands, open the investigation.

### F5 · Hollow or non-discriminating test

> A test, gate or check that passes whether or not the thing it guards is
> working.

**Shared shape with F7 incident 8 — named here once, referenced there.** The
two families stay separate and their mechanisms are different: F5 is a check
that never ran the thing it names, F7 incident 8 is a check that ran against a
consumer whose acceptance did not entail the others'. What they have in common
is the reading, not the mechanism — **the signal's scope was narrower than the
proposition its reader took it for.** In both, a green is produced honestly and
then believed to mean more than it measured.

*The discriminating question, because the shape is not actionable without one:*
**what would have to be true for this green to be false, and did I test that?**
It has a dress per family. For F5: *would this check fail if the thing it claims
to verify were broken?* For F7 incident 8: *which consumers read this setting,
and did the strictest one accept it?* Same question. A reader who agrees with
the paragraph above and does not ask one of these has changed nothing.

**Count: 9 — threshold reached, investigation OPENED 2026-08-22. Incident 8 is incident 7's direct consequence, and incident 9 is the same checkout still being the cause.** Integration
suites skipped for months because a required variable was set in no workflow; a
budget regression test that exercised the ORM rather than the fix and passed
either way; two gates that could not fail (a script directory outside the
typecheck glob, a row count read from the wrong property); and **two of this
change's own, in consecutive attempts to fix the first of them**.
`charter-authorization-binding.test.ts` keyed on `lib/production-access.ts`, a
module that review renamed before it landed, so the guard sat in its "dependency
absent" branch and passed while the thing it guarded had drifted (5). Its repair
then held the type half with a compile-time reference in a file no tsconfig
project typechecks, so deleting the type would have left every gate green (6).

**Step 1 — the common instrument.** Not the individual tests. Every one of these
verifies its *assertions* and none verifies its *reachability*: that it ran, over
a non-empty input set, against the artefact it claims to guard. The entry above
predicted this answer before the fifth incident, which is mild evidence it is
right.

**Step 2 — the affected population, measured.** The `check` job invokes **17**
gate scripts: 12 by direct `node` path, 1 by `npx tsx`, 3 through
`npm run lint:*` wrappers, and `scripts/guard-production-write-access.mjs` from
the repo root.

**The finding, and it is the only claim here worth trusting: none of the 17
fails when its input set is empty-but-present.** Every one treats "found no
violations" and "examined nothing" as the same outcome — exit 0. Four
(`check-framework-packages`, `check-manifest-guaranteed-consistency`,
`check-tier-coverage`, `check-identity-fixture-shape`) do exit 2 when their input
**directory is missing**, which is a partial mitigation worth carrying into step
3: the distinction they already draw is the one the other thirteen need.
`check-ceo-brief.ts` is explicit about it ("no briefs found, nothing to check"),
`check-shape-contracts.mjs` skips entirely when the frontend checkout is absent,
which it always is in this lane, and `guard-production-write-access.mjs` prints
"1 authorised reader" as a string literal rather than as a count it measured.
The rest simply say "clean".

> **A first version of this paragraph published wrong numbers**, and they are
> worth leaving on the record given where they appeared. It claimed a population
> of 13 and that "the remaining 8 print a scanned count". Both came from a
> regex sweep over the scripts rather than from reading them: the population
> omitted the four gates invoked through wrappers, and the count-printing figure
> was closer to 3. A measurement produced by pattern-matching and published in a
> governance document is the same error as the F2 family, made while documenting
> F5. The subset that prints *any* indication of how much it examined is small
> and is not restated here, because the number that matters — fail-on-zero — is
> zero across the whole population, and a second approximate figure adds
> nothing but another thing to be wrong about.

**Incident 7, 2026-08-25 — a gate that examined the wrong repository.**
`scripts/session-close-check.ts --hygiene-only` exists, in its own words, to
catch "exactly how the primary checkout ended up sitting 77 commits behind main
on a fully-superseded branch with five uncommitted changes". Run from a
worktree during the daily run it reported **0 red, 1 yellow** — while the
primary checkout was, at that moment, sitting on `remediation/wp9-artifacts`,
29 commits behind main, with three modified files and five untracked ones,
including two incident records that existed nowhere else.

The cause is one line: `REPO_ROOT = resolve(import.meta.dirname, "../../..")`.
It inspects whichever checkout the script is installed in. DAILY-RUN.md step B2b
claims it "reports which branch the primary checkout sits on"; that claim is
false whenever the run is done from a worktree — which is what B2b's *own*
caution about not switching branches in the main tree pushes a session to do.

Verified in both directions rather than reasoned about: from the worktree, 1
warning; from the primary checkout, **4 warnings**, and the three it added are
precisely the three the check exists to raise.

This belongs to the family for the reason step 1 identified — the gate verifies
its assertions and not its *reachability*. It is a sharper case than the first
six, because the input set was neither empty nor absent: it was a real, valid,
complete repository that simply was not the one anybody wanted checked. A
fail-on-empty helper, the repair direction proposed for the other six, would not
have caught this one. That is worth carrying into step 3: the invariant is
"examined the artefact it claims to guard", and "examined something" is a weaker
condition that this incident satisfies.

**Incident 8, 2026-08-27 — the same script again, firing on something correct.**
`session-close-check --hygiene-only` reported two incident records as *"exist
only on disk — losing this directory loses them"*: the 2026-08-22
process-violation writeup and the stranded-settlement investigation. Both were
byte-identical to the copies already on `origin/main` (`c97235f1` and
`9d9f630d` on both sides). Nothing was at risk. A session acting on the warning
would have spent its morning re-committing files git already had.

One line again: `git ls-files --error-unmatch` answers *is this path in the
index of whichever branch this checkout is sitting on*, which is not the
question the warning's own words ask. Incident 7 left the primary checkout on
`remediation/wp9-artifacts`; by this morning it was 48 commits behind main, so
every handoff added to main since read as unsaved. Incident 7 is therefore the
*cause* of incident 8, which is the clearest evidence available that the
family's local-fix pattern is still running.

**This one inverts the family's usual direction and is filed here anyway.**
F5's definition is a check that passes when it should fail; this one failed
when it should have passed. It is filed under F5 rather than F1 because it is
the same instrument as incident 7, and splitting one script's history across
two families to satisfy a definition would lose the thing that matters — that
this check has now been wrong twice in three days, in opposite directions,
about what repository state it is describing. The shared root is the one step 1
already named: the gate never established that the artefact it examined is the
artefact its output claims to describe. Incident 7 examined the wrong
repository; incident 8 examined the right repository and reported a property of
the wrong *branch*.

Repaired in #407 (`ab69416`). The predicate moved to
`src/lib/handoff-preservation.ts` — in `src/` because vitest collects only
`src/**` and `test/**`, so a predicate left in `scripts/` cannot be tested at
all, which is itself the F5 mechanism one level up. A file is now cleared by any
of: tracked here, identical blob at the same path on `origin/main`, identical
blob on the branch's pushed upstream. Strict superset of the old safe-set, so
it can only withdraw false positives; matching is on content rather than path,
so a locally-edited handoff whose filename exists on main is still flagged, and
that direction has its own test.

Discriminated in both directions rather than asserted: the un-fixed predicate
(`return !trackedHere`) fails 2 of the 6 unit tests, and end-to-end — a handoff
un-indexed while its identical content sits on `origin/main`, the real
condition — the old script emits the warning and the new one is silent on the
same repository state.

**Incident 9, 2026-08-28 — the repair exists and cannot reach the place the
procedure sends you.** DAILY-RUN.md B2b says to run
`session-close-check --hygiene-only` **from the primary checkout**, which is
incident 7's fix. This morning that produced the orphaned-handoff warning over
three files, and #407 — the content-matching predicate written specifically to
stop that — was not in play at all, because the primary checkout sits on
`remediation/wp9-artifacts`, now **62 commits behind main**, and therefore runs
its own stale copy of the script. Verified by content against `origin/main`
rather than by reading the output: two of the three were byte-identical blobs
already on main (`c97235f1`, `9d9f630d`) and are exactly the false positives
incident 8 diagnosed; the third,
`2026-08-27-at-firmenbuch-migration.md` (`edff5dd2`), was **genuinely absent
from main** and existed nowhere but that one directory. It is now committed.

The new mechanism is worth stating separately from 7 and 8, because it is not
"the gate examined the wrong artefact" — it is that **the gate's repair is
undeployable to the location the procedure mandates.** B2b's instruction and
B2b's own caution against switching the primary checkout's branch combine into
a standing guarantee that the staler the checkout gets, the staler the check
run against it becomes — and staleness is the condition the check exists to
detect. A version-independent check (or one that takes a `--repo` path and is
run from a current checkout) is the repair direction; a third edit to the
predicate is not.

Also worth carrying: the check was still **net useful** here. One genuine
finding in three, and the genuine one was real work that would have been lost.
The failure mode this family tracks is a check nobody believes; a 1-in-3 signal
on a destructive-loss warning is close to that line.

**Steps 3–7 owed.** The hypothesis to falsify: *a gate that asserted a non-empty
input set, or a minimum expected count, would have caught incidents 1, 4 and 5.*
The repair direction is a shared helper every gate routes its input through,
rather than five separate edits — the local-fix pattern is what carried F1 to
seven. Not started.

**Standing rule, added 2026-09-02: no checker ships until it has failed on a
planted case, and the plant is recorded in the PR.** A checker that has only
ever been run against clean, already-correct input has never been shown to
detect the thing it claims to guard — that is this family's exact definition,
just discovered before merge instead of after. The requirement from this date
forward: every new or materially modified checker's PR records at least one
input engineered to violate the rule, shows the checker failing on it before
the fix (or with the checker's own bug still in place), and shows it passing
after. A checker whose PR shows only the clean pass has not demonstrated
anything.

The rule is not theoretical — the same day it was written, exactly this
practice caught three bugs that a clean-pass-only PR would have shipped
silently. Per `handoff/_general/from-code/2026-09-02-t13-design-tokens.md`
(T13, design tokens as data): the spacing/radii off-scale check
(`findPxViolations`) had a capturing group around the property-name
alternation instead of the value, so it read `margin`/`padding`/`gap` out of
the match instead of the px number — "the spacing/radii check would never
have found a real violation," caught only because the planted "off-scale
margin px value... fails" test failed against the real implementation before
the fix; a second planted case in the same PR caught the hex-literal regex
matching HTML numeric character references (`&#128202;`) as false-positive
six-digit hex colors, since every digit in `128202` happens to be a valid hex
digit. Per `handoff/_general/from-code/2026-09-02-t14-cheap-extras.md` (T14,
claims register): the forbidden-claim scanner was hollow end to end — every
register row is authored as `/pattern/`, but the matcher only compiled rows
marked `is_regex` and even then kept the literal slashes, so **no forbidden
claim could ever match prose, in production or in a passing test suite.**
Found by planting three forbidden claims in `README.md` and watching the
scanner report clean; fixed with a regression test that fails on the
unpatched matcher.

Three verified bugs, two checkers, one day, all three invisible to a
clean-input pass and all three caught only because the PR was required to
show a failing case first. That is the population this rule is drawn from —
stated exactly as the two source handoffs record it, not rounded up to a
larger count this file cannot verify.

### F6 · Stale or unsupported public claim

> Something we tell the world that is no longer true, or was never quite true.

**Count: 4.** A methodology page naming a vendor we had left three days earlier;
listing copy selling compliance to a customer base buying growth tooling;
hardcoded capability lists advertising services we had withdrawn — and, still
open, "tamper-evident" on six pages, which holds for alteration of one record
and not for ordering or deletion across a 3.5-month window.
**State: INVESTIGATION DUE.** Two of the four were caught by drift guards;
the other two were caught by a human reading the page. A fourth guard is cheaper
than a fifth incident: the investigation to open is "which public claims have no
automated tie to the fact they assert".

**A guard now exists for the withdrawn integrity vocabulary (2026-08-25).**
F6's open question is "which public claims have no automated tie to the fact
they assert". The tamper-evidence family now has one:
`apps/api/src/lib/withdrawn-integrity-claims.test.ts` scans ten public-prose
surfaces for the phrasings Petter approved removing, and both fail-before runs
were done through `mutation-test.mjs` rather than by hand. Two limits, stated in
the file rather than glossed: it asserts **absence only** — approving
replacement wording would claim an authority this side does not have — and it
knows only phrasings we have actually published, so a new way of saying it is
unguarded. That is one claim family of four, and it does not close this family.

**Swept 2026-08-23 with both repos checked out** (the sweep normally skips
because the frontend checkout is absent in CI — see F5's note on
`check-shape-contracts.mjs`, which has the same blindness). `check-platform-facts-drift.ts`
scanned 162 surface files and returned 5 findings, and **none of them is an
inaccurate public claim today**: three are the string "ComplyAdvantage" on a
page that exists to *compare us to competitors*, and two are a hardcoded
"280+ capabilities" against a true count of 297, so the literal understates.
Worth recording as a data point about the instrument rather than the copy: a
guard with a 3-in-5 false-positive rate on a weekly cron that opens issues is
on the path to being ignored, which is how F1 got to seven. The fix is a scoped,
reasoned suppression a surface file can declare — diagnosed today, not shipped.
`check-shape-contracts.mjs` was run the same way and is clean, 25 fields to 25.

### F7 · State drift

> *Adjacent, recorded here 2026-08-23 rather than counted:* a deploy can fail
> its readiness check while the build succeeds, leaving `main` and the served
> artifact apart with no outage and no error anywhere a session would look. It
> happened to the 2026-08-23 check-in's own merge; the identical commit went
> green on retry. Not a new family — it is the same "recorded state and real
> state disagree" shape — but the *detection* is different: only
> `railway deployment list` distinguishes "not deployed yet" from "deploy
> failed", and `GET /health` alone cannot. Any session that reads a stale
> deployed SHA should check the deployment list before concluding anything.


> The recorded state and the real state disagree: a decision written down but
> never executed, a branch recorded as deleted that still exists, a document
> whose evidence went stale months ago.

**Count: 8. Root cause of the branch-deletion arm found 2026-08-31 (incident 7); incident 8 on 2026-09-03 is a different arm — see below.** A capability recorded as switched off that served errors for two
more days; three branches recorded as deleted that were still on the remote;
GOALS.md carrying three claims that re-measurement contradicted; a docstring
asserting a wiring that had never existed — and, on 2026-08-23, **the same
branch-deletion drift again, in the session that had just documented it.** The
2026-08-22 run found three phantom deletions, wrote the lesson down explicitly
("a deletion written down is not a deletion executed"), recorded seven more
deletions with their SHAs — and **six of the seven were still on the remote the
next morning**, confirmed by `gh api` and independently by `git ls-remote`.
Only `feat/phase-3-extraction-lv` had actually gone.

That is the sharpest evidence this family has produced: writing the lesson in
the same handoff did not prevent the next instance, because the record was
still written by the actor who intended the change, immediately after intending
it. The repair direction is unchanged and now has a worked example — **verify
against the system, in the same breath as the claim.** The 2026-08-23 sweep
re-verified every deletion against `git ls-remote` after executing it, and
carries the resulting count (24 → 7) as a measured number rather than a
described one.

**Incident 6 (2026-08-29) — the instrument goes stale exactly when the thing it
measures does.** The primary checkout sat on a feature branch 68 commits behind
main. `session-close-check.ts` inspects whichever checkout it is installed in —
DAILY-RUN.md requires running it from the primary checkout for that reason — but
it is also *implemented by* that checkout. The branch predates
`handoff-preservation.ts` entirely, so the morning run executed the pre-repair
orphaned-handoff test and reported five session records as one directory
deletion from oblivion. Three of the five were byte-identical to copies already
on `origin/main` and were never at risk. The repair for that exact false alarm
had been on main since 2026-08-27 (PR #407).

**This corrects a misdiagnosis, and the correction is the point.** The three
preceding mornings each read the same symptom as a fresh defect in the check and
repaired it again; the 2026-08-28 brief concluded the check itself could not be
trusted and should be "treated as a pattern rather than repaired again". The
check was never the problem — it was correct on main on every one of those
mornings. Recording the wrong cause is itself a state drift: the ledger held a
diagnosis that re-measurement contradicts, which is this family's own defining
shape applied to this family's own record.

The general form, and why it belongs here rather than in F5: **an instrument
that lives inside the state it measures degrades precisely when that state goes
wrong, and cannot report its own degradation unless it is built to look.** A
hollow test (F5) is one that never had teeth; this one has teeth and loses them
under exactly the conditions that call for them.

*Repair, shipped 2026-08-29:* `src/lib/check-self-staleness.ts`. The close-check
now compares its own file against `origin/main` before printing anything and
labels the whole run when they differ. Three arms rather than two, because the
two obvious ones are both traps: a failed comparison reports `unknown`, never
silent agreement, and a difference with zero commits behind reports `diverged`
(local work), never `stale` — a warning that misdescribes itself is how this
family started. The comparison is on file content, not commit distance, because
squash merges make distance meaningless. Verified by running the predicate
against the real evidence from the stale checkout, which returns `stale` with
the 68-commit distance named.

*Owed:* the underlying condition is not repaired. The primary checkout is still
parked on `remediation/wp9-artifacts` with another session's uncommitted work in
it, and moving it is the operation that corrupted the tree three times. The
guard makes the consequence visible; it does not remove the cause.

**Incident 7 (2026-08-31) — the deletions were real, correctly verified, and
undone overnight by a second automated system. Root cause found.**

This is the third morning in a row that branches recorded as deleted were back
on the remote (2026-08-22 into 08-23, 08-29 into 08-30, 08-30 into 08-31), and
every prior diagnosis in this family assumed the same two candidates: the
deletion never executed, or it was verified against the local ref cache instead
of the remote. **Both were wrong.** The 08-30 run deleted the refs, verified
them gone with `git ls-remote` against the remote in the same breath, and was
telling the truth when it wrote "43 → 36". All seven were present again the
next morning at byte-identical SHAs.

*What actually happens.* A separate scheduled job — the idea-lab studio's git
janitor, which carries this repository in its own multi-repo manifest with
`push_policy: "always"` — runs at about 04:03Z daily and pushes every local
branch that has no matching remote branch back to the remote
(`tools/git-janitor.mjs`, the `git push origin refs/heads/<br>:refs/heads/<br>`
call). Strale's B3 sweep deletes at about 06:12Z. The two have been undoing each
other for at least nine days.

Confirmed four independent ways, not inferred from one: the recreated remote
SHAs equal the surviving *local* SHAs exactly; GitHub's event stream shows
automated CreateEvents at 04:02–04:05Z on three separate mornings; the janitor's
manifest entry for this repo says in its own words that it "backs branches up
(push + rescue snapshots)"; and the push itself is visible in its source. Nine
`rescue/wip-*` branches on our remote are the same job's other output.

*The evidence was in plain sight for twelve days, and this is the sharpest thing
in the entry.* The 08-19, 08-21 and 08-23 runs all met `rescue/wip-*` branches,
triaged them at length, and deleted several — as **debris left behind by past
sessions**. Not one asked what creates a branch named for a date that keeps
being today. Each read a recurring output as a one-off residue, which is exactly
the misreading F7 is about, applied to F7's own evidence. A negative check
closes it: nothing in this repository's scripts or `.claude/` creates a
`rescue/wip-*` ref, so the name was never ours to explain away.

*The supply side is growing.* The janitor pushes one branch per local branch, and
local branches track worktrees. The 08-23 run took worktrees from 8 down to 2;
there are **24** today. Whatever this costs, it scales with a number nobody is
watching, and the two branches this morning could not delete are both held by
worktrees.

*Neither system is malfunctioning.* The janitor's doctrine — committed work that
exists locally belongs on the remote as backup — is correct, and a local branch
with no remote counterpart is exactly what it is built to rescue. **Our operation
was the incomplete one: B3 deleted one of the branch's two halves.** Deleting the
remote ref while the local ref survives does not delete a branch; it creates the
precise condition a backup job exists to reverse.

*The repair is an invariant rather than a case*, per step 5 of the root-cause
workflow: **a branch is not deleted until both its local ref and its remote ref
are gone, and the local one goes first** — deleting the remote first leaves a
window in which any backup pass restores it. DAILY-RUN.md B3 now says so.
Executed the same morning for the five branches not held by a worktree: local
ref deleted, then remote ref, then both halves re-verified. The two still held by
worktrees (`docs/receipt-phases-1-3-accepted`, `docs/receipt-phase4-reconciliation`)
need `git worktree remove` first, which is not an unattended-run operation with
23 live worktrees on the machine.

*Why the previous repair could not have caught this, and the transferable part.*
"Verify against the system, in the same breath as the claim" is still right, and
it was followed. It is not sufficient, because **it establishes the claim's
truth at an instant, and says nothing about its lifetime.** Where an external
actor can reverse the state, a verification is only as durable as the interval
before that actor next runs — here about 22 hours, comfortably shorter than the
gap between daily runs. The general form: *when a verified state is reversible
by something other than us, the check is not "is it true now" but "what would
have to happen for this to stop being true, and does that thing run".* The same
question is owed anywhere the daily run records a durable outcome — deleted
branches, deactivated capabilities, revoked credentials.

*Incident 8, 2026-09-03 — a repair verified through a different code path than
the one it claimed to have fixed.* The primary checkout's `.env` files, destroyed
in the F12 incident of 2026-09-02, were rebuilt from Railway the same evening and
DQ-29 was closed with "the database answers read-only queries again". That
sentence was true and the claim it was standing in for was not. Railway's own
`DATABASE_URL` names its internal host and carries no `?sslmode=`; copied
verbatim against the public proxy it is a URL that says nothing about TLS, and
`operator-db.ts` has refused exactly that since PR #361. The next morning's run
found the mandatory Vendor Control Tower step dead on arrival, and with it the
**10 read-path operator scripts** that open a handle through that module —
`vendor-control-tower-report`, `smoke-test`, `since-last-ext`,
`lifecycle-transition`, `validate-capability`, `onboard`,
`audit-execution-routing`, `dry-run-fix-latency`, `f1-failure-attribution`,
`sweep-duplicate-suites`.

> *Corrected the same day, before merge, by the independent review.* The first
> version of this paragraph said **25** scripts, taken from `grep -rl operator-db`
> without asking what each match did. Three of those matches are not casualties:
> `scripts/guard-production-write-access.mjs` names the module in prose and an
> allowlist and opens no handle at all, and the 14 write-path scripts call
> `openOperatorWriteDb`, which throws in `productionWriteUrl()` on the absent
> production write credential *before* the TLS assertion is reached — already
> inoperative for a separate documented reason. (The credential is named in
> prose rather than by its variable name because `guard-production-write-access`
> refuses unauthorised textual references and caught this paragraph in CI. Its
> allowlist is argued entry by entry and widening it to fit a sentence that can
> simply be rewritten is the wrong trade — the guard is right. There is a
> pleasing symmetry in the script this entry had wrongly listed as a casualty
> being the one that caught the entry's own overreach.) **A file list is not an impact
> list**, and inflating one by 2.5× inside the entry whose whole subject is
> claiming more than the evidence supports is the family eating its own tail.
> The number had already reached four documents when it was caught.

The verification was not skipped; it was aimed one path to the left. Drizzle's
`getDb()` reads the same variable, applies no such assertion, and connected
happily — so the dashboard and the commercial pack ran green all evening and all
morning, which is why the gap survived a full run before anything noticed.

*The same lesson recurred four hours later, in this entry's own session.* The
morning run wrote, as evidence the OpenRegister suspension was holding:
"Second-sourced against production: `german-company-data` is absent from
`GET /v1/capabilities` (297 listed)." True, and incomplete in precisely the
shape described below. A second public reader — the anonymous A2A agent card at
`/.well-known/agent-card.json` — was advertising it the whole time, because that
handler filters on `is_active` and `marketplace_eligible` and never on
`visible`. Measured: the card carries 413 skills against 297 capabilities plus
107 solutions, and diffing them leaves **exactly 10** ids public on the card and
absent from the catalogue, `german-company-data` and the founder-queued
`uk-gazette-notice-search` among them. Two of the ten — `page-speed-test` and
`danish-company-data` — are additionally served at HTTP 200 with full schemas by
`GET /v1/capabilities/:slug` while the list endpoint hides them.

Found by a concurrent session's independent review and reproduced here against
production before being written down. The code fix belongs to that session and
is not this entry's subject. What belongs here is that **the session which wrote
"verifying through the most permissive reader proves nothing about the others"
then verified a withdrawal through one public reader and called it
second-sourced.** Writing the lesson down did not prevent the next instance —
the same thing incident 7 found about the branch-deletion arm. The operative
form is narrower than the lesson and worth stating as a rule: *when a record is
withdrawn, enumerate the surfaces that publish it and check each one.* A
catalogue has more than one front door.

*The transferable part, and it is not the one already written above.* The
existing repair — verify against the system, and ask what would have to happen
for the claim to stop being true — would not have caught this, because the claim
never stopped being true. **Where one setting is consumed by more than one
reader, verifying it through the most permissive reader proves nothing about the
others.** A credential, a URL or a flag is restored when the *strictest* consumer
accepts it, and the check should be aimed there — *which consumers read this,
and did the strictest one accept it* is this family's dress of the question
named under F5, whose incidents share this one's reading error and not its
mechanism. Repaired durably rather than
locally: the environment manifest now states the `?sslmode=` requirement on both
Postgres rows, so the generated `.env.example` files carry it and the next
rebuild from Railway cannot repeat the omission silently.

**State: INVESTIGATION DUE.**
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
in-repo documents described parts of it. **State: INVESTIGATION DUE.**
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
**State: INVESTIGATION DUE, partially guarded** — CHARTER.md's
investigate-before-escalating test and the five required fields on every
escalation are the repair. The measurement to watch is the count of items
reaching him per week, and how many of them he could have answered without
asking a question back.

### F10 · Approval-boundary breach — **PROCESS FAILURE, not a technical one**

> Acting on something that was correct but not ours to execute: work carried out
> past a founder approval gate, or through a production permission we do not
> hold, on the reasoning that the answer was already determined and the action
> reversible.

**Count: 4, and the family would have been opened at two** — deliberately,
because unlike every other family here the damage is not proportional to the
count. One breach of an approval gate costs the gate its meaning.

**All four are the same category error, and only the first was an execution.**
The other three are *reporting* failures about that execution, in three
different directions — one moved a gated item into my column, one described a
finished write as though it were still waiting, and one put a closed decision
back in front of him as an open choice. Worth separating, because a guard aimed
only at "do not execute without approval" catches none of them, and all three
leave the founder's picture of who decided what wrong.

**The direction of travel is the thing to notice.** Two of the four were
caught by Petter reading the output, not by any check — #3 and #4. A third,
#2, was caught in review before it landed. None was caught by a control. Each repair added a
mechanism — the status vocabulary, then the already-executed exclusion, then the
settled-matter guard — and each time the *next* instance arrived through a route
the previous mechanism did not cover. That is what an unrepaired root cause
looks like from inside: the local fixes are all correct and the family keeps
producing. The common mechanism is that **I treat my own summary of who decided
what as authoritative**, and nothing checks it against the record.

| # | date | incident |
|---|---|---|
| 1 | 2026-08-22 07:50Z | A reconciliation was **executed** against production records that sat behind an `approval_required` item, on the grounds that the correct terminal state was already established by existing policy and the change was reversible. Both grounds were true. Neither was authority. Effect: eleven rows closed, +100c to an internal account. Not reverted — reversing would be a second unapproved write. |
| 2 | 2026-08-22 | In the first draft of this very reform, I reclassified that same item out of Petter's queue into my own, on the reasoning that the new autonomy rules now covered it. Reclassifying *his* queue is not one of the things the new rules grant, and doing it inside the change that granted them is the clearest possible illustration of the failure mode. Corrected before landing. |
| 3 | 2026-08-22 | The correction to #2 then described the same records as `AUTHORIZATION_UNAVAILABLE` — *awaiting* permission — when the write had already happened at 07:50. **A completed production mutation reported as pending is the same misreporting as an unapproved execution, pointing the other way**: it makes the record read as though the gate held. Caught by Petter, not by any check. The status now explicitly excludes anything already done. |
| 4 | 2026-08-22 | And then the brief asked him to decide whether that same reconciliation should *stand or be reversed* — after the incident had been closed and ACCEPTED (#361, #364), with the ledger explicit that the rows were deliberately not rewritten. Alongside it, a second entry asked which replacement integrity wording to publish, when the approved correction was removal with **no** replacement claim. Both are the same error as #3 by a third route: treating a closed matter as open. Caught by Petter again. Guarded, though not closed — `SETTLED_MATTERS` in the brief linter refuses any entry that puts one of these two matters back in front of him, under any status tag, and names where it was settled. It recognises the phrasings we have actually produced plus the rewordings two rounds of adversarial review supplied — 'revert the eleven rows', 'stands or is reversed', 'should the rows we closed at 07:50 be re-opened' and the noun form of tamper-evidence all fire, and were each added because a probe got past the previous version. Every one is locked by a test rather than asserted here. It is still a list of known-settled matters, not a general detector of re-opened decisions: a matter nobody has added is unguarded, and so is a phrasing nobody thought of. |

**The common mechanism is a category error, and it is not a lapse of care.** In
the execution case the reasoning was sound right up to the last step: *the correct action
is determined* → *the action is reversible* → *therefore I may take it*. The
third clause does not follow from the first two. Authority is a separate fact
from correctness, and an approval gate exists precisely to put the decision in
someone else's hands — which means "I already know what they would say" is the
argument the gate is built to refuse.

**Why widening autonomy makes this worse before it makes it better.** Every rule
added to CHARTER.md § "Act first, by default" enlarges the set of actions that
*feel* pre-authorised. The failure will not present itself as rule-breaking; it
will present itself as competence. That asymmetry is why the boundary is stated
in the charter at the same volume as the licence, and why this family is opened
at two.

**Repair, in three parts, two of which exist.**

1. **The rule.** CHARTER.md carries the hard boundary: being right is not
   authority; an `approval_required` item stays until Petter moves it; a
   permission we do not hold is a stop rather than an obstacle; reversibility
   confers nothing. A stated rule is what already failed to prevent incident 1,
   so this is the floor and not the fix.
2. **A name for the situation.** `AUTHORIZATION_UNAVAILABLE` — *decision
   settled, execution authority missing* — is now a first-class status beside
   `SYSTEM_ACTING` and `FOUNDER_DECISION`, checked by the brief guard with its
   own required fields. This is more than bookkeeping: with only two statuses,
   a settled-but-unpermitted item had nowhere legitimate to go, so it went
   either into "done" (incident 1) or into "your call" as though the judgement
   were still open (incident 2). A failure mode with no vocabulary is one the
   reporter has to invent a category for under time pressure, and both
   inventions were wrong.
3. **The mechanism — landed 2026-08-22 as `lib/production-authority.ts`.** An
   approval-gated action is now mechanically distinguishable from a delegated
   one at the point of execution: permission is an `Authority` value, delegated
   purposes are a closed list that moves by merge, and anything absent from it
   is founder-gated **by omission**. A grant is an ed25519 signature made with a
   key the platform never holds, so a session cannot mint the permission it is
   asked to prove; the write credential is unobtainable without an `Authority`;
   and the founder public key is empty, so every founder-gated action is refused
   today. That last fact is the freeze, expressed as code rather than as
   restraint. Incident 1 could not happen against this: the grant's purpose must
   match the action exactly, which is the control that incident specifically
   lacked.

**A note on how this repair was verified, because it nearly was not.** The
binding test written to hold the charter to this model keyed on
`lib/production-access.ts` — the module name on the pre-review branch. Review
reconciled two competing models and kept `production-authority.ts`, so the file
the test guarded never landed, its "dependency absent" branch stayed selected,
and it went on passing while the charter named four symbols that do not exist.
**And a sixth, in the repair for the fifth:** the rewritten test held its
type-only assertion with a compile-time reference, in a file no tsconfig project
typechecks — deleting `export type Authority` would have left every gate green.
Two hollow guards in two consecutive attempts to fix hollow guards, which is the
most direct evidence available that this family needs a mechanism rather than
more care. A
guard keyed to a path that never arrives reports success for work it never
looked at: **family F5, shipped inside the change that documents F5.** The test now checks
that every symbol the charter names is really exported — runtime exports against
`Object.keys`, and the type-only export by scanning the module's source, because
a compile-time reference would prove nothing in a file no tsconfig project
typechecks. Logged as F5 incidents 5 and 6.

**State: OPEN.** Owner Claude. Opened 2026-08-22. Parts 1–3 are done and the
binding is enforced. It stays open on the last criterion this file sets for any
family: **the historical incidents have not been replayed against the new gate.**
Incident 1's replay is cheap and specific — construct the authority the session
would have needed for `close_stranded_executing_rows` and confirm it is refused
— and it is owed before this closes.

---

### F11 · Destroying uncommitted work to run a fail-before check — **THE GUARD ALREADY EXISTED**

> Writing a fix, mutating it to prove a test discriminates, then "restoring"
> with `git checkout -- <file>` — which does not restore uncommitted work, it
> discards it.

**Count: 6.** Four during the 2026-08-21 remediation program, which is what
caused `apps/api/scripts/mutation-test.mjs` to be written. Then twice more on
2026-08-23, in WP10 and in the execution-receipt package, by a session that had
not reached for it.

**What makes this family different from the others here: the repair already
shipped, and the recurrence happened anyway.** The guard enforces exactly the
right protocol — clean tree, baseline green, mutate, red, restore, green again,
clean tree — and its own docstring opens with "`git checkout -- <file>`
destroyed uncommitted work FOUR times". It was sitting in the repo, correct and
sufficient, through both new incidents.

So the defect is not missing tooling. **A tool nobody reaches for is not a
control.** Both 2026-08-23 incidents came from hand-rolling `python -c` mutation
scripts and `cp /tmp/backup` restores in a shell loop, which is faster to type
than looking for whether a tool exists — and it works right up until the restore
targets a file whose changes were never committed.

Worth recording precisely, because the near-miss is the instructive part: in the
WP10 case the mutation went into a **commit** (`7b1185d` shipped a reviewer's
mutation as if it were the fix, under a message describing the opposite). In the
receipt case the loss was caught within seconds only because the restored file
left a dangling import that failed typecheck. Neither was caught by a control.

**Local fix, applied 2026-08-23:** every fail-before check in the execution-
receipt package now runs through `mutation-test.mjs`. Re-running the nine Phase 3
mutations through it reproduced all nine as CAUGHT, with clean-tree enforcement
and a verified-green baseline on both sides — which the hand-rolled version could
not assert, and which is the difference between "the suite went red" and "the
suite went red *because of the mutation*".

**State: OPEN.** No new tooling is owed — the existing guard is sufficient and
that is the finding. What is owed is the thing this file asks of every family: a
discriminating control, and there is currently none that makes the *unguarded*
path harder than the guarded one. A pre-commit or PostToolUse check that notices
a mutation-shaped edit against a dirty tree would be one; deciding whether that
is worth the friction is the open question, and it should not be answered by
bolting it onto an unrelated PR.

---

### F12 · The shared checkout destroying its own history — **ROOT-CAUSE INVESTIGATION OPEN, opened on the incident that trips it**

> One `.git` object store is shared by the primary checkout and every worktree
> derived from it. A directory-level deletion anywhere in that structure takes
> the history of *all* of them, and the files that survive survive as plain
> files with no history attached.

**Count: 5 by mechanism, 1 of them total.** Three partial tree corruptions on
2026-08-14, in which ~1,000 tracked files under `apps/api/**` and `packages/**`
vanished from disk while the index still listed them; the `node_modules`
junction hazard, in which removing a worktree with `rm -rf` followed a Windows
directory junction and deleted the main checkout's real `node_modules`; and, on
**2026-09-02, the whole of `C:\Users\pette\Projects\strale` including `.git`**.
All five share one mechanism — concurrent, directory-level operations against a
structure that has exactly one object store — and CLAUDE.md's Shared-Checkout
Rule already carried the first four. They were never gathered into a family, so
the threshold was passed without anyone counting.

#### Incident 5 — cause established (added 2026-09-02, same day, by the session that caused it)

The deletion was the worktree phase of the T2 repo-hygiene sweep (Claude Code
session, this repository, ~06:05Z–06:13Z). Its keep-list of worktrees to spare
was written as `/c/Users/pette/Projects/strale`; `git worktree list --porcelain`
prints `C:/Users/pette/Projects/strale`. Nothing matched. The loop reached the
primary checkout, `git worktree remove --force` refused it (the main working
tree always refuses), and the script's fallback for a refusal was
`git worktree prune; rm -rf "$wt"`. The refusal was the guard; the fallback
removed it. Full record: `archive/sessions/2026-09-02-t2-repo-hygiene-sweep-report.md`.

Step 3 of the root-cause workflow, the falsifiable hypothesis, is therefore
closed by direct evidence rather than inference. Step 4, the repair of the
shared mechanism: (a) no deletion loop may take its targets from tool output
without normalising both sides and reading back a dry run; (b) a refused
`git worktree remove` is a stop, never a fallback to `rm -rf`; (c) untracked
secrets (`.env`, `apps/api/.env`; `.claude/settings.json` until T3 tracks it)
are copied aside before any bulk deletion, because they are the one thing GitHub cannot return.
Step 5, the discriminating protection, is track T3's session-end gate, which
refuses to end a session with an unregistered worktree present and installs
`git` hooks that make the primary checkout's deletion visible at the next
command.

#### Incident 5 (2026-09-02) — what is established, and what is not

Established, each of it second-sourced:

- Between roughly 06:05Z and 06:13Z the primary checkout was emptied. It is
  not a partial corruption: the directory contained zero entries, `.git`
  included. Observed directly, and confirmed by every git command from any
  worktree failing with `not a git repository:
  C:/Users/pette/Projects/strale/.git/worktrees/<name>` rather than with a
  remote error.
- **Every checkout of this repository on the machine was a worktree of that
  one.** All 24 in `git worktree list` resolve their `.git` to a file pointing
  into the deleted admin directory; not one is a full clone. So no local object
  store for this repository survived anywhere.
- **Working-tree files survived** in each worktree directory. Content is
  intact; history is not.
- The remote had already collapsed to `main` alone *before* the local
  destruction — 36 branches on 2026-08-31, one at 06:05Z today. Verified twice
  by `git ls-remote` and twice more, minutes apart, by `gh api`.
- **Production was untouched throughout.** The deployed commit equals `main`'s
  tip, CI is green, the paid rail answers its 402 challenge and the free tier
  serves in 29 ms. Nothing customer-facing was ever at risk.

Not established at the time of writing (the first paragraph below is
superseded by "cause established" above, same day):

- **What deleted it.** GitHub's events feed shows no bulk deletion, and that
  feed is demonstrably incomplete — head branches deleted after 20:08Z on
  09-01 produced no `DeleteEvent` at all — so it cannot be used to enumerate
  or to exclude anything. The three `C:/tmp` worktrees are gone from disk as
  well, which is consistent with a worktree-cleanup sweep that continued into
  the primary, but their deletion cannot be dated and the inference is not
  made here.
- **Whether the two events share a cause.** The ordering is known; the
  connection is not.

#### The recovery, and why nothing was lost

GitHub still served every deleted commit by SHA. The 28 branch tips recorded in
`git worktree list` at the start of the run were pinned as
`rescue/2026-09-02/<original-name>` before anything else was attempted, and all
28 verified present afterwards. The two unmerged closed PRs (#356, #409) were
checked separately and need no rescue. The primary checkout was then re-cloned
and its dependencies reinstalled.

The dated namespace is deliberate. These are not a revival of the branch
graveyard B3 exists to clear, and they must not be treated as one: they are
pins on objects that had exactly one copy left. Triaging them — merge, or
delete having confirmed the content is on `main` by file comparison and not by
commit count — is owed, with an owner and a deadline, and should happen from a
checkout that can run `git cherry` against them.

#### Root-cause workflow status

1. **Common instrument: identified.** A single `.git` object store shared by
   one primary checkout and every worktree, operated on concurrently by
   sessions that delete directories.
2. **Population: measured.** 24 worktree records, all history-less; 3 `C:/tmp`
   worktrees absent from disk; 1 primary checkout emptied; 0 surviving local
   object stores; 28 tips recovered; 0 commits lost.
3. **Hypothesis: not yet formed.** Forming one requires knowing what ran, and
   that is the open question. It should not be guessed at, and the candidate
   mechanism above is recorded as a candidate.
   *Later the same day:* established — the T2 sweep script's own deletion
   loop, see "Incident 5 — cause established" above. Step 4 (repair rules
   a–c) is recorded there, implementation owed; step 5 is track T3.
4–7. **Owed.** The repair direction that does not depend on the answer is
   already visible and is the useful half: **the object store must stop being a
   single point of failure.** A checkout whose history exists only inside
   another checkout's `.git` is not a copy of anything. Independent clones, or
   an unconditional push of every local branch that has no remote counterpart,
   would each have made this incident a non-event — and the second is precisely
   what the idea-lab janitor was doing when the 08-31 run correctly identified
   it as undoing our deletions. Both cannot be right for the same branch, and
   that tension is the design question this family has to answer.

**State: OPEN.** Nothing here is fixed. What has been done is preservation and
restoration, which is not the same thing.

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
