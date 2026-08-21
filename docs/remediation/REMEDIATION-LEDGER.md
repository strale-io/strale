# Strale Remediation Ledger

Durable source of truth for the autonomous remediation program
(governing doc: `STRALE-AUTONOMOUS-REMEDIATION-ORCHESTRATOR.md`, v1.0, 2026-08-20).
Audited baseline: `482ef93341df1fe676bd6f9de4688be85609394b`.

Status values: PLANNED · IN_PROGRESS · REVIEW · ACCEPTED · BLOCKED

Companion files:
- `CURRENT-STATE.md` — what a fresh session needs to resume
- `FABLE-REAUDIT.md` — re-audit verdicts on every CR claim
- `PACKAGE-GRAPH.yaml` — machine-readable package dependency graph
- `packages/*.yaml` — per-package manifests
- `audit-delta.md` — M0 baseline reconciliation

---

## M0 — Freeze and reconcile

- **Status:** ACCEPTED
- **Started / completed:** 2026-08-20 / 2026-08-20
- **SHA before work:** `e825a05`
- **Findings addressed:** baseline drift risk (none found — delta is one unrelated commit, see `audit-delta.md`)
- **Files changed:** docs only (`docs/remediation/audit-delta.md`, this ledger, `CURRENT-STATE.md`)
- **Migrations:** none
- **Invariants:** audit file/line references valid against current main
- **Tests:** n/a (docs)
- **Codex result:** n/a (no code)
- **Fable result:** ACCEPT (delta trivially clean)
- **Residual risks:** none from drift
- **Final SHA:** pending first remediation commit

---

## Re-audit (Initial Fable pass)

- **Status:** ACCEPTED
- **Started / completed:** 2026-08-20 / 2026-08-20
- **Method:** 9 parallel read-only evidence agents (wallet/money, x402+Stripe, idempotency+audit-chain, outcome+policy+quality, CI+jobs+supply-chain, account+credentials, network+resource, publication+legal, discovery+retrieval), each verifying the audit's specific claims against code with file:line evidence; Fable main loop adjudicated; 6 load-bearing claims verified against read-only prod.
- **Output:** `FABLE-REAUDIT.md` + `PACKAGE-GRAPH.yaml`
- **Central thesis (one-authority-per-fact):** UPHELD. No CHECK-IN A triggered.
- **Audit corrections:** 8 claims reframed/narrowed/rejected (IPv6 SSRF, audit-chain threat model, infra-blame, suggest abstention, MCP drift already fixed, x402 dedup, free-x402, provenance) — see FABLE-REAUDIT §2.
- **Convergent P0s (≥2 agents, live in prod):** quarantine bypass via /v1/do X-Payment (30 caps live); crash-orphan executing txns never refunded (11 live, oldest Apr-07); demand-signals public verbatim customer text (3,426 rows); piggyback customer output as public example (508 rows).
- **Fable result:** ACCEPT. Proceed to WP0.

---

## WP0 — Immediate containment

- **Status:** ACCEPTED (Fable), with one Codex finding adjudicated as scope-deferred — see below
- **Started / completed:** 2026-08-20 / 2026-08-21 · **SHA before work:** `08de56a`
- **Commits:** `cd9bebe` (implementation + tests), `9adcb5e` (demand-signals test), `60c1498` (Codex round 1), `3bb4605` (Codex round 2), `4814f32` (ledger)
- **Codex result:** **never returned PASS.** Rounds 1 and 2 returned `FAIL_REMEDIATION_REQUIRED`; round 3 and the final narrow check exhausted their budget without emitting a verdict. Every finding Codex raised was either fixed or explicitly carried as a residual — see the review section below. Its one unresolved blocker is a scope dispute, not a factual one.
- **Fable result:** **ACCEPT**, under §15 of the orchestrator (Fable adjudicates disputed findings). Verdict on the open item: `VALID_NON_BLOCKING` for WP0, promoted to a mandatory WP14 exit condition. Rationale and evidence in the review section.
- **Not escalated under CHECK-IN C:** the disagreement is resolvable from evidence and is about sequencing, not about whether the invariant holds. Recorded here for visibility rather than sent as a founder decision.

### Findings addressed

| Item | Finding | Live prod evidence |
|---|---|---|
| A | N2 — `/v1/demand-signals` republished verbatim customer free text, unauthenticated + publicly cached | 3,426 rows |
| B | N3 — public example-output served live `test_results`, incl. piggybacked customer outputs (compliance PII) mislabelled "fixture data" | 508 piggyback rows |
| C | CR-12 — `/webhooks` buffered unbounded bodies before signature verification | outside all bodyLimit scopes |
| C2 | *(new, found during C)* `app.onError` rewrote Hono `HTTPException` to 500, so existing `/v1`,`/a2a`,`/mcp` caps mislabelled 413 as a server fault | verified 413→500 by probe |
| D | CR-12 — `/health/deep` public, INSERT+DELETE on `transactions` per hit | unauthenticated + unthrottled |
| E | CR-12 — x402 wildcard rail unthrottled; facilitator verification runs pre-payment | only `/catalog` had a limiter |
| F | CR-10 — no ADMIN_SECRET strength floor; `admin.ts` used a private copy that would bypass it | prod secret is 64 chars (safe) |
| G | §3.1 — `/v1/do` X-Payment path gated only on `is_active`, so quality-floor delisting was bypassable | 30 capabilities delisted yet sellable |

### Invariants now enforced
- No unauthenticated response contains verbatim customer-submitted task text.
- Public example output is sourced only from authored fixture types; never customer traffic.
- A capability delisted from x402 cannot be paid for through `/v1/do` (checked *before* verification, so no payment is consumed for a refusal).
- A weak `ADMIN_SECRET` is treated as misconfiguration, not a credential, on every admin surface.
- Pre-auth request bodies are bounded on `/webhooks`, and body-limit rejections surface as 413.

### Tests
6 new/changed files, each verified **failing against pre-fix code**: `x402-eligibility.test.ts`, `admin-auth.test.ts`, `webhook.body-limit.test.ts`, `example-output-curation.test.ts`, `demand-signals-auth.test.ts`, plus a de-flake of `wallet.test.ts`.

Final state — full suite: **2166 passed, 0 failed**; `tsc --noEmit` clean. The single red file, `ssrf-bucket-b.test.ts`, is a pre-existing network-probe hook timeout that fails identically on the baseline commit.

Correctness questions Codex raised but ran out of budget to answer, verified directly instead:
- `coalesce(gdpr_art_22_classification,'data_lookup') NOT IN (...)` — checked read-only against prod: 333 rows kept, 7 dropped, as intended. Column is `NOT NULL DEFAULT 'data_lookup'`, so the coalesce is unreachable defensive code.
- The added `JOIN capabilities c ON c.slug = tr.capability_slug` cannot multiply rows: `capabilities_slug_unique` exists and 340 rows = 340 distinct slugs, so the join is 1:1 and `ORDER BY … LIMIT 1` semantics are unchanged.
- `onError` typing verified by `tsc`; the 413 mapping is the only reachable entry today (bodyLimit is the sole HTTPException source in the app).

### Old authority removed / bypass guards
- **Removed:** `admin.ts`'s private `isValidAdminAuth` + local middleware, now delegating to `adminOnly`.
- **Guard:** `lib/x402-eligibility.ts` is the single x402 payability predicate; new payment paths must consume it rather than re-deriving the check. WP8 folds it into the wider eligibility authority and migrates the gateway's SQL filter onto the same rule.

### Migration / deploy impact
None. No schema change, no migration, no startup hook. All changes are application code on the import graph from `app.ts` (DEC-20260504-C dependency: trivial). Rollback is a revert.

### Codex adversarial review (3 rounds)

Round 1 — `FAIL_REMEDIATION_REQUIRED`, 2 blocking:
1. **Error duck-typing** in `onError`. *Upheld.* The sharper half was the one I had missed: returning the thrown exception's own response answered a `/v1` request with hono's bare text body, breaking the `{error_code, message}` contract every client and SDK depends on.
2. **`test_type` is a classification, not provenance.** *Upheld in part.* Took the cheap real parts immediately (suite/result `capability_slug` equality — the join is on suite id alone; `ts.active = true`).

Round 2 — `FAIL_REMEDIATION_REQUIRED`, 2 blocking:
1. **`err.message` echo** could disclose diagnostic detail, and rewriting the body discarded `WWW-Authenticate` / `Retry-After`. *Upheld.* Replaced with a closed status→response mapping table carrying constant messages; unmapped 4xx now returns hono's response untouched so its headers survive; 5xx still falls through to logging.
2. **`test_type` still not provenance** — admin `add-fixture` can label arbitrary input `known_answer`. *Upheld on the facts; scope adjudicated.* Rather than add a schema column inside a containment package, the hazard itself is now closed: the public example surface fails closed for the Art. 22 screening classes.

**Fable adjudication on the scoping dispute.** Codex asked for a positive publication-approval artifact. That is a schema plus authoring-workflow change owned by WP14 (authority A11 owns "example/publication policy"), and WP0 declares `migration_required: false`. The *automatic, unauthenticated* publication path — 508 piggyback rows, no human in the loop — is closed. The residual path requires admin credentials, which is a materially different risk class. Recorded as a **mandatory WP14 exit condition** so it cannot be lost.

**Proportionality call on the screening gate.** Gating on `processes_personal_data` would exclude 109 of 340 production capabilities; gating on `gdpr_art_22_classification IN ('screening_signal','risk_synthesis')` excludes 7. Chose the latter: with piggyback rows already excluded, remaining examples come from *authored* fixtures whose subject is a chosen test entity, so a registry lookup naming a director is a different hazard from publishing "this person is a PEP". Verified read-only against prod (333 kept / 7 dropped); the column is `NOT NULL DEFAULT 'data_lookup'`, so the `coalesce` guard is unreachable defensive code.

Findings 3 (in-flight delisting race), 4 (SQL-text assertion is not a row-level test) and 7 (rate limiter fails open on unknown IP; counters process-local) were upheld as valid but out of containment scope — carried as residuals below.

### Residual risks (carried forward, not closed here)
1. **Wallet rail still serves quarantined capabilities.** Quarantine clears `visible` + `x402_enabled`; `matching.ts` by-slug ignores `visible`, so an authenticated wallet user can still execute a quarantined capability. WP0 closed the *paid-USDC* bypass only. → **WP8**.
2. **Progressive unlock bypasses the x402 gate** by design (grants free access, no payment) — but can admit a delisted capability. → **WP8**.
3. `[unhandled]` log noise remains for body-limit rejections (response is committed before the error propagates). Cosmetic. → WP15.
4. Test-harness fragility: the mock-DB FIFO queue races fire-and-forget startup selects. De-flaked one instance; the pattern is repo-wide. → **WP1**.
5. **Public examples still lack a positive publication-approval artifact** (Codex round-2 blocker, scope-deferred). `test_type` certifies how a fixture is used, not that its content may be published; admin `add-fixture` can label arbitrary input `known_answer`. → **WP14 exit condition.**
6. **In-flight delisting race:** x402 eligibility is read before verification and never re-checked at settlement, so a capability delisted mid-execution can still settle. → **WP8**.
7. **Rate limiter fails open** when no trusted proxy IP is present, and counters are process-local — so "facilitator verification is bounded" depends on Railway headers and a single process. → **WP12** (with VERIFY-IP).
8. `example-output` now returns 404 for capabilities lacking a curated fixture. Intended trade (no example beats a customer's data), but it will visibly empty some detail pages. → WP16.2 curation backlog.

## WP1 — Proof floor

- **Status:** ACCEPTED (Fable), Codex findings all fixed — see `packages/WP1.yaml`
- **Started / completed:** 2026-08-21 / 2026-08-21 · **SHA before work:** `04a8ed1`
- **Commits:** `a4944fe` (CI lane), `05ff170` (Stripe money-in), `062a7bc` (crash test), `7d12256` (usage-summary fix + wallet locking), `04a8ed1` (idempotency), `f17cbd6` (chain + curation + top-up), `411bdf6` + `66560fa` + `925c165` + `4c562f6` (Codex rounds), `5cebef6` (dormant suite)

### What changed

The repo already had DB integration suites. Every one was gated on
`DATABASE_URL_TEST`, and no workflow set it — so they called `describe.skip` on
every CI run since they were written. Green, proving nothing. **15 tests that
had never once executed now run**, alongside 44 new ones: 10 files, 59 tests.

| Area | Coverage added |
|---|---|
| Stripe money-in | First ever test of `webhook.ts`, with real HMAC signatures |
| Crash recovery | Real SIGKILL of a child running the real route — proves N1 |
| Wallet locking | DEC-8 proven by racing 6 calls at a wallet funded for 1 |
| Idempotency | Three defects pinned as WP6's acceptance signal |
| Audit chain | CR-04 as **reframed** by the re-audit, not as the audit stated it |
| Public examples | Row-level, closing Codex's WP0 finding 4 |

### Production bug found by the lane

`buildUsageSummaryForUser` selected `capability_slug` from `transactions` — a
column that table does not have. Its only callers are the low-balance and
zero-balance conversion emails, dispatched fire-and-forget, so **every "your
agent ran out of credits" email has been failing silently**. Confirmed against
production read-only. Neither the original audit nor my re-audit caught it.

### Two corrections to my own work

1. I wrote that webhook idempotency "rests on the unique index", then tested it
   by dropping the index — the handler still credited exactly once, including
   under five concurrent deliveries. The row lock is the real mechanism. The
   docstring now says what was measured, and the index has its own test that
   does fail without it.
2. My lane's filename assertion was **tautological** — the glob already
   filtered on the suffix being asserted. Codex caught it. Now globs a broader
   set, verified by planting a decoy file.

### Codex review — 4 rounds, never PASS

Every finding was fixed. Two I would not have found alone:
- the tautological assertion above;
- **the safety check ran after `drizzle-kit push --force`**, which is itself a
  write — so against a proxied production database the schema could have been
  altered before anything verified the target. Sharpest catch of the program.

Its final position is that disposability is checked heuristically rather than
proven. True, recorded as a residual with a durable fix assigned to WP15.
**Fable adjudication:** VALID_NON_BLOCKING under §15 — CI pins the URL to a
container it starts itself, and three independent conditions must all fail for
a write to land elsewhere.

### Residuals

- Disposability heuristics (small Strale deployment under ceilings; RLS-hidden
  rows) → **WP15**, durable fix: lane creates and drops its own database.
- Retrieval benchmark harness (master-plan WP1 item 7) → **WP16.1**, which the
  package graph already flags start-immediate-parallel. Independent of the DB
  lane; recorded so it is not silently dropped.
- Occasional first-run partial failures under heavy local load (timeouts, not
  assertion failures); stable across repeated clean runs.

### Final state

Lane 59/59 across repeated runs on a genuinely fresh database; unit suite 2185
passed; typecheck clean.

---

## WP1 — original plan entry

- **Status:** superseded by the entry above

## WP2–WP16 and verification gates

- **Status:** PLANNED — see `PACKAGE-GRAPH.yaml` once the re-audit lands.
