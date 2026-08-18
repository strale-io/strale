Intent: Dig into the web-extract `x402_not_on_rail` anomaly from the evening `/activity` check, verify the failure analysis, fix what was actually broken, and restore the capability to the rail.

## What the anomaly turned out to be

The 143 web-extract not_on_rail rejections were **the armed quality floor quarantining web-extract at 07:37 UTC** (health_monitor_events `quality_floor`/`quarantined`: completion 21% on 14 eligible calls/30d, deactivate_proposal flagged Petter-only). Timeline: the ipt.org roster buyer paid 8× via x402 at 07:14–07:18 (2 ok, 6 failed), the failures tripped the floor 19 minutes later, and everything after 07:40 was crawlers + the returning buyer hitting a delisted slug.

**Root cause was web-extract's own bug**: `max_tokens: 4000` on the Haiku extraction call with no `stop_reason` check — a ~100-name roster page truncates mid-JSON, `extractJsonObject` correctly refuses, the error classifies `internal`, the floor counts it. The floor worked exactly per DEC-20260812-A; the capability was defective.

**Corrections to the earlier /activity synthesis**: the "payment-ready EU/KYB demand" read was wrong — `x402_not_on_rail` is dominated by discovery crawlers walking the public catalog (one `node`-UA client hit 14 slugs within 200ms). The morning session had already flipped the real registries. product-reviews-extract's 404s were caller-hallucinated app-store package IDs → correct refusals, `caller_input`, no floor impact.

## Shipped (both merged to main + deployed, SHA `2d0da32`/`44522a6`)

- **PR #314** — web-extract `max_tokens` 4000→16000 + `CapabilityRefusalError` on `stop_reason==="max_tokens"` ("Extraction result too large for one call…", registered in `REFUSAL_MESSAGE_PATTERNS` → aligned across taxonomy `caller_input`, circuit breaker, quality-capture); product-reviews-extract same guard (2000→8000) + greedy-regex parse replaced with `extractJsonObject`; `content[0]` optional-chained in both (Anthropic `refusal` stop reason returns empty content); manifest limitations added; regression tests fail-before/pass-after verified twice (author agent + reviewer). Built by a Sonnet agent, reviewed/fixed/verified by the main session.
- **PR #315** — `since-last-ext.ts` now splits failed_requests into crawler-UA vs plain-client and lists top plain-client slugs, so future /activity runs don't read enumeration as demand. Built by a Haiku agent; review found + fixed a GROUP BY bug (failure_type → task) and hoisted the crawler regex.

## Prod operations (decide-then-tell, per charter)

1. **avg_latency_ms 5000→12000 on web-extract.** Declared 5000 routed it sync on /v1/do; the sync path runs the executor inside the wallet tx with a 15s idle timeout → any heavy page 500s (`internal_error`, and **no transaction row**). Measured p95 is 37s (completed-only mean is survivorship-biased). Now routes async. This was why the buyer's shape worked on x402 but died on /v1/do.
2. **Limitations synced to `capability_limitations`** via targeted INSERT (onboard --backfill aborts on pre-existing `output_schema` authority drift — see open threads).
3. **Verified the fix on the exact failing input**: IPT CMI-S full-roster extraction via /v1/do async → completed, ~18k chars of names (previously died at the 4k truncation). Transaction `d4ac930f-b181-4d72-a66c-732d4bd9843e`.
4. **Restored web-extract to the rail**: `visible=true, x402_enabled=true` + enforce-mode `promoted_with_x402` event (id `a3756a37`) in one transaction — the event clamps the floor's window so tomorrow's tick doesn't re-quarantine on the stale 21%. `POST /x402/web-extract` → 402 confirmed post-TTL.
5. **Deactivation proposal for web-extract: rejected** (recorded in the promotion event). It was a bug, not rot, and the proposer's evidence is now stale. Flagging here since the proposal was marked requires_human — veto if you disagree.

## Protocol compliance

- DEC-20260504-C: deploy verified by prod artifact (SHA via /health, live replay, DB rows), not logs.
- DEC-20260504-A discipline applied (not a numbered cert-audit finding): regression tests verified in both directions.
- Code-review gate: /code-review (high effort) run on both branches before merge; findings fixed on-branch. Full apps/api suite: 1873 passed; 10 pre-existing DB-integration timeouts (no DATABASE_URL in worktree), unrelated to the diffs.
- €-cost: ~€0.15 external (2 web-extract executions incl. one 18k-token extraction + 1 example.com call, test wallet), well inside envelope.

## Open threads

1. **~20 other LLM-backed executors** still have the fixed-max_tokens/no-stop_reason-check pattern — spawn_task chip filed ("Generalize LLM truncation guard across executors").
2. **onboard --backfill authority gate**: web-extract has pre-existing `output_schema` manifest↔DB drift that hard-aborts any backfill run. Needs its own reconciliation pass.
3. **Sync-path error shape**: the 15s idle-tx kill surfaces as opaque `internal_error` with no transaction row, though do.ts's Y-5 comment claims it maps to `timeout_exceeded`. Worth a look — it's an invisible failure mode (nothing in transactions, nothing for the floor, caller gets nothing actionable).
4. Journal entry written: Notion page `3bf67c87-082c-8193-8002-cd2f928b9816` (Journal DB, 2026-08-17).
