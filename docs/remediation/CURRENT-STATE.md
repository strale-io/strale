# Remediation Program — Current State

_Last updated: 2026-08-20 (session 1)_

- **Current package:** WP0 — Immediate containment (planning → implementation)
- **Next package:** WP1 — Proof floor
- **Latest accepted SHA:** `e825a05` (M0 + re-audit accepted against it)
- **Unresolved blockers:** none
- **Human approvals granted:** program-level autonomy (run continuously; escalate only per CHECK-IN A/B/C)
- **Verification gates:** VERIFY-P3 partial (prod read-only done for the load-bearing claims); VERIFY-IP / VERIFY-DEP (partial) / VERIFY-LEGAL open
- **Re-audit outcome:** central thesis UPHELD; 8 audit claims corrected; no CHECK-IN A. See `FABLE-REAUDIT.md`.
- **WP0 confirmed-live scope:** demand-signals verbatim customer text (3,426 rows); piggyback→public-example incl. compliance PII (508 rows); quarantine bypass (30 caps sellable while delisted); crash-orphan executing txns (11 live); + CR-10/11/12 quick wins. Legal-text rewrites HELD for WP14 (CHECK-IN B batch).
- **Tooling:** Codex CLI 0.147.0 (`codex exec … < /dev/null`); read-only prod via root `.env` DATABASE_URL public proxy, `postgres` driver `ssl:false`.
- **Branch state:** remediation work on `remediation/program`; origin/main == `e825a05`.
