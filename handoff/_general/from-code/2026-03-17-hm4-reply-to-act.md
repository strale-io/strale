# HM-4: Reply-to-Act Email Handler

**Intent:** Build the reply-to-act system so the founder can approve, reject, or override platform actions by replying to digest and interrupt emails.

**Date:** 2026-03-17
**Commit:** 708fd3d

## What Was Built

### `src/lib/reply-parser.ts`

Parses the plain-text body of a reply email and extracts the first recognised action keyword.

```typescript
export function parseReplyAction(emailBody: string): ParsedReply
// Returns: { action, identifier?, slug?, cleanedText, rawText }
```

**Supported keywords** (case-insensitive):
- `APPROVE-N` / `APPROVE N` → `{ action: 'approve', identifier: N }`
- `REJECT-N` / `REJECT N` → `{ action: 'reject', identifier: N }`
- `ACKNOWLEDGE-N` / `ACK-N` → `{ action: 'acknowledge', identifier: N }`
- `KEEP` → `{ action: 'keep' }`
- `RESTORE slug` → `{ action: 'restore', slug: '...' }`
- (no match) → `{ action: 'unknown' }`

**Cleaning:** strips quoted lines (`>` prefix), signature markers (`-- `, `---`, `Sent from my`, `Get Outlook for`, `On ... wrote:`).

### `src/routes/reply-webhook.ts`

Endpoint: `POST /v1/internal/health-monitor/reply`

Registered at `/v1/internal/health-monitor/reply` in `app.ts`.

**Flow:**
1. Verify optional `X-Webhook-Secret` header (if `REPLY_WEBHOOK_SECRET` is set)
2. Parse JSON body: `{ from, subject, text, html? }`
3. Verify sender matches `HEALTH_DIGEST_EMAIL` (security-critical — rejects others silently with 200)
4. Rate limit: max 10 actions per hour (counts `reply_action` events in last hour)
5. Parse action keyword from `text`
6. Log `reply_action` event with raw text (audit trail)
7. Execute action
8. Send confirmation email back to the founder

**Actions:**

| Action | Behaviour |
|---|---|
| `APPROVE-N` | Looks up Nth pending `proposal_created` event → logs `proposal_approved` → tries to execute known action_type → confirmation |
| `REJECT-N` | Looks up Nth pending proposal → logs `proposal_rejected` → confirmation |
| `ACKNOWLEDGE-N` | Logs `proposal_acknowledged` → confirmation |
| `KEEP` | Identifies capability from subject ("X will be suspended in 24h") or last 48h interrupt event → logs `suspension_override` (lifecycle.ts should check this before auto-suspending) → confirmation |
| `RESTORE slug` | Sets `lifecycle_state='validating'`, `visible=false` → logs `lifecycle_transition` → confirmation |
| `unknown` | Sends "I didn't understand that" reply with valid command list |

**Proposal execution (for APPROVE-N):**
When `proposal.details.action_type === 'remove_field_assertion'`, the webhook executes it: removes the field from `validationRules.required_fields` in the test suite. Other action types log approval only (manual execution needed).

**Proposal numbering:** N is 1-based, ordered by `created_at ASC` on unresolved `proposal_created` events.

### `src/lib/digest-sender.ts` (updated)

- `sendDigestEmail(html, subject, toOverride?)` — added optional `to` override
- Reads `HEALTH_MONITOR_INBOUND` env var → sets `reply_to` on all sent emails
- This means **all digest and interrupt emails automatically get Reply-To** pointing to the inbound address once that env var is set

## Email Forwarding Setup (not automated — ops task)

Resend does **not** support inbound email. The webhook accepts a provider-agnostic JSON payload:

```json
{ "from": "petter@strale.io", "subject": "Re: STRALE PLATFORM HEALTH...", "text": "APPROVE-1" }
```

**Option A: Cloudflare Email Workers** (recommended if strale.io DNS is on Cloudflare)
1. Enable Email Routing for strale.io in Cloudflare dashboard
2. Create a route: `health-monitor@strale.io` → Email Worker
3. Write a tiny Worker (~20 lines) that extracts from/subject/body and POSTs to the API
4. Set `REPLY_WEBHOOK_SECRET` env var on both Railway and the Worker

**Option B: SendGrid Inbound Parse**
1. Set MX record for the inbound subdomain to SendGrid
2. Configure Inbound Parse webhook URL → `https://strale-production.up.railway.app/v1/internal/health-monitor/reply`
3. SendGrid's payload already has `from`, `subject`, `text` fields

## Env Vars Required for Activation

```
HEALTH_MONITOR_INBOUND=health-monitor@strale.io    # Reply-To on outgoing emails
HEALTH_DIGEST_EMAIL=petter@strale.io               # Authorized sender + digest recipient
REPLY_WEBHOOK_SECRET=<random-secret>               # Optional, recommended
```

## Lifecycle: KEEP and suspension_override

When `KEEP` is processed, a `suspension_override` event is logged with:
```json
{
  "override_type": "keep",
  "override_expires_at": "<24h from now>"
}
```

**TODO:** `lifecycle.ts` needs to check for a recent `suspension_override` event before triggering auto-suspension. Currently the lifecycle manager doesn't read this event. This is a small follow-up: add a check in `evaluateLifecycle()` that queries `suspension_override` events for the slug within the last 24h and skips suspension if found.

## What Was NOT Built

- Cloudflare Worker code (ops setup, not API code)
- `onboarding.ts` and `smoke-test.ts` scripts (listed in Onboarding Playbook as must-haves)
- `proposal_created` event emission (proposals are read but not yet written — ATI Rules TM-4, TM-5 need to be wired to emit these events)
- lifecycle.ts KEEP check (see above)

## Next Session

- **Deploy to Railway**: set `RESEND_API_KEY`, `HEALTH_DIGEST_EMAIL`, `HEALTH_MONITOR_INBOUND` → test live digest
- **Set up Cloudflare Email Routing** → test reply-to-act end-to-end
- **lifecycle.ts KEEP check**: add `suspension_override` event read before auto-suspend
- **Finance capability suite** (Sprint 9H): ~63 specced finance capabilities ready to build
- **onboard.ts + smoke-test.ts**: Gate 1 validation script + per-capability test runner
