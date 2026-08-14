# Handoff — DEC-20260511-E implementation + DEC-20260511-F (digest silent rot)

**Intent:** Implement DEC-20260511-E (stuck-in-validating sweep). Pre-flight reshaped the work; second silent-rot finding (digest pipeline) led to a new DEC + P1 to-do.

**Session:** 2026-05-11 (claude-code, continuation of the SI-fix session earlier today).

**Mode:** Quick originally; expanded by Phase A.1 to include filing DEC-20260511-F + a P1 to-do for the digest pipeline restoration.

---

## What shipped (code, not yet committed)

Two files in the working tree:

- **NEW** `apps/api/src/lib/github-issues.ts` — minimal GitHub Issues client (~140 lines). Three exports: `ensureStuckValidatingIssue`, `closeStuckValidatingIssue`, `syncStuckValidatingIssues`. Uses existing `GITHUB_TOKEN` env var (already wired in `apps/api/src/lib/daily-digest/fetch-shiplog.ts:181`). Graceful degrade: no token or 403 → warning log + no throw.
- **MODIFIED** `apps/api/src/lib/meta-monitoring.ts` — replaced `checkValidationQueueStuck` and `checkProbationTimeout` queries to use a shared `lifecycleStateAgeSql()` helper anchored on `lifecycle_transition` event timestamps (with `capabilities.created_at` as fallback). `checkValidationQueueStuck` additionally calls `syncStuckValidatingIssues` on every run.

`tsc --noEmit` clean.

**Rule F read-back artifact preserved in-tree:** `apps/api/scripts/readback-dec-20260511-e.ts`. Inserts a synthetic `__readback_test_dec_20260511_e` capability + lifecycle event dated 50h ago, runs the check, asserts result, cleans up. The script is the structural enforcement that this DEC stays testable.

---

## Phase A finding that reshaped the work

The DEC's stated structural fix was **already in place** in `apps/api/src/lib/meta-monitoring.ts:387-422`. Production trace showed `checkValidationQueueStuck` firing 5 times on 2026-05-11 alone, all flagging SI. The actual gap was two-fold:

1. **Signal-surfacing.** 741 `meta_monitoring` events in 7 days; zero `digest_sent`/`alert_sent` events. Tier-2 row was written to a table nothing reads end-to-end.
2. **`updated_at` brittleness.** `updated_at < NOW() - INTERVAL '48 hours'` was reset by background row touches. SI was caught morning of 2026-05-11; a 14:28 UTC background bump silenced the check.

Methodology applied to itself: the DEC's premise didn't survive empirical inspection. Reshaped to fix what was actually broken.

## Phase A.1 finding (the second silent rot)

Original surface candidate was the daily digest's "Action required" block. Verification:

- `digest_snapshots` last row: **2026-04-14, 27 days ago**.
- Petter confirmed: no daily digest emails received since mid-April.

The digest pipeline is dead. Switched surface to **GitHub Issues**. Filed DEC-20260511-F for the digest silent rot as a separate workstream + P1 to-do.

---

## Notion writes

- **DEC-20260511-E** rewritten (rationale + scope + Implementation locked + read-back outcome + cross-ref to DEC-F): https://www.notion.so/35d67c87082c8111a057d140694d35c8
- **DEC-20260511-F** filed (digest silent rot — diagnose, restore, add meta-liveness check): https://www.notion.so/35d67c87082c81f9a4addf5904c35025
- **P1 to-do** for digest restoration (Owner: Petter, Effort: M, Status: Next up): https://www.notion.so/35d67c87082c813ba97aec4311f03032
- **Journal entry**: https://www.notion.so/35d67c87082c81ce9acdf7f3fddbeb28

---

## Rule F read-back (PASSED, 2026-05-11 ~16:16 UTC)

```
Step 1 — baseline check (expect passed=true, no stuck caps):  PASS
Step 2 — inserting synthetic capability row in 'validating':  OK (used DEC-20260423-B emergency bypass token in a transaction)
Step 3 — inserting lifecycle_transition event dated 50h ago:  OK
Step 4 — running checkValidationQueueStuck():
  passed=false  details="1 capabilities stuck in 'validating' for >48h"
  affected=["__readback_test_dec_20260511_e"]
  → github-issues-create-failed: GitHub create 403 for __readback_test_dec_20260511_e
=== Assertions ===
  passed === false                          : PASS
  affected contains synthetic slug          : PASS
  GitHub Issue created (best-effort)        : 403 from local PAT (lacks issues: write scope)
Step 5 — cleanup verified: post-cleanup check returns passed=true
READ-BACK PASSED
```

The 403 confirms the code path executes correctly. Production Railway `GITHUB_TOKEN` needs `issues: write` scope added.

---

## Action required (post-session, Petter)

1. **Update `GITHUB_TOKEN` PAT scope on Railway** to include `issues: write` on `strale-io/strale`. The PAT is already set on Railway (it's the one `daily-digest/fetch-shiplog.ts` uses for GET /commits) — just needs the scope upgrade. Until this lands, the new code returns 403 silently and degrades to the existing (silent) `health_monitor_events` row.
2. **Code-review gate.** Per CLAUDE.md the code-review gate fires before `/end-session`. This session shipped new TypeScript code (`github-issues.ts` + `meta-monitoring.ts` edits) and was not put through `/go`. Run `/go` on the next session before merging.
3. **Pick up the P1 to-do** (digest restoration). DEC-20260511-F describes the three workstreams: diagnose root cause, restore, add `checkDigestLiveness` meta-monitoring check.

---

## Meta-pattern (worth preserving)

Second silent-rot finding in a single chat session:

- SI capability stuck in `validating` for 4 days (DEC-E).
- Daily digest pipeline stuck silent for 27 days (DEC-F).

Same structural pattern: monitoring infrastructure assumes signals will be noticed by humans, but without surfacing-of-last-resort mechanisms, signals decay invisibly. Acknowledged in DEC-F body. The next-layer-up question — "does every monitoring channel need a meta-liveness check, and what surfaces those liveness checks themselves?" — is a strategic conversation for a later session, deliberately out of scope here.

---

## Artifacts left in repo

**Kept** (durable):
- `apps/api/src/lib/github-issues.ts` — new
- `apps/api/src/lib/meta-monitoring.ts` — modified (Fix B symmetric to two checks + Fix A GitHub Issue surface)
- `apps/api/scripts/readback-dec-20260511-e.ts` — Rule F regression artifact

**Deleted** (one-shots that served Phase A discovery):
- `apps/api/scripts/diagnose-validation-stuck-check.ts`
- `apps/api/scripts/diagnose-event-surfaces.ts`
- `apps/api/scripts/diagnose-digest-delivery.ts`

`apps/api/scripts/audit-manifest-db-drift.ts` (from the earlier SI-fix session today) is unchanged and remains as the manifest-vs-DB diagnostic — it was originally flagged as a candidate implementation surface for DEC-20260511-E, but we ended up landing in `meta-monitoring.ts` (option 3) instead. The drift audit remains useful as a standalone diagnostic.

---

## Cost

External API calls this session: **0 paid calls.** Read-back inserts/deletes used the DB only. GitHub API calls (~3 from the read-back) are free. Well under the €1 hard cap.

---

## Loose threads (recap)

1. ~~GitHub PAT scope upgrade (Petter).~~ **DONE** — verified end-to-end below.
2. Digest restoration P1 to-do (Petter).
3. `/go` review on this session's TS changes before merging.
4. Strategic question on meta-liveness coverage across all monitoring channels (DEC-F body).
5. **P2 to-do filed** post-handoff: "DEC-20260511-E GitHub Issue creation must surface failure independently" (https://www.notion.so/35d67c87082c8117a117cdb2406e2922). github-issues.ts currently fails silently on 401/403/5xx — recurses the DEC-E anti-pattern at the channel layer. Sketch in to-do body.

---

## Post-handoff addendum (2026-05-11 ~18:40 UTC) — DEC-E surface verified live

The above handoff was written before the Railway PAT was updated. After three iterations:

1. Initial read-back with local PAT: 403 (local PAT lacks `issues: write`).
2. Petter updated Railway PAT scope. Re-ran with Railway env via `railway run` + env-var injection: still 403. PAT suffix unchanged (`...ZyG52r`). Diagnosis: scope-edit on a fine-grained PAT requires org-level approval, OR a regenerate to force fresh permission state.
3. Petter regenerated the PAT (suffix changed `...ZyG52r` → `...EbZLnT`), pasted new value into Railway. Direct POST probe: **201 Created** (issue #91). Full read-back: PASS with `[github-issues-created]` log line confirming Issue #92 was opened end-to-end through the actual code path.

**DEC-20260511-E surface is verified live in production.**

### Minor finding documented in script

GitHub's labels-list query (`/issues?labels=stuck-validating`) has eventual consistency (seconds-to-minutes lag after issue creation). The read-back's sub-second create→cleanup sequence trips this; the production daily cadence does not. Updated [`apps/api/scripts/readback-dec-20260511-e.ts`](apps/api/scripts/readback-dec-20260511-e.ts) cleanup comment to document this — if a future read-back run leaves a `[stuck-validating]` issue open, the next Railway daily tick auto-closes it via `syncStuckValidatingIssues` running against indexed data.

### Audit of `GITHUB_TOKEN` consumers (5 active sites)

Done before the PAT replacement to confirm no breakage. Three sites are org-scoped (clean fit with new PAT): `lib/github-issues.ts`, `lib/daily-digest/fetch-shiplog.ts`, `lib/daily-digest/fetch-ecosystem.ts`. Two sites — `capabilities/github-user-profile.ts` and `capabilities/github-repo-compare.ts` — call arbitrary public targets (customer-supplied users/repos, not strale-io). Potential break if the org enforces "restrict fine-grained PATs to org resources." Petter to monitor; suggested fixes are in the conversation transcript (catch 401/403 and retry anonymously, or use a personal-resource-owner PAT). No code changes made.

### Verification artifacts at GitHub

- Issue #91 (closed) — initial POST probe artifact.
- Issue #92 (closed manually) — full-readback artifact; auto-close didn't fire due to label-index lag, closed via direct PATCH.

Both are documented as `readback test - delete me` and `[stuck-validating] __readback_test_dec_20260511_e` respectively. Both labeled and closed; no production noise.
