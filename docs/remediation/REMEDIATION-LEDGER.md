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

- **Status:** REVIEW (implementation + tests complete; Codex review in progress)
- **Started:** 2026-08-20 · **SHA before work:** `08de56a`
- **Commits:** `cd9bebe` (implementation + tests), `9adcb5e` (demand-signals test)

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

Full suite: **2163 passed, 0 failed**; `tsc --noEmit` clean.

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

- **Status:** PLANNED

## WP2–WP16 and verification gates

- **Status:** PLANNED — see `PACKAGE-GRAPH.yaml` once the re-audit lands.
