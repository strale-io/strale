# 2026-08-12 — Readiness program adopted; P0 baseline executed

**Intent:** Turn Petter's "fix the platform + capture upside" brief into a named program,
get his adoption decision, and run P0 (baseline) end-to-end.

**Mode:** Full.

---

## 1. Program adopted — DEC-20260812-A

Petter confirmed all five decisions with suggested defaults, same session:

1. 2026-08-05 Direction Plan Part One + Readiness program adopted. **DEC-20260502-A and
   DEC-20260503-A superseded** (Notion updated, Superseded-By relations set, CLAUDE.md
   Active Decisions extended, memory swept per DEC-20260505-A).
2. Prod sweep budget: €25 external per full-catalog run, denylist honored.
3. Escalation contract: platform acts alone on quarantine/promote/fixture/retry/delist/
   refund/draft-PR; humans decide spend-above-cap, vendor/license, pricing, deactivating
   revenue earners, DEC-20260428-B-grade builds, new external claims.
4. Quality floor: quarantine <70% / deactivate <30% on ≥10 real calls/30d, auto-promote.
5. Factory dark-launch: yes for zero-maintenance class, invisible until first green week.

Program doc: `docs/strategy/2026-08-12-platform-readiness-program.md` (now committed +
marked ADOPTED). DEC page: Notion `3ba67c87-082c-8129-86c6-c35d82bc986f`.

## 2. P0 executed — [PR #178](https://github.com/strale-io/strale/pull/178)

**Production verification sweep** (`apps/api/scripts/sweep-prod-catalog.ts`, new): every
active capability called once through prod `/v1/do` with the test account, declared
assertions checked against actual output values.

**Result: 299 active capabilities → 273 PASS (91%) · 9 fixture-fail · 8 persistent
execution failures · 7 denylisted · 1 async-timeout · 1 in-flight (page-exists).
€0.79 estimated external spend of the €25 cap.**

**Disposition v1** (`audit-output/disposition-v1-2026-08-12.md` annotated +
`disposition-generated-2026-08-12.md` authoritative): keep 269 · fix 14 ·
quarantine-proposal 3 (screenshot-url 55%, brazilian-company-data 59%, url-to-text 54%) ·
deactivate-proposal 1 (**product-reviews-extract, 12% on 43 calls/30d**) · not-verified 4 ·
unverified-by-policy 7. Proposals only — nothing delisted.

**Machine-surface claims audit** (`audit-output/machine-surface-claims-2026-08-12.md`):
llms.txt says `max_price_cents` optional, prod requires it (agent's first call 400s);
x402 catalog emits float-artifact prices (`0.21600000000000003`); static vs dynamic
llms.txt have forked. All filed for P1.

**Red CI guards on main fixed:** estonian-company-data manifest cost_class →
`paid_prepaid` (DB already correct; executor uses Anthropic + Browserless);
getExecutor guard exemption now requires marker + pinned filename allowlist.

**Attribution design** (`docs/strategy/2026-08-12-attribution-design.md`): tagged
discovery URLs + SDK client headers + `client_meta` capture + first-touch join. Build at
P5 entry.

## 3. Review gate

Six-lens review ran pre-PR (technical + product passes, opus). 3 HIGHs found and fixed
before the PR opened — the important one: the sweep's own retries could trip production
circuit breakers (it did, during the run: 8 capabilities suspended 5–30 min;
base64-encode-url deliberately recovered after verifying it healthy; the rest are
genuinely broken and their breakers are correct). The committed harness caps attempts
below the breaker threshold, reuses idempotency keys across retries, never re-calls
deterministic failures on --resume, and refuses to run under a non-internal account key.

## 4. Top findings for P1 (in order)

1. **`german-company-data` wrong-company resolution** — returned "HRB TREUHAND GMBH" for
   a RATIONAL query; the #161 class, unfixed for DE. `belgian-company-data` abbreviation
   mismatch needs the same look.
2. **8 persistent execution failures**: danish (vendor quota — datacvr.virk.dk
   application is the fix), image-to-text + us-company-data (stale fixtures, filed
   08-09), llm-cost-calculate + approval-security-check (fail their own health inputs —
   genuine defects), eu-regulation-search, us-court-search, invoice-extract.
3. **Fixture-defect classes** to fix in the pipeline, not per-capability: volatile-field
   `equals` assertions on dates (3 caps); output-schema drift (2 caps); a P2 guard should
   refuse `equals` on volatile fields at authoring time.
4. **Quality-floor proposals** (above) — need Petter's merge of PR #178, then act per the
   escalation contract once the quarantine mechanism exists (P3).
5. **llms.txt max_price_cents**: fix doc, or make the field optional (product decision).
6. x402 catalog float prices.

## 5. Working-tree / concurrency notes

- Tree was on `feat/pii-retention-tier` (open PR #174) at session start; I branched
  `readiness/p0-baseline` from origin/main and left another session's uncommitted WIP
  untouched: `apps/api/scripts/onboard.ts`, `src/capabilities/guarded-executor.ts` +
  `.test.ts`, untracked `page-exists.ts` + manifest, `seed-seo-solutions.ts`, `AGENTS.md`.
  `page-exists` exists in the prod DB (created 09:17 today, visible=false, probation) —
  its executor is not deployed; the owning session should finish or deactivate it.
- **Tree left on `readiness/p0-baseline`** (PR #178 open). Switch back to
  `feat/pii-retention-tier` if resuming that work; the WIP files ride along either way.
- Test wallet topped to €50 during the sweep (internal ledger); ~€45 cycled through.
- Sweep JSONL evidence stays local (`audit-output/*.jsonl` now gitignored — may embed
  production output values).

## 6. Next session

P1 (truth & legality): german-company-data fix first, then the 8 execution failures, the
9 fixture defects, machine-surface fixes, and the web-extract ToS-bypass closure. Use
`disposition-generated-2026-08-12.md` as the worklist. Re-sweep the 4 CIRCUIT_OPEN caps.
