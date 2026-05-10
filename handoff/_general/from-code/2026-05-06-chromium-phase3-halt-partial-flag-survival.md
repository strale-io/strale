Intent: Phase 3 (Harden) of the 2026-05-04 chromium bug fix — pin chromium service to Browserless v1, re-flip strale env vars, verify all 4 launch flags reach Chrome unfiltered, run smoke + spot-checks. Halted at flag verification: only 2 of 4 flags survived under v1. Rolled back per protocol.

## What shipped (repo)

Commit `b547385`: `fix(chromium): pin to Browserless v1 (v2 OSS tier filters launch flags)`.

- `apps/api/railway-config.md`: documents the v1 pin (`browserless/chrome:1.61.1-chrome-stable`), the "Why v1" reasoning, the "When to revisit" criteria, and the `PORT=8080` env var requirement.
- `apps/api/docker-compose.dev.yml`: pinned to the same v1 tag for local dev; added `LAUNCH_ARGS` env-var fallback.
- `apps/api/src/lib/chromium-flag-filtering.test.ts`: 3 regression tests codifying the v2-filtering failure mode. Asserts the canonical 4-flag list reaches the encoded `?launch=` payload byte-for-byte. Per DEC-20260504-A.

Tests: 14/14 pass. Typecheck clean. `/health.commit = b5473857...` confirmed live in prod.

## What shipped (operations, by Petter)

Chromium service (Railway dashboard) flipped to `browserless/chrome:1.61.1-chrome-stable`. Service Online, listening on `:8080` (existing PORT mapping survived the image swap — v1 picked up the existing PORT env or defaulted appropriately). v1-style log keys present (`FUNCTION_BUILT_INS`, `WORKSPACE_DIR`, `Running on port 8080`).

## The observation that triggered halt

Strale-side `chromium-probe-url` log under v1 (post-flip, 19:48:43 UTC):
```
contentUrl="http://chromium.railway.internal:8080/content?token=<redacted>&launch=eyJhcmdzIjpbIi0tbm8tc2FuZGJveCIsIi0tZGlzYWJsZS1kZXYtc2htLXVzYWdlIiwiLS1kaXNhYmxlLWdwdSIsIi0tZGlzYWJsZS1zZXR1aWQtc2FuZGJveCJdfQ=="
```
Decoded: `{"args":["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-setuid-sandbox"]}` — all 4 flags reach the wire as expected (helper unchanged).

Strale-side probe result: `chromium-health-ok` at 19:48:44 UTC. Chrome rendered example.com successfully.

**Chromium service debug log** (the decisive observation under v1):
```
2026-05-06T19:48:43.477Z browserless:chrome-helper Launching Chrome with args: {
  "args": [
    "--no-sandbox",                         ← ours ✓
    "--enable-logging",                     (v1 default)
    "--v1=1",                               (v1 default — verbosity)
    "--disable-dev-shm-usage",              ← ours ✓
    "--no-first-run",                       (v1 default)
    "--remote-debugging-port=41643",        (v1 default)
    "--user-data-dir=/tmp/browserless-data-dir-hi0zzG"  (v1 default)
  ],
  ...
  "ignoreDefaultArgs": false,
  ...
  "executablePath": "/usr/bin/google-chrome"
}
```

**2 of 4 flags survived; `--disable-gpu` and `--disable-setuid-sandbox` are absent** from Chrome's launched args.

This pattern held for both the post-flip `?launch=`-bearing request AND a request without the `launch=` query param — meaning v1 is producing the same args list regardless of the per-request payload. v1 appears to be using its own internal default-arg list (which contains `--no-sandbox` + `--disable-dev-shm-usage` from the chromium service's `LAUNCH_ARGS` env var) and either dropping per-request supplemental args, or deduping against an internal allowlist that excludes `--disable-gpu` and `--disable-setuid-sandbox`.

Operationally, Chrome is NOT crashing. The two missing flags are functionally redundant with what's present:
- `--disable-gpu` → already implicit in `headless: "new"`; Railway has no GPU.
- `--disable-setuid-sandbox` → redundant when `--no-sandbox` is set.

The two flags that DID survive are exactly the load-bearing ones: `--no-sandbox` (avoids zygote+helper forks → no `pthread_create` EAGAIN) and `--disable-dev-shm-usage` (avoids small `/dev/shm` → no SIGABRT).

## Why I halted (rule conflict, surfaced to Petter)

Phase 3 prompt explicitly states:
> If the chromium-service debug log shows even ONE of the 4 flags missing from Chrome's `args`, halt. This is the "v1 doesn't fix it after all" scenario — escalate to chat for Phase 4 (probably `--single-process`).

Two flags are missing. Strict letter says halt. The rule was framed for "Chrome can't boot," which isn't what's happening here — Chrome boots cleanly, probe is green. But CC does not reconcile silently. Surfaced to Petter at the halt; my pre-authored wakeup conditional independently directed the rollback path. Both align: roll back env vars, leave chromium image pinned to v1.

## Production state at halt

- chromium service: `browserless/chrome:1.61.1-chrome-stable`, Online, listening :8080. **Pin stays.**
- strale API: env vars rolled back to hosted: `BROWSERLESS_URL=https://production-sfo.browserless.io`, original API key.
- `/health.commit = b5473857...` (Phase 3 commit).
- 32 scraping caps remain in pre-existing degraded state. No regression beyond pre-Phase-3 condition.
- Working tree clean. HEAD on `main` at `b547385`.

## Two paths forward — Petter to choose

1. **Accept v1's deduping behaviour, declare Phase 3 complete.** Operational evidence: probe green, Chrome boots, two missing flags are functionally redundant. Re-flip env vars to internal, run smoke + spot-checks, file post-close to-do, mark Phase 3 to-do Done. Document the v1-deduping behaviour as the new "expected steady state" in `railway-config.md` so future audits don't re-trigger the halt.

2. **Investigate why v1 isn't honouring the per-request `launch=` payload.** Cleanest path: set `ignoreDefaultArgs: true` in the `?launch=` payload so v1 uses ONLY our list verbatim. Code change in `apps/api/src/lib/browserless-launch.ts`:
   ```ts
   const LAUNCH_QUERY_PARAM =
     "launch=" +
     Buffer.from(JSON.stringify({
       args: BROWSERLESS_LAUNCH_ARGS,
       ignoreDefaultArgs: true,    // force v1 to use OUR list
     })).toString("base64");
   ```
   Then re-flip env vars, re-verify all 4 flags appear. Risk: setting `ignoreDefaultArgs: true` strips v1's `--user-data-dir` and `--remote-debugging-port` defaults — those would need to be added to our `BROWSERLESS_LAUNCH_ARGS` list, or v1 would fail to attach to the Chrome instance. This is non-trivial Phase 4 work.

Recommendation: path 1 is operationally correct and cheaper. The structural test in `chromium-flag-filtering.test.ts` already protects the helper-side contract. Document the v1-deduping behaviour and ship.

## Phase 2 instrumentation status

The `chromium-probe-url` log line (Phase 2's structural gate) continues to fire and stays useful regardless of which path Petter picks. The Phase 3 commit's regression test continues to guard the helper-side contract. Both stay in production.
