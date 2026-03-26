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

### Retired env vars (safe to remove from Railway)

- `OPENSANCTIONS_API_KEY` — Replaced by `DILISENSE_API_KEY` on 2026-03-25.
  Zero codebase references remain. Remove from Railway Variables.

### Build configuration

- Build command: `npm run build`
- Start command: `node apps/api/dist/index.js`
- Health check: `GET /health`
- Dockerfile: `apps/api/Dockerfile`

---

## chromium (Browserless v2)

### Required env vars

| Variable | Value | Purpose |
|---|---|---|
| `LAUNCH_ARGS` | `--no-sandbox --disable-dev-shm-usage --disable-gpu --disable-setuid-sandbox` | Required for Railway container sandbox |
| `TOKEN` | `<same as BROWSERLESS_API_KEY in strale>` | Auth token — must match |
| `CONCURRENT` | `10` | Max concurrent browser sessions |
| `TIMEOUT` | `30000` | Default timeout per session in ms |

### Critical notes

- **`LAUNCH_ARGS` is REQUIRED.** Without `--no-sandbox`, Chromium cannot
  access `/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor` and will
  crash on every render request (HTTP 500). This single missing flag takes
  down all 48 Browserless-dependent capabilities.
- The strale service connects via `BROWSERLESS_URL=http://chromium.railway.internal:8080`
- Health probe: `POST /content` with `data:text/html,<html><body>ok</body></html>`
  (not `/health` — the `/health` endpoint only checks the wrapper, not Chromium itself)
- Docker image: `ghcr.io/browserless/chromium`

---

## postgres (PostgreSQL)

### Notes

- Managed by Railway — no manual configuration needed
- Connection string available as `DATABASE_URL` in strale service
- Internal URL (for Railway services): `postgresql://...@postgres.railway.internal:5432/railway`
- Public URL (for local dev): `postgresql://...@metro.proxy.rlwy.net:51617/railway`
- Migrations: `cd apps/api && npx drizzle-kit migrate` (must be run manually after deploy)
- Schema validation: `src/lib/schema-validator.ts` checks required columns on startup
