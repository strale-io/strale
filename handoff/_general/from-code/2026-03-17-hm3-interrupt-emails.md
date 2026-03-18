# HM-3: Interrupt Emails

**Intent:** Build time-sensitive interrupt emails for events that can't wait for the weekly digest.

**Date:** 2026-03-17
**Commit:** 3df3f57

## What Was Built

### `src/lib/interrupt-sender.ts`

**`sendInterruptEmail(payload: InterruptPayload): Promise<void>`**

- Always deduplicates: checks `health_monitor_events` for `interrupt_sent` events matching `slug+type` in last 24h
- Silently no-ops if `RESEND_API_KEY` not set
- Logs `interrupt_sent` (tier 2) event after successful send (used for dedup + audit trail)
- Reuses `sendDigestEmail` from `digest-sender.ts` (same Resend infrastructure)

**5 interrupt types with HTML templates:**

| Type | Subject | Triggered by |
|------|---------|--------------|
| `suspension_warning` | `⚠️ [slug] will be suspended in 24h` | lifecycle.ts at degradedDays ∈ [6,7) |
| `mass_failure` | `🔴 Mass failure — N capabilities affected` | test-runner.ts after batch (>10% and >5 failures) |
| `validation_failure` | `⏸️ [slug] failed validation` | Not yet wired — for validate-capability.ts |
| `billing_alert` | `🔴 Billing alert — wallet operations failing` | Not yet wired — manual trigger or future wallet error handler |
| `infrastructure_down` | `🔴 [service] down` | test-runner.ts dependency health checks |

### Wiring

**`test-runner.ts` — mass failure (after each batch)**
```typescript
// After lifecycle evaluation:
if (results.length > 0 && failed > 5 && failed / results.length > 0.10) {
  // counts most common failure classification, sends interrupt
}
```

**`lifecycle.ts` — suspension warning (degraded → approaching suspend)**
```typescript
// In evaluateLifecycle, degraded path:
if (degradedDays >= 6 && degradedDays < 7) {
  sendInterruptEmail({ type: "suspension_warning", capabilitySlug: slug, ... })
}
```
Includes `auto_suspend_at` timestamp and `reason` in the email body.

**`test-runner.ts` — infrastructure down (6h dependency health checks)**
```typescript
// In runHealthChecks:
if (criticalDown.length > 0) {  // browserless or anthropic is down
  sendInterruptEmail({ type: "infrastructure_down", ... })
}
```

### Deduplication Design

Before each send, queries:
```sql
SELECT id FROM health_monitor_events
WHERE event_type = 'interrupt_sent'
  AND created_at >= now() - interval '24h'
  AND details->>'interrupt_type' = $type
  [AND capability_slug = $slug]
LIMIT 1
```

If a row exists → skip send. Otherwise send, then log the event.

This means: at most 1 interrupt per slug+type per 24h. Platform-level interrupts (mass_failure, billing_alert, infrastructure_down) deduplicate by type alone.

## What Is NOT Wired Yet

- `validation_failure`: needs to be triggered from `validate-capability.ts` script when a gate-1 failure occurs on a new capability. Currently left for HM-4 or the next pipeline session.
- `billing_alert`: no automatic trigger. Can be sent manually via internal script or future wallet error handler.

## Manual Trigger Pattern

```typescript
import { sendInterruptEmail } from "./interrupt-sender.js";

// Validation failure (from validate-capability.ts)
await sendInterruptEmail({
  type: "validation_failure",
  capabilitySlug: slug,
  details: {
    failing_checks: ["output_field_reliability_exists", "output_schema_has_properties"],
    pass_count: 13,
    total_checks: 15,
  },
});

// Billing alert (manual)
await sendInterruptEmail({
  type: "billing_alert",
  details: {
    error: "Stripe charge failed: card_error",
    operation: "wallet_topup",
  },
});
```

## Next Session

- HM-4: Reply-to-act parser (`POST /v1/internal/health-monitor/reply`)
  - Parse APPROVE-N, REJECT-N, KEEP, RESTORE slug keywords
  - Wire to lifecycle management functions
  - Email forwarding alias setup
- Or: Wire `validation_failure` interrupt into `validate-capability.ts`
- Or: Deploy to Railway + set RESEND_API_KEY to test live emails
