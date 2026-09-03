Intent: record the founder's answers of 2026-09-03 on the dormant vendor keys, the decision briefs and DQ-28; fix the two defects those answers exposed; and open the dependency-remediation track the T4 triage left ready.

## The answers, and what each needed

**Dormant vendor keys (DQ-30, new).** Petter: leave Cobalt, EINsearch and
sec-api in place, he will activate them later; keep the OpenSanctions and USPTO
accounts rather than closing them.

Verified read-only against production before recording it, because the
2026-09-02 recommendation offered a binary (buy or deactivate) it should not
have. The three US capabilities are dark: `visible = false`,
`x402_enabled = false`, `lifecycle_state = 'validating'` on all three. Both
routing paths in `apps/api/src/lib/matching.ts` require `visible = true`,
**including the explicit-slug path**, so no customer can reach them by the
catalogue, by automatic routing, by naming the slug, or on the crypto rail.
Eleven executions between them across all time, every one from the internal
harness, none successful, none since 2026-08-27. Leaving them costs nothing.

`OPENSANCTIONS_API_KEY` and `USPTO_ODP_API_KEY` are set in Railway and read by
no code. They now have manifest rows marked `retired`, so a credential audit
reports them as a recorded decision instead of raising them again.

**DECISION-BRIEFS.md.** Merged as history, not as a decision. Neither brief is
open: Brief A was **executed against production on 2026-08-22T07:50:01Z without
the approval it asked for** (F10 incident 1), and Brief B was superseded by
`docs/remediation/PUBLIC-COPY-CORRECTION.md`, applied 2026-08-25 except the
founder-gated npm publish. A status table at the head of the file says so, so
nobody reads its two `Recommendation` sections as awaiting an answer. Discarding
it was the wrong option: the ADDENDUM is the only account of the breach.

**DQ-28.** Answered `no` — the row-level M2 Decision register stays private,
which is the branch where nothing changes.

## The two defects

**1. The reconciliation records had a six-month life.** The third independent
review of Brief A found `health_monitor_events` purged at 180 days
unconditionally. The eleven `manual_reconciliation` rows are the only record of
who mutated eleven production transactions and under what policy — ten of those
transactions were already content-redacted and could not carry a closure note
themselves. Those transactions live 1095 days, so from roughly 2027-02-18 the
rows would have read `status='failed'` with an empty error and no explanation
anywhere.

Fixed in `apps/api/src/lib/data-retention.ts`: `DURABLE_OVERRIDE_EVENT_TYPES`
rides the compliance window, everything else keeps 180 days.

The rule is **the type list AND `human_override`**, and each conjunct rules out
the other's simpler form. `human_override` alone sweeps in `reply_action`,
whose `details` carry an inbound email's sender address, subject and body — a
two-and-a-half-year extension of personal-data retention to fix a bookkeeping
problem. The type list alone sweeps in the automated writers that share these
type names: the promotion job emits `capability_promotion` on every run, and
production already holds 114 such rows against 2 human ones. Both conjuncts
were needed and only one was in the first version.

*Found by the independent review, and it was right.* The first version keyed on
the type alone and listed only `manual_reconciliation`, which left the two
human-authorised `capability_promotion` rows on the same 180-day countdown the
change exists to stop — rows this very handoff had counted and then not
protected. The allowlist now carries every event type whose payload was read
and found to be operational metadata only.

**The second review found the type list wrong too, in the opposite direction.**
The first version keyed on type alone and listed one type. The second added
seven, assembled by reading one writer per type — and two of those surveys were
incomplete:

- `lifecycle_transition` has five more writers in
  `routes/internal-health-monitor.ts`, all with `human_override: true`, and the
  suspend endpoint puts `body?.reason` — unbounded, unsanitised admin free text
  — straight into `details.reason`. Admitting the type moved that field from
  180 days to 1095. **That is the same failure `reply_action` is excluded for,
  through a door the survey never opened.**
- The three `proposal_*` types each copy `proposal_description` out of a
  `proposal_created` row, and no writer of `proposal_created` exists anywhere
  in the repository. The content of a field that does not yet exist cannot be
  verified.

The list is now the two types with rows in production:
`manual_reconciliation` and `capability_promotion`.

**"Every writer read" was itself an overstatement, and the third review proved
it against production.** Of the two `capability_promotion` rows with
`human_override`, the 2026-08-22 one matches the ledgered migration block byte
for byte; the 2026-08-17 `web-extract` one matches neither named writer and no
writer anywhere in this repository's history. It was written by a one-off run
against production that was never committed — exactly the shape of
`manual_reconciliation`'s own script, which is likewise absent from every
branch. A grep cannot survey what is not in the repository. Both facts are now
in the code rather than implied away, and they are the argument for the
`human_override` conjunct carrying the weight: an uncommitted writer can put
any payload under any type name, so the type list narrows the blast radius and
is not a guarantee about content. `suspension_override` and
`auto_fix` are left out too, though their single writers are verified static —
the argument for them is speculative, and the argument against admitting a type
on an incomplete writer survey is precisely what this paragraph records. The
exclusions and their reasons are in the code, not just here.

Nine tests. The discriminating ones fail against a mutant that defines the
constants correctly and never wires them into the query, and one fails
specifically when the `human_override` conjunct is dropped. Four assert on the
exported constants and would pass either way; they are kept and grouped as
non-discriminating rather than counted as regression guards. **The first version
of this file claimed six discriminating tests when three discriminated**, and
the second left the LIMIT test inside the discriminating group under a docstring
that claimed it discriminated. Both were caught by review; both are the F5 shape
inside the change that documents F5.

The event types are bound via `sql.join`, never a JS array into `ANY()` — that
renders a row-value tuple Postgres rejects and has crash-looped boot before.

## Defect 3 — two public surfaces advertised capabilities the platform had withdrawn

**Not mine, live in production, and found only because a claim I wrote was too
strong.** DQ-30 first said no customer could reach the three dark US
capabilities "by any route" and listed four. The review checked by fetching the
surfaces instead of reading the code, and found a fifth.

`GET /.well-known/agent-card.json` is the machine-readable storefront an agent
reads to decide what to buy, and the most-fetched machine surface the platform
has. Its query filtered `is_active` and `marketplace_eligible` and never
`visible`. It was listing **ten invisible capabilities** by name, description
and price to any anonymous caller: the three dark US ones,
`german-company-data` (**suspended**), `page-speed-test` and
`danish-company-data` (**quarantined by the quality floor**),
`uk-gazette-notice-search` (DQ-14 item 2 — fails on every call because the
upstream errors for everyone), `page-exists`, `google-news-search` and
`serp-related-questions`. Independently reproduced by the concurrent check-in
session, which diffed the card's 413 skills against the 297 capabilities and
107 solutions in the public catalogue and got the same ten.

`GET /v1/capabilities/:slug` had the same gap. Eight of the ten 404 anyway on
their lifecycle state; **`page-speed-test` and `danish-company-data` returned
200 with the full payload including input and output schemas**, while the list
endpoint at the same path prefix had always hidden them.

Nothing was purchasable through either: all ten are `x402_enabled = false` and
both routing paths already required `visible = true`. The defect is disclosure,
and it defeats the quality floor's own mechanism — the floor withdraws a
capability by setting `visible = false`, so without this fix it withdrew it
everywhere except the surface agents actually read.

**Two surfaces was not all of them.** The second independent review enumerated
the rest and found three more, which is the whole lesson: fixing the two you
thought of is not the same as enumerating the readers.

- `GET /llms-full.txt` — the machine-readable capability listing written for
  language models, public and unauthenticated, listing the same ten. Confirmed
  live before fixing.
- `GET /.well-known/mcp.json` — counts withdrawn capabilities into the number
  of services it advertises. No capability is named, but the count was up to
  ten too high.
- The **x402 rail**, which is not a disclosure path but an execution and
  billing one. The catalogue query, `isX402RailEligible` and
  `isX402PayableCapability` all had no notion of `visible`, while
  `isServableCapability` in the same file carries a comment saying that
  omitting it makes a predicate blind to the platform's primary delisting
  action. The rail was safe only by coincidence — the quality floor clears
  `visible` and `x402_enabled` together. `POST /v1/internal/capabilities/:slug/
  unpublish` does not: it sets `visible = false` alone, so an unpublished
  capability already on the rail stayed listed **and payable**. And the
  unauthenticated `/v1/do` gate looks a capability up by slug with no filter at
  all, so an anonymous caller naming a withdrawn slug would have been handed a
  402 challenge to pay for it. Zero rows satisfy that combination today, so it
  was latent, not live.

**Nor was five all of them.** A third independent review enumerated again and
found two more, live in production, and reproduced them with `curl`:

- `GET /v1/solutions` and `GET /v1/solutions/:slug` disclose withdrawn
  capabilities through the solutions that bundle them. Eight active solutions
  had a step pointing at one; three of those solutions are on the x402 rail.
- The detail route's `extends_with` lookup filtered **nothing at all** — not
  even `is_active` — and returned slug, name, description, price and category
  for whatever the column named. About twenty active solutions point at a
  withdrawn capability that way.
- `POST /v1/suggest` shares the same join, and the names reach the response as
  `extra_description`: "also includes …".

Execution was never at risk on any of them: `solution-executor.ts` re-reads
each step through `isServableCapability` and marks a withdrawn one
`platform_withheld` rather than running it. The step joins now carry the
visibility requirement, which also means a withdrawn step stops counting
toward the advertised `step_count` — the honest number, since that step will
not run.

**Four passes at one enumeration, four passes that missed something — and the
fourth disproved the rule the third had proposed.** I wrote that the fix was
mechanical: enumerate every query against the `capabilities` table. The fourth
review did exactly that, found about ninety such reads, and then found four
more leaks that **none of them touch**. `/v1/public/ops/events`,
`/onboarding/readiness`, `/limitations/solutions/:slug`,
`/tests/solutions/:slug` and `/tests/capabilities/:slug/example-output` read
`health_monitor_events`, `test_suites`, `test_results` and `solution_steps` —
tables that carry `capability_slug` as a bare string with no foreign key and no
join to `capabilities` at all. A grep of one table cannot see them, and the
next table to carry a slug would have been invisible too. Chained, they
defeated the whole fix: enumerate every slug from the readiness endpoint, pull
the quarantine reason from the events feed, pull real output from
example-output, confirm bundle membership from either solutions endpoint. All
unauthenticated, all reproduced live.

**So the guard moved from the queries to the boundary.** `/v1/public/ops/*`
now prunes any withdrawn slug out of the response, whatever handler produced it
and from whichever table, and answers 404 when the request names one directly.
That is one place instead of ninety, it covers the tables nobody thought to
grep, and it survives a route added later by someone who never reads any of
this. It sits beside the allowlist because `app.ts` already treats the
allowlist rather than the router as the access boundary — and because the same
routers serve `/v1/internal/*`, where an operator must still see withdrawn
capabilities.

The generalisable form: **when the question is "can this leak", guard the
output, not the input.** A rule about queries is bounded by the tables you
thought to check. A rule about responses is bounded by the boundary itself.

**And then the guard needed three rounds of its own**, every defect found by
fetching the endpoint rather than re-reading the guard:

1. `/trust/capabilities/batch` answers with a map **keyed** by slug, and the
   pruner only inspected slugs as values.
2. The rewritten `Response` copied `content-length` from the original onto a
   shorter body. Hono's `app.request()` hands the object back and never checks
   it, so CI could not see it; a real server would have stalled or truncated
   every pruned response.
3. Slugs live in **plain string arrays and in free text**, not only in
   slug-bearing objects. Measured against production: **6,475 rows** in
   `health_monitor_events` name a withdrawn capability in `action_taken` or
   `details` while belonging to something else or to nothing —
   `quarantined: ["page-speed-test"]`, `affected: [...]`, and prose naming the
   slug outright. Dropping rows by owner never touched one of them.

That last one is the same shape as the finding that produced the guard, one
level down: I fixed the shapes I had thought of and called it complete. The
count is the useful part — not "a few edge cases" but two thirds of the events
table's recent history.

**A `slug` that is a bare string in an array is now dropped, and a slug inside
prose is replaced with `[withdrawn]`**, bounded on slug characters so a visible
`page-speed-test-v2` survives a withdrawn `page-speed-test`. The sentence is
kept rather than deleted: these strings are operational narrative a reader
still wants.

Ten tests now assert on the predicate the routes send to Postgres — rendered
through drizzle's dialect rather than through a stub that returns rows
regardless of the filter — and on the three rail predicates directly. Each
guard is mutation-proved, stated in one unit — **tests that fail when that one
filter is removed**: agent card 1, capability detail 2, `llms-full.txt` 1,
each of the two solution joins 1, `extends_with` 1, rail predicate 2, payable
predicate 2, response guard 4 for the pruner and 2 for the path check.

**Four of my own counts have now been wrong and review caught every one.**
"Removing either visible filter fails 2" was 1 for the agent card. "Payable
predicate 3" is 2. The retention suite is 23 tests, not 21. And "solutions 2"
was a test count sitting in a list of failure counts — the guards are
effective, all four removals are caught, but the number meant something
different from its five neighbours in the same sentence. Also measured wrong:
active solutions change their advertised step count: not eight but
**nine**, re-derived here against production. The sub-claim that three are on
the x402 rail was right.

**2. `set_in` in the environment manifest was fiction on a third of its rows.**
It is the field naming where each value actually lives, and no check ever read
it. The 2026-09-02 Railway audit turned out to contradict **43 of 127 rows**,
several of which carried a `cost_note` in the same row saying the variable was
not set in production. Corrected against that audit — only the `railway`
element, which is the part the audit can prove. The `.env` / `.env.test` /
`workflow` elements are untouched: this session cannot verify those from one
developer machine, and replacing a stale claim with a confidently wrong one is
worse than leaving it. `RAILWAY_*` variables keep their claim; the platform
injects them, so `railway variables` cannot list them and their absence is not
evidence.

Three contradictions are now mechanically refused (`checkRowContradictions`):
a row set nowhere but required somewhere, `none` combined with a real place,
and a retired variable something still requires. Each proved by removing the
call and watching exactly those three tests fail. Railway membership itself
stays an operator audit — checking it needs a credential CI must not hold — and
the manifest header now carries the audit date and how to redo it.

Three `holder` values were also false (`API_BASE_URL`, `EUR_USD_RATE`,
`NODE_ENV` said `local-only`; Railway sets all three).

## Defect 4 — the session-end gate invites the destructive reading

Noted, not fixed here. The gate reports a worktree with a detached HEAD as
"holds no batch branch" and prints `git worktree remove` as the fix. A rebase in
progress looks exactly like that, and this session had one, with an unpushed
commit in it. The concurrent check-in session read the instruction, checked
`git branch -r --contains`, found the commit on no remote, and declined to obey
— which is the only reason the work survived. A gate whose printed fix destroys
live work when its inference is wrong needs a discriminator, and there are two
cheap ones: a commit on no remote, or a `rebase-merge` / `rebase-apply`
directory in the git dir. Out of scope for this branch and left for its own
change rather than widening one already under review.

## T17 — dependency remediation, and why the program is active again

T4's triage established which advisories are reachable from running code: ten
of fifteen critical/high, and the single critical one is not among them. That
was deliberately a triage and not the upgrade. T17 is the upgrade, in the
triage's own order — `hono` first (semver-minor, load-bearing for auth, lowest
risk, proves the process), then `drizzle-orm` (semver-major, every query in
`apps/api/src` goes through it, its own batch and its own production check),
then the remaining eight. The five unreachable advisories are out of scope:
upgrading them is churn against no exposure.

It needs nothing from Codex and nothing from the founder, so `program_status`
returns to `active`. T10 stays blocked on the Codex quota (2026-09-07) and T16
on the founder's legal evidence; every queued track still sits behind T10.

## Not done

- Nothing was changed in Railway. The two unread keys stay exactly as they are.
- No dependency was upgraded in this batch; T17 is opened, not started.
- `set_in`'s non-Railway elements are unverified, and now say so in the header.
