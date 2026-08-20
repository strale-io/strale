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

- **Status:** PLANNED (scope to be confirmed by re-audit verdicts)

## WP1 — Proof floor

- **Status:** PLANNED

## WP2–WP16 and verification gates

- **Status:** PLANNED — see `PACKAGE-GRAPH.yaml` once the re-audit lands.
