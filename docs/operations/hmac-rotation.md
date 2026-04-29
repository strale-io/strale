# HMAC audit-token secret rotation

The audit-URL HMAC secret (`AUDIT_HMAC_SECRET`) signs every shareable
compliance URL returned by `POST /v1/do` and the re-issue endpoint
`POST /v1/transactions/:id/audit-token`. Rotating it is standard
operational hygiene — and a regulatory expectation under several
compliance frameworks.

Pre-F-A-007, rotating the secret would have invalidated every
previously-issued audit URL globally. The two-key ring mechanism
added in F-A-007 makes rotation non-disruptive: the previous secret
continues to verify tokens for a grace window while the primary signs
all new tokens.

## How the secret is loaded — restart is mandatory

`AUDIT_HMAC_SECRET` and `AUDIT_HMAC_SECRET_PREVIOUS` are resolved at
module-import time in `apps/api/src/lib/audit-token.ts`. The values are
frozen for the lifetime of the Node process. Changing the env vars in
Railway's dashboard **does NOT** take effect on a running replica — you
MUST redeploy / restart. F-AUDIT-04: this is a latent footgun on any
host that doesn't auto-redeploy on env change. Railway does redeploy on
variable-set, so following the procedure below is sufficient on the
current host. If the deployment target ever changes, every step that
edits a variable must be paired with an explicit restart.

After step 4 below, verify the redeploy actually picked up the new
secret. The fastest check: hit `POST /v1/transactions/:id/audit-token`
to issue a new URL, decode the token portion, and confirm it does NOT
match what the previous secret would produce for the same payload.

## Rotation procedure

1. **Prep.** Generate a new secret:
   ```
   openssl rand -hex 32
   ```

2. **Set previous = current.** In Railway → `strale` service → Variables:
   ```
   AUDIT_HMAC_SECRET_PREVIOUS = <current AUDIT_HMAC_SECRET value>
   ```

3. **Set primary = new.** In the same place:
   ```
   AUDIT_HMAC_SECRET = <new value from step 1>
   ```

4. **Redeploy — and confirm the restart actually happened.** Setting a
   variable in Railway triggers a redeploy automatically. Wait for it
   to complete (Railway's UI shows "Deployed" with a fresh timestamp
   after the variable change). The audit-token module reads
   `process.env.AUDIT_HMAC_SECRET` exactly once, at import time
   ([audit-token.ts:37](../../apps/api/src/lib/audit-token.ts#L37)) —
   without the restart, the running replica continues to sign with the
   pre-rotation secret. If you're applying this procedure on a host
   that does not auto-redeploy on env change, manually restart the
   process. After redeploy, all new tokens are signed with the new
   secret; all pre-rotation tokens continue to verify via the
   fallback path.

5. **Monitor the grace window (60 days).** In prod logs, the `audit`
   route emits `usedFallback: true` on every verification that hit the
   previous-key path. Watch this to confirm legitimate pre-rotation
   tokens are still being served.

6. **Sunset the old key.** 60 days after step 4, unset
   `AUDIT_HMAC_SECRET_PREVIOUS` in Railway. Redeploy. Any tokens issued
   under the previous secret now fail with HTTP 410 / `token_expired`.
   Affected customers re-issue via
   `POST /v1/transactions/:id/audit-token` with their API key.

## Troubleshooting

**Step 4 deploy fails to start with "AUDIT_HMAC_SECRET is required".**
The new secret is <32 chars. Regenerate with `openssl rand -hex 32`
(64 hex chars) and retry.

**Step 4 deploy fails with "AUDIT_HMAC_SECRET_PREVIOUS ... must be at
least 32 characters".** The previous secret pasted into step 2 is
shorter than 32 chars — likely a copy-paste truncation. Re-check the
original value from the rotation-source (Railway variable history or
password manager).

**After step 6, a customer reports their audit URL is returning 410.**
Expected. Direct them to call
`POST /v1/transactions/:id/audit-token` with their API key to get a
fresh URL. If they don't have the `transaction_id` anymore, the URL
itself contains it (`https://strale.dev/audit/<txn_id>?...`).

## Related

- `apps/api/src/lib/audit-token.ts` — signing + verification logic
- `apps/api/src/routes/audit.ts` — `GET /v1/audit/:id?token=` handler
- Findings: F-A-006 (bounded expiry), F-A-007 (two-key rotation)
