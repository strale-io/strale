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

**Deliberately not fixed by exempting `human_override = true`**, which was the
obvious form. `reply_action` events also set that flag, and their `details`
carry an inbound email's sender address, subject and body — the broad fix would
have extended personal-data retention from 180 days to three years to solve a
bookkeeping problem. Production today holds thirteen `human_override` rows: the
eleven reconciliations and two capability promotions. No `reply_action` row
exists yet; the code path does.

Six regression tests, each failing against the pre-fix single-cutoff statement.
The event types are bound via `sql.join`, never a JS array into `ANY()` — that
renders a row-value tuple Postgres rejects and has crash-looped boot before.

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
