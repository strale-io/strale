Intent: Add admin stats endpoint, signup webhook, and transaction milestone alerts

## What was done

### 1. GET /v1/admin/stats endpoint
- Protected by `ADMIN_SECRET` bearer token (separate from regular API key auth)
- Returns: user counts, transaction stats, revenue, top 10 capabilities, last 10 signups, 14-day daily volume
- 5-minute in-memory cache to avoid hammering the DB
- Returns 503 if ADMIN_SECRET not configured, 401 if invalid token
- File: `apps/api/src/routes/admin.ts`

### 2. Signup webhook
- Fire-and-forget POST to configurable `WEBHOOK_URL` env var on every new user registration
- Payload: `{ event: "user.signup", user: { email, created_at }, stats: { total_users } }`
- 5-second timeout, silent failure
- File: `apps/api/src/lib/webhook.ts`, modified `apps/api/src/routes/auth.ts`

### 3. Transaction milestone alerts
- Fires webhook at 10, 50, 100, 500, 1000 daily transactions
- In-memory Set tracks which milestones fired today, resets at midnight UTC
- Payload: `{ event: "milestone.transactions", milestone, date, total_transactions_today }`
- File: `apps/api/src/lib/milestones.ts`, modified `apps/api/src/routes/do.ts`

## Action required

**Set ADMIN_SECRET on Railway:**
The env var needs to be set via the Railway dashboard (CLI wasn't authenticated).

```
ADMIN_SECRET=7e95e1cdce0931e4c43295819ac3664ddde614064d6c9d364735a2be8a48cfe4
```

Once set, test with:
```
curl -H "Authorization: Bearer 7e95e1cdce0931e4c43295819ac3664ddde614064d6c9d364735a2be8a48cfe4" \
  https://api.strale.io/v1/admin/stats
```

Optionally also set `WEBHOOK_URL` to receive signup and milestone notifications.

## Technical notes
- Used `Array.isArray(res) ? res : res?.rows ?? []` pattern for postgres-js raw SQL results (same pattern as demand-signals route)
- All numeric SQL values cast to `::text` then `Number()` in JS to avoid BigInt serialization issues
