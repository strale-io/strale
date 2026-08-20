import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { ssl: false, max: 1 });

const result = await sql.begin(async (tx) => {
  const cap = await tx`
    UPDATE capabilities
    SET visible = true, x402_enabled = true, updated_at = now()
    WHERE slug = 'web-extract'
      AND is_active = true AND lifecycle_state = 'active'
    RETURNING slug, visible, x402_enabled, is_active, lifecycle_state, marketplace_eligible`;
  if (cap.length !== 1) throw new Error(`expected 1 row, got ${cap.length} — aborting`);

  const ev = await tx`
    INSERT INTO health_monitor_events
      (event_type, capability_slug, tier, action_taken, details, human_override)
    VALUES (
      'capability_promotion',
      'web-extract',
      1,
      'promoted_with_x402',
      ${tx.json({
        dec: "DEC-20260812-A",
        mode: "enforce",
        reason:
          "Root cause of the 2026-08-17 07:37 quarantine fixed and verified: max_tokens 4000→16000 + stop_reason refusal guard (PR #314, deployed 2d0da32). Replayed the exact failing extraction (IPT CMI-S full roster) against prod via /v1/do async — completed with ~18k chars of output where it previously died at the 4k truncation. avg_latency_ms corrected 5000→12000 (measured p95 37s) so /v1/do routes async. Quarantine reversal is platform-acts-alone per the escalation contract; deactivation proposal rejected — the capability had a bug, not rot.",
        enable_x402: true,
        verified_transaction_id: "d4ac930f-b181-4d72-a66c-732d4bd9843e",
        fix_pr: 314,
        deployed_sha: "2d0da32",
      })},
      true)
    RETURNING id, created_at`;

  return { cap: cap[0], event: ev[0] };
});

console.log(JSON.stringify(result, null, 2));
await sql.end();
