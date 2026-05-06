# Railway Service Configuration Reference

Last updated: 2026-03-26

This file documents the expected Railway configuration for each service.
It is documentation, not automation — but it makes infrastructure config
visible in version control so changes can be reviewed in git history.

---

## strale (api.strale.io)

### Required env vars

See `src/lib/dependency-manifest.ts` for the authoritative provider list.
All provider env vars are validated at startup via `src/lib/schema-validator.ts`.

Key vars:
- `DATABASE_URL` — PostgreSQL connection string (set by Railway postgres plugin)
- `ANTHROPIC_API_KEY` — Claude API for AI-assisted capabilities
- `BROWSERLESS_URL` — Internal URL to Chromium service (`http://chromium.railway.internal:8080`)
- `BROWSERLESS_API_KEY` — Auth token (must match `TOKEN` on chromium service)
- `DILISENSE_API_KEY` — AML screening (sanctions, PEP, adverse media)
- `COMPANIES_HOUSE_API_KEY` — UK company data
- `SERPER_API_KEY` — Google search API
- `VOYAGE_API_KEY` — Embeddings for suggest/typeahead
- `ADMIN_SECRET` — Admin endpoint auth
- `AUDIT_HMAC_SECRET` — Transaction integrity hashing

### Optional / Rotation env vars

- `AUDIT_HMAC_SECRET_PREVIOUS` — Set during `AUDIT_HMAC_SECRET` rotation
  to keep pre-rotation audit URLs verifiable. Must be ≥32 chars. Unset
  after the grace window (typically 60 days). Runbook:
  `docs/operations/hmac-rotation.md`.

### Retired env vars (safe to remove from Railway)

- `OPENSANCTIONS_API_KEY` — Replaced by `DILISENSE_API_KEY` on 2026-03-25.
  Zero codebase references remain. Remove from Railway Variables.

### Build configuration

- Build command: `npm run build`
- Start command: `node apps/api/dist/index.js`
- Health check: `GET /health`
- Dockerfile: `apps/api/Dockerfile`

---

## chromium (Browserless v1, pinned)

### Pinned image

`browserless/chrome:1.61.1-chrome-stable` (Docker Hub). Pinned per Phase 3
of the 2026-05-04 chromium bug fix (commit `4b13d32` Phase 2 instrumentation;
this section's update is Phase 3 (Harden)).

### Why v1 (and not v2)

Browserless v2 OSS tier filters per-request launch flags through an
undocumented allowlist at the launch handler. Of the 4 flags Strale's
helper passes via `?launch=<base64 JSON>` (`--no-sandbox`,
`--disable-dev-shm-usage`, `--disable-gpu`, `--disable-setuid-sandbox`),
only `--no-sandbox` survived in production — the chromium service's own
debug log under v2 showed Chrome launched with just `--remote-debugging-port`,
`--no-sandbox`, `--disable-features=LocalNetworkAccessChecks`, and
`--user-data-dir`. `--disable-dev-shm-usage` is load-bearing on Railway's
small `/dev/shm`; without it Chrome's shared-memory setup fails and the
process aborts with SIGABRT, taking down every scraping capability.

v1 has no allowlist filter, but it DOES dedupe the per-request `?launch=args`
payload against its internal default-arg list and the `LAUNCH_ARGS` env. In
practice on the running v1 image, of the 4 flags Strale's helper encodes
(`--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`,
`--disable-setuid-sandbox`), only the first two reach Chrome's command line —
verified via the chromium service's own `browserless:chrome-helper Launching
Chrome with args` debug log on 2026-05-06. The other two are functionally
redundant: `--no-sandbox` subsumes `--disable-setuid-sandbox` (sandbox is
fully off), and `--disable-gpu` is a no-op in GPU-less Railway containers.
The helper still encodes all four — the contract is helper-side, not
service-side. If the running v1 minor changes deduping behaviour and the 2
load-bearing flags (`--no-sandbox` and `--disable-dev-shm-usage`) stop
reaching Chrome, the chromium-side debug log is the operational signal.

v1 also honors `LAUNCH_ARGS` as an env-var fallback — belt-and-braces.

Phase 2 journal (root cause, Browserless v2 OSS-tier filtering):
https://www.notion.so/35867c87082c81cc87f4fc82e1f5ebba.

Phase 3 halt journal (v1 deduping behaviour, decision to accept):
https://www.notion.so/35867c87082c81a4a987e99d1ee564e8.

### When to revisit

Revisit this pin when (a) scraping caps migrate off Browserless per
DEC-20260421-C, or (b) Browserless v2 paid tier becomes commercially
justified. v1 receives no upstream security updates from the vendor —
the pin has finite useful lifetime, plausibly months. A reminder to-do
sits in the Notion To-do DB dated 2026-08-06.

### Required env vars

| Variable | Value | Purpose |
|---|---|---|
| `LAUNCH_ARGS` | `--no-sandbox --disable-dev-shm-usage --disable-gpu --disable-setuid-sandbox` | v1 fallback path; primary path is the per-request `?launch=` payload from `buildBrowserlessRequestUrl` in `apps/api/src/lib/browserless-launch.ts`. Keep this set so Chrome boots cleanly even on requests that bypass the helper. |
| `TOKEN` | `<same as BROWSERLESS_API_KEY in strale>` | Auth token — must match |
| `CONCURRENT` | `10` | Max concurrent browser sessions |
| `TIMEOUT` | `30000` | Default timeout per session in ms |
| `PORT` | `8080` | Chromium HTTP listen port. Must match the port in `BROWSERLESS_URL=http://chromium.railway.internal:8080` on the strale service. v1 default is 3000; we override so the Railway-internal URL stays stable. |

### Critical notes

- The 4 launch flags reach Chrome via two independent paths under v1: the
  per-request `?launch=` query (helper-driven, what Strale's code uses)
  and the `LAUNCH_ARGS` env var (fallback). Either is sufficient. v1
  dedupes both paths against its internal default-arg list (see "Why v1"
  above) — only the 2 load-bearing flags need to reach Chrome.
- The strale service connects via `BROWSERLESS_URL=http://chromium.railway.internal:8080`.
- Health probe: `POST /content` with `data:text/html,<html><body>ok</body></html>`
  (not `/health` — the `/health` endpoint only checks the wrapper, not Chromium itself).
- Docker image: `browserless/chrome` on Docker Hub (NOT `ghcr.io/browserless/chromium`,
  which is v2-only).

### Local development

For local dev, run the same chromium image under Docker Compose so you
do not consume browserless.io free-tier quota. The compose file is
`apps/api/docker-compose.dev.yml`; it pins the same v1 tag as production
(`browserless/chrome:1.61.1-chrome-stable`), maps host port `8080` to
the container's internal port `3000`, and uses `TOKEN=strale-browser-2026`.

```
docker compose -f apps/api/docker-compose.dev.yml up -d    # start
docker compose -f apps/api/docker-compose.dev.yml down     # stop
```

In `.env`:

```
BROWSERLESS_URL=http://localhost:8080
BROWSERLESS_API_KEY=strale-browser-2026
```

The browserless.io public hosted endpoint
(`https://production-sfo.browserless.io/chromium`) remains a documented
fallback only — its free tier is easily exhausted and on 2026-05-05 a
stale `BROWSERLESS_URL` default propagated to Railway production env
vars and degraded 32 scraping capabilities. Do not use the public
endpoint as a default in either dev or prod.

---

## strale-digest-cron (daily digest email)

Runs the daily digest job once per day and exits. Uses the same Docker image
as the `strale` service — only the start command and schedule differ.

### Service setup (one-time, in Railway UI)

1. In the same Railway project as `strale`, click **+ New → GitHub Repo** and
   select the same `strale` repo. This creates a second service from the same
   image build.
2. In the new service → **Settings**:
   - **Service name**: `strale-digest-cron`
   - **Build**: Dockerfile (same root `Dockerfile`, no changes needed — both
     `apps/api/dist/index.js` and `apps/api/dist/jobs/daily-digest.js` are
     produced by `npm run build --workspace=apps/api`).
   - **Custom start command**: `node apps/api/dist/jobs/daily-digest.js`
   - **Cron Schedule**: `30 5 * * *` (UTC, = 07:30 CEST summer / 06:30 CET
     winter — GitHub-style cron, Railway UI field under Settings → Deploy)
   - **Restart policy**: `Never` (it's a one-shot; exiting is success)
3. **Variables** tab → link to the shared project variables so it inherits:
   - `DATABASE_URL`
   - `RESEND_API_KEY`
   - `ANTHROPIC_API_KEY` (used by `analyzeDigest`)
   - `NOTION_TOKEN` (for ship-log / Notion activity)
   - `GITHUB_TOKEN` (for shiplog commit fetching, if configured)
   Any missing variable causes that section to fall back to its default;
   the email still sends.

### Notes

- No `ADMIN_SECRET` is needed — this service runs the digest directly, it
  does not call `POST /v1/admin/digest`.
- DST drift: the email arrives at 07:30 CEST in summer and 06:30 CET in
  winter. Railway cron is UTC-only; a ±1h shift twice a year is acceptable
  for an informational email.
- To trigger manually, either redeploy the service or click **Deploy** in
  the Railway UI — it will run the job once and exit.
- Logs: each run's stdout/stderr appears in the Railway logs tab for this
  service.
- Excludes from "External API calls" metric: `@strale.io`, `@strale.dev`,
  `@strale.internal`, `@example.com`, `petterlindstrom@hotmail.com`, the
  `system@strale.internal` user, and all `transparency_marker = 'algorithmic'`
  transactions (pure-computation capabilities).

---

## postgres (PostgreSQL)

### Notes

- Managed by Railway — no manual configuration needed
- Connection string available as `DATABASE_URL` in strale service
- Internal URL (for Railway services): `postgresql://...@postgres.railway.internal:5432/railway`
- Public URL (for local dev): `postgresql://...@metro.proxy.rlwy.net:51617/railway`
- Migrations: `cd apps/api && npx drizzle-kit migrate` (must be run manually after deploy)
- Schema validation: `src/lib/schema-validator.ts` checks required columns on startup
