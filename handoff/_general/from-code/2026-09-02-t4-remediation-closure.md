Intent: Close six dated-or-open items in the remediation program (docs/remediation)
per T4's tracks.yaml entry: WP10's overdue seven-day cadence gate, WP9's
two-week observation watch, the open VERIFY-IP proxy-hop question, dated
statuses for WP12/WP13/WP15/WP17, WP14 re-homed as a founder_gated track,
and PACKAGE-GRAPH.yaml/CURRENT-STATE.md reconciled against all of it.

Worktree: `C:\Users\pette\Projects\strale-wt-t4`, branch
`feat/remediation-closure`. All work is read-only against production (SELECT
via the Railway public proxy with `ssl: false, max: 1`, plus a handful of
legitimate free-tier `POST /v1/do` calls against `email-validate` for the
VERIFY-IP probe — no DB writes performed directly by this session). No
application code was touched; every change is under `docs/remediation/`,
`docs/programs/`, `apps/api/scripts/` (new read-only query scripts),
`archive/receipts/`, and `scripts/m2-closure-register-lib.mjs`.

## Commits, in order

1. `76241cc2` — WP10 seven-day cadence gate: **ACCEPTED**
2. `116ebd10` — WP9 two-week observation watch: **ACCEPTED_WITH_RESIDUALS**
3. `42cfc731` — VERIFY-IP: **RESOLVED**; WP12: **UNBLOCKED_NOT_YET_STARTED**
4. `72a3ee5d` — VERIFY-DEP/WP13: dependency reachability triage
5. `9c51f305` — WP15 database-lane assessment; WP17: **DEFERRED**
6. `cdf4b0b2` — T16 founder_gated track for WP14; T9→WP16 pointer confirmed
7. this commit — CURRENT-STATE.md rewrite, handoff, archive/handoff indexes

## Verdicts, with evidence

### WP10 — Durable Job Coordinator: ACCEPTED

Query: `apps/api/scripts/wp10-cadence-verdict.mjs`. Receipt:
`archive/receipts/2026-09-02-audit-wp10-cadence-verdict.json`.

- `quality-floor`: 7 `tick_complete` events in the last 7 days (declared 24h
  period; was 51/7d pre-fix), gaps 24.03h avg / 0.01h stddev across 9 gaps
  since the `ce5e63f` merge (10 days).
- `capability-promotion`: 7/7d (was 45/7d), gaps 24.02h avg / 0.01h stddev
  across 10 gaps.
- `weekly-sweep`: `next_run_at` exactly 7 days after `last_started_at`,
  unchanged across ~90 deploys since 2026-08-30 (was 141 runs/17.6 days
  pre-fix).
- 120 commits merged to `main` between `ce5e63f` (2026-08-23) and HEAD
  (`2feb22bf`, 2026-09-02); `GET /health` confirmed HEAD is the deployed
  commit, so all 120 are real redeploys — "at least one deploy since merge"
  satisfied ~two orders of magnitude over.
- Zero `job_schedule` rows with `consecutive_failures>0`, `last_outcome=
  'error'`, or a stranded/active lease.
- **`unverified:`** `job-coordinator-recovered` / `job-coordinator-job-
  timed-out` log events go to Better Stack, not a DB table this session
  could query read-only. `consecutive_failures=0` is a same-instant proxy
  (a since-recovered-and-succeeded job would look identical), not full
  history. Recorded, not acted on — next step for a session with log
  access: grep both event labels over 2026-08-23..2026-09-02.
- Also found: `checkUpstreamEscalation` fires per test-run, not solely from
  the weekly-sweep job — its `upstream_escalation` event timestamps are NOT
  a clean sweep-cadence signal (the gate's own text implied they were).
  Used `job_schedule.next_run_at` directly instead; recorded in the
  acceptance block so a future reader doesn't rely on the looser signal.
- VERIFY-P3 moved PARTIAL → COMPLETE (cadence was its last open portion).

### WP9 — Capability Invocation Facts: ACCEPTED_WITH_RESIDUALS

Query: `apps/api/scripts/wp9-observation-close.mjs`. Receipt:
`archive/receipts/2026-09-02-audit-wp9-observation-close.json`.

Watch opened 2026-08-22T17:22Z, nominally closes 2026-09-05 — closed 3 days
early on flat evidence, per this session's brief (judgement call, named
explicitly in the package file rather than silently overridden).

- `suppressed_incomplete_evidence`: 0 events across the full 11-day window,
  unchanged from the 0 baseline.
- `invocation_fact_write_failed`: 0 events.
- 17 `tick_complete` heartbeats observed, every one `facts_table_protected
  =true`, `evidence_holes=0`, `evidence_shortfalls=0` — every `escalate_if`
  condition stayed at zero.
- **Named, not smoothed over**: the package's own hoped-for live proof —
  "the first solution_step fact whose slug has no direct transaction
  traffic" — has not happened (0 such slugs on 2,416 facts). Not an exit
  condition (all six of WP9's own `exit_condition_status` entries were
  already MET by test + mutation coverage), so it does not block
  acceptance, but it hasn't occurred either.
- `transaction_id` residual reconfirmed: still NULL on 100% of facts
  (2,416/2,416), matching PACKAGE-GRAPH.yaml's existing classification —
  second-sourced against a fresh count, not restated on faith.

### VERIFY-IP: RESOLVED (high confidence); WP12: UNBLOCKED_NOT_YET_STARTED

Script: `apps/api/scripts/verify-ip-probe.mjs`. Receipt:
`archive/receipts/2026-09-02-audit-verify-ip-proxy-hops.json`.

Method (all four of the task's acceptable methods were tried; the fourth —
an endpoint that records request headers — is the one that worked):

1. No literal echo/debug endpoint exists (`grep`ped for one) — ruled out.
2. `suggest_log` / `discovery_hits` store only a **salted IP hash**, not the
   raw header — confirmed by reading `lib/attribution.ts`'s `saltedIpHash`
   call site; ruled out as a direct evidence source, but useful to confirm
   the hard rule ("they may store only a hash — say so") applied here.
3. Railway's official docs (`docs.railway.com/networking/edge-networking`)
   are silent on X-Forwarded-For handling. Railway's own community forum
   (station.railway.com) has **two directly contradictory staff answers**
   on hop count and which XFF entry to trust — neither relied on.
4. **`POST /v1/do`'s audit response echoes `request_context.ipHash`** — used
   as the de-facto echo endpoint. Three calls to the free-tier
   `email-validate` capability (price €0, no financial cost): no spoof, a
   spoofed single-value `X-Forwarded-For`, and a spoofed multi-value XFF
   plus a spoofed `X-Real-IP`. **All three returned the identical ipHash.**

Combined with DNS (api.strale.io CNAMEs straight to a Railway-generated
host, no CDN) and response headers (`Server: railway-hikari`, `x-railway-
edge: ams1`, no `cf-ray`): **exactly one proxy hop (Railway's own edge), and
it overwrites/strips client-supplied XFF/X-Real-IP rather than appending —
the leftmost entry the code already reads IS the true client IP.** This
contradicts FABLE-REAUDIT.md's CR-19 framing ("every extractor reads
leftmost XFF (spoofable)") for the topology as it actually exists.

Caveat stated in the receipt: single-machine, single-point-in-time,
public-domain-only test; does not cover Railway internal private networking
or a future platform change.

WP12 moves BLOCKED → UNBLOCKED_NOT_YET_STARTED: the XFF-trust exit condition
is answered, but CIDR/IPv6 gaps, raw-socket DNS-rebinding TOCTOU, and
byte/pixel caps are real, unbuilt, VERIFY-IP-independent work needing its
own implementation session — not scoped or started here.

### VERIFY-DEP / WP13: TRIAGE_COMPLETE / TRIAGED_UPGRADE_PENDING

Script: `apps/api/scripts/wp13-dependency-triage.mjs`. Receipt:
`archive/receipts/2026-09-02-audit-wp13-dependency-reachability.json`.

`npm audit --omit=dev --json` at root and `apps/api`: both 1 critical / 14
high / 7 moderate / 2 low (moderate/low not triaged — out of the task's
scope, which named critical/high only). Matches FABLE-REAUDIT.md's original
count exactly (second-sourced).

Triaged the 15 critical/high by import graph — `grep` of `apps/api/src`,
`npm ls <pkg> --all` for dependency paths, and manual `node_modules`
require-graph tracing for cases where a transitive package's OWN eager vs.
lazy `require()` decided reachability (the harder, more valuable half of
this triage):

- **Reachable (10):** `@coinbase/cdp-sdk`, `axios`, `brace-expansion`,
  `c2pa-node`, `drizzle-orm`, `fast-uri`, `form-data`, `hono`, `sharp`
  (c2pa-node's own bundled 0.34.3 copy, separate from the already-patched
  direct 0.35.3), `undici`.
- **Unreachable (5):** `ip-address` and `path-to-regexp` (both only via
  `@modelcontextprotocol/sdk`'s express/OAuth transport, which
  `routes/mcp.ts` never imports — traced its two actual imports down to
  their real `node_modules` require graphs), `js-yaml` (the runtime-used
  instance is already patched to 4.3.1 per commit `5da32514`; the
  vulnerable 3.14.2 lives only inside a release-CLI's own tree),
  **`shell-quote` — THE ONE CRITICAL ADVISORY** (both paths are dev/build
  CLI tooling: `npm-run-all` bundled inside `c2pa-node`, and `drizzle-kit`),
  and `ws` (traced `cdp-sdk`'s `/auth` subpath's full eager require list;
  it never touches `@solana/kit`, the only path to `ws` — Strale's x402
  rail is Base-mainnet-only).

Highest-priority reachable finding: **drizzle-orm** (SQL injection via
improperly escaped identifiers), a direct dependency used throughout
`apps/api/src`; fix is semver-major (0.38.4 → 0.45.2+), needs its own
scoped upgrade session under DEC-20260504-A's regression-test discipline.
`hono` (cookie-name validation, non-major fix, also reachable and
load-bearing for auth) is a lower-risk first candidate. **This is a triage,
not an upgrade** — no package was bumped.

### WP15 — database-lane ownership: partially satisfied, not closed

Read `.github/workflows/ci.yml`'s `integration-db` job and
`apps/api/scripts/assert-disposable-test-db.mjs`. Verdict, dated
2026-09-02, no receipt (this is a code-reading judgement, not a production
measurement): the GitHub Actions `services:` Postgres container already
gives real per-run infrastructure disposability (a fresh isolated process
per job, destroyed after) — stronger than the residual's framing implies.
But the literal ask — the lane creates and drops its OWN uniquely-named
database — is not implemented: it always connects to the fixed name
`strale_test`, and the only thing standing between it and a
tunnelled/misconfigured `DATABASE_URL_TEST` is `assert-disposable-test-
db.mjs`'s row-count heuristic (a real, verified-working safety net — its
own docstring says it refuses against production's 340 capabilities / 899k
transactions — but a heuristic, not a structural guarantee). Left as a
small, scoped follow-up (unique DB name + explicit CREATE/DROP) in its own
session, since it touches the CI pipeline every PR depends on.

### WP17 — Immutable capability-state ledger: DEFERRED

Dated 2026-09-02, in `packages/WP17.yaml`'s `deferred` block. Reasoning: a
DB trigger + writer inventory + adversarial review is its own scoped
implementation with its own review cycle; not separable into a smaller
first slice without reproducing the exact failure mode the package exists
to prevent (partial protection reading as protection when it isn't).
Neither implemented nor scoped as a first slice — both options the task
offered were considered and the deferral reasoning states why the slice
option was declined. Three reopen triggers named: a second out-of-band
capability-state write recurring, a session explicitly scoped and budgeted
for it, or DEC-20260428-B-grade work touching the same paths for an
unrelated reason. The 2026-08-21 incident's underlying gap (WHO changed a
capability's state, on what authority) is unchanged.

### WP14 → T16 (founder_gated); WP16 → T9 (confirmed correct, not changed)

Added `docs/programs/cto-readiness/tracks.yaml` track T16, `status:
founder_gated`, `gate: none`, `blocker` naming exactly what Petter must
supply per DEC-20260815-A: the Dilisense vendor-role/DPA determination,
real user-assent evidence (or an explicit decision that the current
backend-only `tos_accepted` stamp is intended design), and sign-off on the
three `checkin_b` legal-text rewrites (Privacy retention wording, "charged
only on success," Terms-at-signup). Added `T16: "none"` to
`TRACKS_OUTSIDE_M2_GATE` in `scripts/m2-closure-register-lib.mjs` with a
reason comment. `npm run programs:check` and `programs:test` (30/30) both
pass.

T9 was already correct (WP16 / Discovery & Retrieval Authority, `gate:
post-m2`, `depends_on: [T7]`) — verified by reading it, left unchanged per
the task's own instruction to fix only if wrong.

### DECISION-BRIEFS.md / PUBLIC-COPY-CORRECTION.md — still open, narrowed

Neither file exists on `main` (`git cat-file -e
main:docs/remediation/DECISION-BRIEFS.md` fails). **New finding**:
`PUBLIC-COPY-CORRECTION.md`'s content has already shipped — commit
`171c2bff` (PR #388, on `main`) states it executes sections 3–5 of that
document (the twice-reviewed surface list Petter approved, DQ-18 item 2),
with sections 1–2 shipped via the frontend earlier. The withdrawn-
integrity-claim surfaces it named are gone from production; the planning
document itself was just never merged as a standalone doc — reads as
superseded-by-execution rather than genuinely open.

`DECISION-BRIEFS.md` **remains open**: commit `d462e013` (not on `main`)
records that "Brief A was executed against production without approval" on
2026-08-22 — a governance process violation (the founder had reserved that
write and never granted it), though the economic outcome matched the brief
and every guard in the script held. `unverified:` whether Brief B was ever
executed, and whether the Brief A process-violation finding has been
formally closed — both require reading files/branches outside this
worktree's `main`-rooted history, not done here.

**Still a founder question, not decided in this session**: whether to merge
either document (as historical record, given most of their content is now
either executed or superseded), formally supersede them in place, or
discard.

## Unverified items (recorded per the hard rule, not acted on)

1. WP10: crash-recovery / watchdog-expiry log events, not DB-queryable
   read-only (Better Stack sink).
2. DECISION-BRIEFS.md: Brief B's execution status; whether the Brief A
   process-violation finding is formally closed.

## What the founder must decide

1. **WP14 / T16's three items** (Dilisense DPA, real assent, the three
   legal-text rewrites) — see T16's `blocker` field for the exact wording.
2. **DECISION-BRIEFS.md / PUBLIC-COPY-CORRECTION.md** — merge as historical
   record, supersede in place, or discard.

## Verification run

- `npm run programs:check` — ok.
- `npm run programs:test` — 30/30 pass.
- `node scripts/check-project-context.mjs --json` — zero findings (run
  after each `docs/remediation`/`tracks.yaml` edit and again at the end).
- `npm run context:test` — 108/108 pass (covers the M2 register machinery
  `m2-closure-register-lib.mjs` also serves).
- `npm run archive:index` — run after this handoff landed; see the commit
  this file's SHA is part of for its output.
- `npm run receipts:check`, `npm run research:check`, `npm run claims:check`
  — run before the final commit; see that commit's message for results.

T4 is not marked done in the register — per the task brief, the orchestrator
does that after review.
