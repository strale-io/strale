# M0 — Audit Delta: baseline vs current main

**Date:** 2026-08-20
**Audited baseline:** `482ef93341df1fe676bd6f9de4688be85609394b` (docs: 2026-08-19 morning check-in, #343)
**Current main at M0:** `e825a05` (fix: structured 'not covered' error for Nager.Date 204 responses, #344)

## Delta

Exactly one commit separates current main from the audited baseline:

| Commit | Classification | Notes |
|---|---|---|
| `e825a05` #344 — Nager.Date 204 → structured "not covered" error | **Unrelated** to all CR findings | Touches `holiday-calendar.ts`, `public-holiday-lookup.ts`, their manifests, and one lib helper (5 files, +208/−29). Error-shape fix in two free-tier capabilities. Does not touch wallet, x402, audit chain, idempotency, policy, jobs, network guards, legal surfaces, or discovery. |

- Changes that **already fix an audit finding**: none.
- Changes that **conflict with planned work**: none.
- Changes that are **unrelated**: 1 (the entire delta).

## Line/file reference rebaselining

No rebaselining needed outside the two holiday-lookup capability files, which no CR references.

## Working-tree note at M0

The working tree contained untracked `apps/api/scripts/_tmp_*.ts` probe scripts and `audit-output/` (stale May-2026 registry enumeration material) — leftovers from earlier investigation sessions, not part of any commit. They are ignored by this program and must not be committed with remediation work.

## Gate result

**PASS** — clean understanding of current main. The audit's file/line references remain valid against `e825a05`. Proceed to Fable re-audit adjudication (see `FABLE-REAUDIT.md`), then WP0.
