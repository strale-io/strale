# Smoke Test: POST /v1/solutions/:slug/execute

## Step 0 — API key recovery

The `claude-test@strale.io` API key may be in an invalidated state from a prior recovery call.

1. Attempt: `curl -s https://api.strale.io/v1/wallet/balance -H "Authorization: Bearer $KEY"`. If 200 with expected balance (~170c minus prior charges), proceed.
2. If 401: regenerate via `POST /v1/auth/recover` with `{"email": "claude-test@strale.io"}` — check inbox for new key.
3. Alternatively, use the authenticated API key regeneration endpoint: `POST /v1/auth/api-key` with the current valid key.
4. Confirm the new key works via `GET /v1/wallet/balance` before proceeding.

## Pre-flight checklist

- [ ] Confirm deploy of the solution-execute commit has landed on Railway production
- [ ] Confirm test account balance (`claude-test@strale.io`, expected ~170c)
- [ ] Confirm `kyb-essentials-se` solution is active: `GET /v1/solutions/kyb-essentials-se` returns 200
- [ ] Have the Railway log viewer open in a separate tab

## Test procedure

### 1. Execute the solution

```bash
curl -s -X POST https://api.strale.io/v1/solutions/kyb-essentials-se/execute \
  -H "Authorization: Bearer $STRALE_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"org_number": "5591674668"}, "max_price_cents": 500}' | python3 -m json.tool
```

### 2. Verify response shape

- [ ] Response has `result` and `meta` top-level fields
- [ ] `result.transaction_id` is a UUID
- [ ] `result.solution_slug` is `kyb-essentials-se`
- [ ] `result.status` is one of `completed`, `partial`, `failed`
- [ ] `result.steps` is an object with capability slugs as keys
- [ ] `result.step_count` matches the number of keys in `result.steps`
- [ ] `result.price_cents` is 150 (or 0 if failed)
- [ ] `meta.audit.steps` is an array with per-step breakdown

### 3. Verify HTTP status

- [ ] HTTP 200 on success or partial success
- [ ] Error codes on failure match documentation

### 4. Check Railway logs

- [ ] `[solutions] execute start: { solutionSlug: "kyb-essentials-se", userId: "..." }` appears
- [ ] `[solutions] execute done: { solutionSlug: "kyb-essentials-se", status: "completed", ... }` appears
- [ ] No `[solutions] transaction update failed` errors

### 5. Verify database rows

Connect via Railway Postgres console or `psql`:

```sql
-- Transaction row
SELECT id, solution_slug, capability_id, status, price_cents, latency_ms,
       audit_trail->'stepsSucceeded' as succeeded,
       audit_trail->'stepsFailed' as failed
FROM transactions
WHERE solution_slug = 'kyb-essentials-se'
ORDER BY created_at DESC LIMIT 1;

-- Verify XOR constraint
SELECT id, capability_id, solution_slug FROM transactions
WHERE solution_slug IS NOT NULL LIMIT 5;
```

- [ ] Row exists with `solution_slug = 'kyb-essentials-se'`, `capability_id IS NULL`
- [ ] `audit_trail` JSONB contains per-step breakdown
- [ ] Latency, price, status look reasonable

### 6. Verify wallet charge

```sql
SELECT amount_cents, type, description
FROM wallet_transactions
WHERE description LIKE 'Solution:%'
ORDER BY created_at DESC LIMIT 2;
```

- [ ] Charge row: `amount_cents = -150`, `type = 'purchase'`, `description = 'Solution: kyb-essentials-se'`

### 7. Verify balance

```bash
curl -s https://api.strale.io/v1/wallet/balance \
  -H "Authorization: Bearer $STRALE_TEST_KEY" | python3 -m json.tool
```

- [ ] Balance decreased by 150c from pre-test value

## Pass criteria

All seven steps clean, no errors in Railway logs, DB rows match expectations.

## Fail recovery

If the test fails:
1. Document what broke in a Journal entry
2. Manually refund the test account: `UPDATE wallets SET balance_cents = balance_cents + 150 WHERE user_id = (SELECT id FROM users WHERE email = 'claude-test@strale.io')`
3. Do NOT re-run until root cause is understood and fixed
