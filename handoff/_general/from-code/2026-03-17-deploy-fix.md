# Deploy Fix: Railway Build Failure

**Intent:** Diagnose and fix production 404 after pushing 8 commits.

**Date:** 2026-03-17
**Commit:** 91ca73f

## Root Cause

`resend` was added to `apps/api/package.json` in HM-2 but `package-lock.json` was never regenerated with the resolved entry. Railway runs `npm ci` (strict lockfile mode), which fails when a package is listed in `package.json` but has no resolved entry in the lockfile.

## Fix

Ran `npm install` at monorepo root → regenerated `package-lock.json` with the full `resend@6.9.4` entry → committed → pushed. Railway deployed `91ca73f` successfully in ~1 min.

## Production Status

All HM-2/HM-3/HM-4 + Phase 8 endpoints are now live:
- `POST /v1/internal/health-monitor/send-digest` → 401 (needs ADMIN_SECRET)
- `POST /v1/internal/health-monitor/send-interrupt` → 401
- `POST /v1/internal/health-monitor/reply` → 200 silently rejects unauthorized senders ✓
- `GET /v1/internal/platform-status` → 401
- `POST /v1/internal/capabilities/:slug/publish` → 401
- `POST /v1/internal/capabilities/:slug/suspend` → 401

## Next Session

1. **Set Railway env vars**: `RESEND_API_KEY`, `HEALTH_DIGEST_EMAIL`, `HEALTH_MONITOR_INBOUND`, `REPLY_WEBHOOK_SECRET`
2. **Test live digest**: send preview + real digest email once env vars are set
3. **lifecycle.ts KEEP check**: ~10 lines — add `suspension_override` event query before auto-suspend in `evaluateLifecycle()`
4. **Cloudflare Email Routing**: ops task — route `health-monitor@strale.io` → webhook
5. **Finance capability suite** (Sprint 9H): ~63 specced finance capabilities
6. **onboard.ts + smoke-test.ts**: Gate 1 validation + per-capability test runner
