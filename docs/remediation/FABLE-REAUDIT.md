# Fable Re-Audit — Strale Remediation Program

**Date:** 2026-08-20
**Audited baseline:** `482ef93`
**Current main:** `e825a05` (M0 delta: one unrelated commit — see `audit-delta.md`)
**Method:** 9 parallel read-only evidence agents, each verifying the Master Remediation Plan's specific claims against source with file:line evidence; Fable (main loop) adjudicated and cross-checked convergent findings; six load-bearing claims were then verified against **read-only production** (`metro.proxy.rlwy.net`, 2026-08-20).

Adjudication verdicts: **UPHELD** (audit correct), **UPHELD-REFRAMED** (real defect, wrong mechanism/threat-model in the audit), **NARROWED** (real but smaller than stated), **DOWNGRADED** (partly or largely already mitigated), **REJECTED** (not present).

---

## 1. Verdict on the audit's central thesis

**UPHELD.** The governing diagnosis — *one business fact owned by multiple independent authorities* — is strongly corroborated across every domain. The evidence is not that the code is low quality; the core `/v1/do` wallet engine, the advisory-locked hash worker, and the Stripe idempotency index are individually well-built. The defects cluster precisely where a **second authority** decides a fact the first authority already owns:

- **success/billability** decided independently by 5 rails (`/v1/do` sync, `/v1/do` async, wallet solutions, x402 capability, x402 solutions), plus two proxy re-derivations (MCP, A2A);
- **eligibility** decided with a different check-set per rail (the quarantine-bypass below is the sharpest instance);
- **wallet mutation** written inline at 10 sites with no `WalletService`;
- **capability lifecycle** written by the quality floor *and* re-flipped by the test scheduler's `checkSolutionGates`;
- **discovery metadata** authored in 8+ places with only count-drift guards.

The remediation strategy (contain → raise proof floor → one authority at a time → migrate consumers → delete old authority + bypass guard) is sound and I am adopting it. **No CHECK-IN A condition is triggered** (audit not materially wrong; no critical finding invalidated; no re-sequencing forced; the legal-text rewrites that need founder sign-off live in WP14, not WP0). Proceeding to WP0.

## 2. Corrections the re-audit makes to the audit

These are the falsifications the program asked for. They change *scope and threat-model*, not the overall sequence:

| # | Audit claim | Verdict | Correction |
|---|---|---|---|
| C1 | IPv6 private ranges not blocked (CR-11) | **NARROWED** | `isBlockedIp` *does* block `::1`, v4-mapped, `fd00::/8` ULA, `fe80:` link-local, metadata. Real defect is **string-prefix matching instead of CIDR math** → gaps at `fc01::`–`fcff::` and `fe90::`–`febf::`. |
| C2 | Audit chain: concurrent-finalization branch + genesis race (CR-04) | **UPHELD-REFRAMED** | Admission *is* serialized (`pg_try_advisory_xact_lock`, single writer). The genuine branch hazards are different: head-selection ordering mismatch (`createdAt ASC` thread vs `completedAt DESC` head) with no unique constraint on `previous_hash`; fail-open `getPreviousHash()→GENESIS` on DB error; non-terminal free-tier rows hashed mid-flight (CRIT-5 fix never reached free-tier paths). |
| C3 | Infra/harness failures blamed on capability quality (CR-06) | **DOWNGRADED** | Harness traffic (`@strale.internal`), free-tier rows, soft-deleted rows, and refusals are already excluded. Residual: `config` (own-credential) failures still count; x402/anon rows pass the filter unconditionally. |
| C4 | `/v1/suggest` has no abstention (CR-21) | **NARROWED** | Primary Haiku-rerank path *does* abstain (zero-candidate null + explicit `total_relevant:0` veto). Gap is the **LLM-unavailable `fallbackRanking`** path — no veto, any ≥0.3 cosine hit becomes a confident pick. |
| C5 | MCP `server.json` version drift 0.2.3 vs 0.2.6 (CR-22) | **REJECTED (already fixed)** | HEAD: server.json = package.json = npm = 0.2.6. Residual: version hardcoded in a 3rd place (`STRALE_CLIENT_ID`). |
| C6 | x402 dedup non-atomic → double charge (CR-03) | **NARROWED** | Double *charge* is prevented by the `transactions_x402_payment_hash_unique` partial index (**confirmed present in prod**). Double *execution* is not (check-then-act before the executor). |
| C7 | Free-tier / price-0 x402 execution (CR-01) | **NARROWED (no live instances)** | Code path real, but prod has **0** capabilities with `price_cents=0 AND x402_enabled=true`. Fresh-provision + future-mismatch risk only. |
| C8 | x402 schema/migration provenance gap (new) | **NARROWED (prod OK)** | `x402_payment_hash` unique index **exists in prod**; risk is a fresh environment provisioned from startup-migrations alone lacking it. |

## 3. Convergent findings (multiple independent agents) — highest confidence

These were each hit by ≥2 agents from different starting prompts, and several are **confirmed live in prod**:

1. **Quarantine/delisting is bypassable** (wallet, x402, outcome agents). Quality-floor delisting sets `visible=false, x402_enabled=false`; but `/v1/do` execution gates only on `is_active && !is_free_tier` and never reads `x402_enabled` even for X-Payment calls, and `matching.ts` by-slug ignores `visible`. **Prod: 30 capabilities are `x402_enabled=false AND is_active=true AND non-free` right now** — a live "delisted but still sellable" surface. (CR-01 + CR-05 + quality-floor, entangled.)
2. **Crash-orphaned `executing` transactions are never failed or refunded** (wallet, x402, CI/jobs agents). `shutdown.ts` comments claim the 30-min janitor flips them; it flips `compliance_hash_state`, not `transactions.status`. A hard kill after the async debit strands the wallet debit permanently *and* permanently consumes the user's hourly spend cap (`spendCapWouldExceed` counts `executing` forever). **Prod: 11 stale `executing` rows, oldest 2026-04-07.** (CR-01.)
3. **Solutions refund is an absolute, unlocked balance write** (wallet, account, outcome agents). `solution-execute.ts:~480` `SET balanceCents = originalBalance`, no tx, no `FOR UPDATE`, no delta → lost-update clobber of any concurrent debit/top-up; failed refunds only logged while the API already told the customer "not charged." (CR-01.)
4. **`checkSolutionGates` reactivates deactivated solutions hourly** (outcome agent; corroborated by CLAUDE.md's 2026-08-14 incident). `test-scheduler.ts` flips any inactive solution to `is_active=true` when its steps have a recent pass, with no check for *why* it was inactive. This is the mechanism behind "production contradicted the deprecated-solutions list." (CR-05.)
5. **Wallet solutions rail has neither idempotency nor spend cap** (idempotency, outcome agents) — the most expensive SKUs (€1.50–€2.50) double-charge on retry and bypass the €/hour cap. (CR-02/03/05.)

## 4. Per-CR adjudication (condensed)

- **CR-01 Economic integrity — UPHELD (P0).** Core engine sound; the crash-window (item 2), solutions refund (item 3), erasure burn (unledgered absolute write), and x402 settle-before-record are the real holes. → WP2/WP3/WP5/WP11.
- **CR-02 Outcome/billability — UPHELD (P0).** No shared `ExecutionOutcome`; output-contract validation runs *after* charge and only into audit metadata; `isSuccessfulStepOutput`'s ≥2-key heuristic is the money boundary; x402 solutions ignore `gated`. → WP4.
- **CR-03 Idempotency/replay — UPHELD (P1).** Key not bound to payload *or capability* (cross-capability replay returns mislabeled cached output); absent on solutions/MCP/A2A/x402-via-do; global (not user-scoped) unique index → cross-user 500. Double-charge itself is backstopped by the index. → WP6.
- **CR-04 Audit finality — UPHELD-REFRAMED (P0).** See C2. Goal stands; threat model rewritten. → WP7.
- **CR-05 Policy divergence — UPHELD (P1), elevated.** The quarantine bypass (item 1) makes this partly a P0 money issue. → WP8.
- **CR-06 Quality metrology — UPHELD, partially pre-mitigated (P1).** See C3. Solution sub-calls produce no invocation facts (`capability_id=NULL`), invisible to floor + breaker; x402 never feeds the breaker. → WP9.
- **CR-07 Assurance floor — UPHELD (P0-enabler).** No ephemeral-PG lane (integration tests exist but `describe.skip` with no `DATABASE_URL_TEST` in any workflow); no crash tests; `webhook.ts` has zero tests; some source-regex "behavioral" tests. → WP1.
- **CR-08 Job durability — UPHELD, NARROWED (P1).** Most jobs boot-relative; the two load-bearing ones (test-scheduler work-selection, reindex) *are* durable. No lease table. `hook_failed` retry sweeper was designed but **never built** (0 matches). Aux tasks fire on every boot (DEC-20260504-B class). → WP10.
- **CR-09 Account/trial lifecycle — UPHELD (P0).** Non-atomic signup (3 unwrapped inserts); two trial-grant paths with divergent gates; delete→re-register trial-farming loop; closure zeroes balance with no ledger entry. → WP11.
- **CR-10 Credential/admin — UPHELD (P0).** `/v1/auth/recover` rotates the key unauthenticated (revocation DoS) and emails the reusable key in plaintext; no admin-secret strength floor (contrast the ≥32-char AUDIT_HMAC check); admin auth duplicated in 5 files (currently identical); `/v1/public/ops` boundary is an allowlist, not the router. → WP0 + WP11.
- **CR-11 Egress/SSRF — UPHELD, NARROWED (P0).** Raw-socket DNS-rebinding TOCTOU is real (ssl-check, port-check, cert-chain); IPv6 story is C1; `annual-report-extract` uses raw `fetch`. → WP0 (contain) + WP12.
- **CR-12 Resource amplification — UPHELD (P0).** Stripe webhook body uncapped pre-signature (outside all `bodyLimit` scopes); `/health/deep` public + does DB writes/hit; x402 preverify unthrottled; media caps timeout-bounded but not byte/pixel-bounded. → WP0 + WP12.
- **CR-13 Supply chain — UPHELD (P1).** `npm audit --omit=dev`: **1 critical / 14 high / 7 moderate / 2 low**. Notable direct: hono CORS-reflects-origin, drizzle-orm identifier SQLi (semver-major fix), js-yaml quadratic DoS (313 manifests parsed at boot). Actions tag-pinned not SHA-pinned; 3/4 workflows lack a `permissions` block; a PR-triggered workflow mounts a cross-repo PAT without `persist-credentials:false`. → VERIFY-DEP → WP13.
- **CR-14 Unsafe publication — UPHELD (P0), LIVE.** `/v1/demand-signals` serves verbatim customer free-text (**3,426 rows, newest today**); example-output serves live `test_results` incl. piggybacked customer outputs (**508 piggyback rows**) mislabeled "fixture data," reachable for compliance capabilities whose outputs contain personal data. → WP0 (contain now) + WP14.
- **CR-15 Retention/privacy truth — UPHELD (P0).** 90-day redaction is weekly (≤97d worst case) and misses `client_meta` (full Referer/UA, never cleared), `x402_payer_hash` (indefinite), `x402_orphan_settlements` (no rule); "1095-day purge" is redact-in-place not deletion; Privacy page + per-call audit claim 1095d for customer input the runtime zeroes at 90d; "user_id severed" is false (Stripe-session re-link vector). → WP14.
- **CR-16 Processor evidence / CR-17 Assent — UPHELD (P1).** Signup UI presents **no Terms** while the backend stamps `tos_accepted`; no DPA assent recorded anywhere. → WP14 + VERIFY-LEGAL.
- **CR-18 GDPR/DPIA — not independently re-verified this pass** (documents-review; deferred to WP14/VERIFY-LEGAL).
- **CR-19 Client-IP provenance — UPHELD (Conditional High).** Every extractor reads leftmost XFF (spoofable); the in-code "cannot be spoofed behind Railway" comment is about the rightmost hop. Free-tier 10/day IP cap is bypassable. → VERIFY-IP → WP0/WP12.
- **CR-20 CI waste — UPHELD (P2).** → WP15.
- **CR-21 Internal retrieval — UPHELD (P0-P1 product).** See C4; no candidate union, no structured constraints, no eval harness (the data exists in `suggest_log`, the harness doesn't). Frontend substring grid + solution-routed-as-capability bug confirmed. → WP16.
- **CR-22 External discoverability — UPHELD, NARROWED.** server.json drift already fixed (C5); ~406 inlined A2A skills and 8+ metadata authorities confirmed. → WP16.5–16.7.

## 5. New risks the audit did not name (fold into the owning WP)

- **N1 — Crash-orphan `executing` never resolved** (§3.2) — the single highest-value correctness+money bug; the `shutdown.ts` comment actively misleads. → WP3/WP5, plus a one-shot reconciler for the 11 live rows (WP0-adjacent, read-then-fix, no backlog risk).
- **N2 — `/v1/demand-signals` public verbatim customer text** (LIVE, 3,426 rows). → WP0.
- **N3 — Piggyback customer outputs served as public "examples" incl. compliance PII** (508 rows). → WP0.
- **N4 — Cross-capability idempotency replay returns mislabeled cached output.** → WP6.
- **N5 — Solution steps execute with zero per-capability eligibility** (no is_active/lifecycle/breaker) — a DB-deactivated-but-code-registered capability still sells inside every bundle. → WP8.
- **N6 — x402 rail records nothing into the circuit breaker** — a broken capability keeps selling on x402 until the daily floor catches it. → WP8/WP9.
- **N7 — `topup-test.ts` absolute balance write, no ledger row, root `.env`** — one command against a prod-pointed env corrupts the ledger invariant. → WP1 hygiene / delete.
- **N8 — Cross-repo PAT without `persist-credentials:false` on a `pull_request` workflow.** → WP13.
- **N9 — Raw user query interpolated into the Haiku rerank prompt** on a public unauthenticated endpoint (injection; blast radius = wrong recommendation). → WP16.4.

## 6. Verification gates — status set by this pass

- **VERIFY-P3 (partial, done early):** prod read-only confirmed — x402 index present; 11 stale `executing`; 30 delisted-but-sellable; 0 price-0-x402; demand-signals + piggyback live. Remaining P3 (process-kill behavior, scheduler cadence, settlement timing) deferred to WP1–WP5.
- **VERIFY-IP / VERIFY-DEP / VERIFY-LEGAL:** open. VERIFY-DEP has a first data point (§CR-13 counts) but the reachability triage is unrun.

## 7. Sequencing decision

Master order is retained. WP0 scope is **finalized** to the confirmed-live containment items (§3.1, §5 N1–N3, CR-10/11/12 quick wins) — see `packages/WP0.yaml`. The legal-text corrections that require founder sign-off (Privacy page retention wording, "charged only on success" on the solutions page, Terms presentation at signup) are explicitly **held for WP14** and will be batched into a single CHECK-IN B when that package runs; WP0 contains the *data exposure* without editing customer-facing legal claims.
