# Audit-honesty substrate fix — 2026-04-29

**Intent:** Resolve every blocker the two audits (CCO + later CTO) named for the audit-trail subsystem, and ship the supporting infrastructure so the platform's "show your work, prove the chain, regulator-defensible" promise is actually defensible. Started from to-do `35067c87-082c-81fc-85ac-fe678c31a71c` (sanctions/PEP self-host); cancelled mid-session when the OpenSanctions licensing premise inverted; redirected into the audit-honesty work the second audit then formalised.

**Scope:** 22 commits across `strale` (21) + `strale-frontend` (2). 3 production schema migrations applied and verified live. 60+ new tests. All audit P0 / CRIT items closed. Both repos pushed; Railway redeploy verified live via probes against `/v1/verify` and `/v1/audit`.

## What's now true that wasn't this morning

1. The audit body no longer claims "EU" jurisdiction while running in US East — fixed in 4 different code paths (do.ts wallet path, solution-execute, x402 capability path, x402 solution path). My first commit was incomplete on this; the CTO audit caught that and I had to ship a follow-up.
2. `/v1/audit/:id` reads the hash-protected stored `audit_trail` JSONB. Pre-fix, it recomposed from current capability metadata at render time, so a transaction executed against `allabolag.se` (scrape) when the slug later migrated to `bolagsverket-hvd` (licensed API) rendered showing the new source as the source that ran.
3. Per-step latency for solutions is the real value, not `floor(totalLatency / total_steps)`. Pre-fix, a 12-step solution with one 4500ms outlier rendered every step at ~375ms, concealing exactly the failure pattern an auditor needs to see.
4. `schema_validated` is computed against the actual `outputSchema`, not hardcoded `true`. False when we can't verify (legacy rows, missing schema), true when the executor returned an object containing all required fields.
5. `personal_data_processed` and `quality.{sqs,label,pass_rate}` are returned by the API and consumed by the frontend. Pre-fix, the frontend rendered hardcoded "No — public data only" + SQS=85 + 94% pass rate on every audit page and PDF customers downloaded.
6. The frontend stops appending the literal "(Railway EU)" suffix to `processing_location`. Backend was honest after a4a84ce; frontend re-fabricated the EU claim on the way out.
7. GDPR right-to-erasure no longer makes the public chain verify report tampering. New `redacted_links` + `redaction_reason` fields explicitly distinguish legitimate erasures from broken links.
8. The two verify endpoints (public `/v1/verify/:id` and auth-gated `/v1/transactions/:id/verify`) now agree — same walker, same depth contract, same response shape, same redacted/legacy handling. Auth endpoint's only unique value is the user-ownership filter.
9. The async path no longer races itself into a permanently-broken hash. New `'deferred'` state (transactions inserted-but-not-completed) is invisible to the retry worker; the completion UPDATE flips state to `'pending'` atomically with the final hashed-field writes. Same fix applied to the synchronous-paid path (CTO audit caught that I'd missed it on first pass).
10. Migration 0047's backfill artifact (37,951 rows in production claiming `compliance_hash_state='complete'` but with `integrity_hash IS NULL`) is now honestly marked `'unhashed_legacy'`. New state served honestly by `/v1/audit/:id` (with disclaimer) and `/v1/verify/:id` (returns `legacy: true, hash_valid: null` instead of falsely reporting broken).
11. x402 audit body is no longer a 7-field stub. Full compliance shape with regulations_addressed, transparency marker, schema_validated, shareable_url. x402 executor failures are now recorded as 'failed' transactions (per DEC-14 we still don't settle on failure).
12. `recordX402Transaction` is awaited; if the post-settlement INSERT fails, we log to a dedicated `x402_orphan_settlements` table for manual reconciliation. Pre-fix this was fire-and-forget — paid customer transactions could vanish silently.
13. Provenance is validated at the audit-build boundary via Zod (RichProvenance schema + DEC-20260428-A Tier-2 disclosure check). Warn-then-block; v1 logs warnings, v1.1 escalates. The 6 EU registry capabilities (cz/danish/estonian/finnish/norwegian/polish-company-data) ship with full Tier-2 fields populated so they pass the gate cleanly.
14. **Insider rewrites of finalised chain rows now fail at the database boundary, not in application code that could be bypassed.** Migration 0054 added an append-only trigger; live-tested on a real `complete` row mid-session and got `check_violation` as expected.
15. Chain-health monitoring runs hourly + daily as part of the test-scheduler's auxiliary loop. Four new checks (`chain_pending_backlog`, `chain_failed_count`, `chain_stuck_deferred`, `chain_unhashed_legacy_count`) write to `health_monitor_events` so a silent retry-worker stall surfaces in real time.
16. The retry worker emits structured `integrity_hash_stale` and `integrity_hash_stuck_deferred` health events when it sees stale rows or stuck-deferred sweeps fire. Complements the hourly metric checks.
17. `/v1/audit/:id` is rate-limited at 10 req/min/IP (was: no limit). Token-gated, but a leaked token can no longer be hammered, and every call hits `getCapabilityProfile` so cost amplification is real.
18. Retention purge no longer hard-DELETEs transaction rows (which broke the chain at the 3-year mark). Now redacts in place — zeros PII columns, preserves `integrity_hash` + `previous_hash`, sets `deletion_reason = 'retention_purge'`. The chain stays verifiable; operators distinguish retention from GDPR Art. 17 erasure via `deletion_reason`.
19. `buildFailureAudit` carries the full compliance block (was missing shareable_url, GDPR Art. 15/17 mapping, personal-data signal). EU AI Act Art. 12 requires logging ALL executions including failures.
20. Idempotency replay returns `meta.audit` so retry callers get the original compliance URL. Pre-fix, retries were silently distinguishable from originals via the missing audit reference.
21. Async 202 response carries `meta.audit.shareable_url` so callers don't have to poll `/v1/transactions/:id` to find the eventual audit URL.
22. CLAUDE.md no longer describes `adverse-media-check` as "Google search + Claude Haiku" — actual implementation has been Dilisense + Serper for some time.
23. ToS (`strale-frontend`) now names upstream sub-processors (Dilisense, Serper) and explicitly frames screening outputs as evidence-not-determinations, with the EU AML Directive / UK MLR 2017 Reg 28A / GDPR Art. 22 customer-side review obligation called out.

## Migrations applied (production)

- **0052_unhashed_legacy_state**: 37,951 rows flipped from lying-`complete` to honest `unhashed_legacy`. Verified.
- **0053_x402_orphan_settlements**: table live with all 12 columns. Verified.
- **0054_append_only_chain_trigger**: trigger active and live-tested against a real production row. Verified.

Migration journal entries 53/54/55 hand-appended because the SQL files were authored manually rather than via `drizzle-kit generate`. Future hand-authored migrations need the same journal treatment.

## Deploy verification (live)

Probes ran 2026-04-29 ~22:48:
- ✓ `/v1/verify` on `unhashed_legacy` row returns `legacy: true, hash_valid: null` with the legacy_reason string.
- ✓ `/v1/verify` on `complete` row returns `chain.redacted_links` field (deletion-aware verify shipped).
- ✓ `x402_orphan_settlements` table reachable and empty (expected).
- ✓ Append-only trigger live and `tgenabled=O`.
- (Pending: chain-health rows in `health_monitor_events` after first hourly tick — confirms `runHourlyChecks` is firing. Petter to verify within ~1h of deploy.)

Saved as `apps/api/scripts/verify-deploy-2026-04-29.ts` for re-runs.

## Outstanding from this session

1. **Manifest sync for adverse-media-check.** YAML has new limitations (entity-name normalization + IT/BPVi coverage gap), but the existing sync scripts (`sync-manifest-text-to-db.ts`, `sync-manifest-canonical-to-db.ts`) explicitly skip the `limitations` array. Proper sync requires `onboard.ts --backfill --slug adverse-media-check`, which runs the full readiness pipeline. Limitations remain in YAML; live `/v1/capabilities/adverse-media-check` returns `limitations: []`. Low-priority operational task.

2. **Hourly tick verification.** `runHourlyChecks` first invocation should occur within 1h of deploy (auxiliary loop in test-scheduler.ts). Verify via `SELECT event_type, COUNT(*) FROM health_monitor_events WHERE event_type LIKE 'chain_%' GROUP BY event_type;` after 22:48 + 1h.

## Deferred past v1 (per CTO audit explicit deferred list)

In priority order:
1. **Dispute endpoint + disposition tracking** — explicit DEC-20260428-B requirement for any Strale-built data service. Currently routed to `compliance@strale.io`.
2. **`/trust/audit-methodology` page rewrite** — `verify.ts` advertises the URL but the page documents SQS scoring, not the hash chain. Embarrassing the longer it sits.
3. **External Merkle anchoring** (RFC 3161 / OpenTimestamps / chain-tip publication) — the audit called this "the largest defensibility uplift remaining."
4. **Tamper-detection integration test** against a real DB — protects everything we just shipped from regression.
5. **Token revocation endpoint** + revoked-tokens table.
6. **SDK typed audit helpers** (TS + Python).
7. **`buildX402SolutionAudit` aggregate** — solutions in x402 path still use the lean shape.
8. **MED-10** — free-tier rate-limit reads from `audit_trail->>'ipHash'` JSONB; should be a top-level `client_ip_hash` column.
9. **`integrity_hash_status` shadow column** resolution (rename or bring under source control).

## Holistic-critique items (platform discipline, not single tasks)

- **Source-of-truth discipline.** Today closed the audit-shape drift instance; capability-vs-DB-vs-CLAUDE.md-vs-frontend drift remains a recurring source of fabrication risk. Vendor info, capability counts, methodology claims all need a single canonical source with CI-enforced derivation.
- **Vendor reality maintenance.** The OpenSanctions licensing error that kicked off this session was a symptom of stale Vendor Roster info. Quarterly review discipline + a "before any to-do references vendor X, validate terms within 90d" check.
- **5-gate v1 launch checklist.** Today closed gate 1 (audit-trail integrity) ~entirely. Gates 2-5 (source-of-truth, catalog robustness, vendor reality, customer-facing legal posture) remain partial.

## Files in this session — by repo

**strale-io/strale**:
- `apps/api/src/routes/audit.ts` — composeAuditRecord rewrite, rate limit, unhashed_legacy handling, real quality fields
- `apps/api/src/routes/verify.ts` — deletion-aware walkChain, unhashed_legacy handling, redaction_reason, walkChain export for transactions endpoint
- `apps/api/src/routes/transactions.ts` — auth-verify endpoint convergence with public verify
- `apps/api/src/routes/do.ts` — sync-paid hash-race fix, async deferred-state, schema_validated computed, failure audit compliance shape, idempotency replay audit, async 202 audit URL, F-AUDIT-01 completion
- `apps/api/src/routes/solution-execute.ts` — F-AUDIT-01 completion, deferred state
- `apps/api/src/routes/x402-gateway-v2.ts` — F-AUDIT-01 completion, await + orphan log, full audit body, executor-failure recording
- `apps/api/src/lib/integrity-hash.ts` — toCanonicalIso for date-shape stability
- `apps/api/src/lib/processing-location.ts` — getStraleJurisdiction + jurisdictionFromRegion
- `apps/api/src/lib/provenance-builder.ts` — getProcessingJurisdictions rewrite, Zod gate
- `apps/api/src/lib/chain-health-monitoring.ts` — 4 new chain-health checks
- `apps/api/src/lib/meta-monitoring.ts` — chain-health checks wired into CHECK_REGISTRY (bundled with Petter's pre-session WIP)
- `apps/api/src/lib/test-scheduler-policy.ts` — status-aware retry policy (Petter's WIP)
- `apps/api/src/lib/data-retention.ts` — retention purge → redaction UPDATE
- `apps/api/src/jobs/integrity-hash-retry.ts` — ORDER BY, stuck-deferred sweep, structured health events
- `apps/api/src/jobs/test-scheduler.ts` — meta-monitoring runner wiring + status-aware policy + queue depth observability (Petter's WIP)
- `apps/api/src/db/schema.ts` — x402OrphanSettlements table
- `apps/api/src/capabilities/{cz,danish,estonian,finnish,norwegian,polish}-company-data.ts` — DEC-20260428-A Tier-2 provenance fields
- `apps/api/drizzle/0052_unhashed_legacy_state.sql`
- `apps/api/drizzle/0053_x402_orphan_settlements.sql`
- `apps/api/drizzle/0054_append_only_chain_trigger.sql`
- `apps/api/scripts/diag-adverse-media-variants.ts` (new, this session)
- `apps/api/scripts/preflight-2026-04-29-migrations.ts` (new)
- `apps/api/scripts/postflight-2026-04-29-migrations.ts` (new)
- `apps/api/scripts/verify-deploy-2026-04-29.ts` (new)
- `apps/api/scripts/diag-{cz-scheduler,cz-state-final,x402-google-search,x402-users,scheduler-state}.ts` (Petter's WIP)
- `apps/api/src/lib/{integrity-hash,processing-location,provenance-builder,provenance-builder-validation,chain-health-monitoring,meta-monitoring}.test.ts` — test files (60+ new cases)
- `apps/api/src/routes/{audit,verify}.test.ts` — extended with the new behaviour
- `manifests/adverse-media-check.yaml` — entity-name + IT coverage limitations
- `docs/research/2026-04-27-screening-coverage-empirical.md` — variant-test follow-up
- `docs/operations/hmac-rotation.md` — F-AUDIT-04 import-time-resolution clarification
- `CLAUDE.md` — adverse-media-check description fix

**strale-io/strale-frontend**:
- `src/lib/compliance-types.ts` — AuditRecord type extended with quality, personal_data_processed, source
- `src/pages/AuditRecord.tsx` — strip "(Railway EU)" + consume real quality + personal_data
- `src/lib/generate-audit-pdf.ts` — same fixes for PDF generator
- `src/pages/Terms.tsx` — sub-processor disclosure + screening-not-regulatory framing

## Notion housekeeping done in handoff

- To-do `35067c87-082c-81fc-85ac-fe678c31a71c` (sanctions/PEP self-host) — cancelled with closing note in commit `22d3597`; moved to Archive > Completed To-dos.
- Journal entry written for session: `35167c87082c8148827bfa83e619cd84`.
- DEC-20260429-A logged (sanctions/PEP wrapped-vendor; DEC-B doesn't trigger).

## Lower-priority follow-up (post-handoff continuation)

After the original 23-commit deploy, Petter asked whether everything from the audits was fixed. Honest answer: launch-blocking items all closed, but a handful of SESSION_F lows + the audit's MED-10 + world-class #6 (deletion_reason exposure) remained open. Knocked those out as well. Three more commits + migration 0055:

- `1a1f836` — F-AUDIT-05 (legacy token sunset env-overridable via `LEGACY_TOKEN_SUNSET_ISO`), F-AUDIT-06 (`getShareableUrl` host env-overridable via `AUDIT_FRONTEND_URL` → `FRONTEND_URL` → hardcoded default), F-AUDIT-07 (rename bare `audit_url` → `audit_path`; old field kept deprecated through 2026-10).
- `4079c74` — World-class gap #6: verify response now distinguishes user_request vs retention_purge in both the `redaction_reason` text and a new `chain.redacted_by_reason` per-bucket tally. Pre-fix, retention-purged rows rendered the GDPR Art. 17 text — wrong attribution.
- `9b34e6f` — MED-10: free-tier rate-limit promoted from JSONB read to top-level `transactions.client_ip_hash` column (migration 0055). Partial index on `(client_ip_hash, created_at) WHERE is_free_tier AND user_id IS NULL`. Today's free-tier rows backfilled from JSONB so the per-day cap doesn't reset across deploy.

F-AUDIT-14 turned out to be a false positive — `getPreviousHash` IS used by `integrity-hash-retry.ts:110` (Petter's earlier F-A-002 fix made it actively used).

Migration 0055 applied + verified live (column + partial index exist; backfill ran; `verify-0055.ts` confirmed).

**Closed remainder summary:** every line item from CCO P0 (8/8) + CTO CRIT (11/11) + CTO MED (10/10) + SESSION_F findings (16/18 closed; F-AUDIT-14 false positive; F-AUDIT-15 partial closure with full removal explicitly deferred) + CTO world-class #2/6/7/9. Still explicitly deferred per audit's deferred list: external Merkle anchor (#1), dispute endpoint (#3), methodology page rewrite (#4), token revocation (#5), SDK typed helpers (#8), tamper-detection integration test (#10).

**Final session totals:** 26 commits across 2 repos (24 strale + 2 strale-frontend), 4 production schema migrations applied + verified live (0052, 0053, 0054, 0055), 80 tests passing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
