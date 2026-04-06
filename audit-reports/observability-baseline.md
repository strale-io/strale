# Observability Baseline Audit — 2026-04-06

## 1. Existing Admin Surfaces

### Backend API (admin routes)
**File:** `apps/api/src/routes/admin.ts` (627 lines)
**Auth:** Bearer token via `ADMIN_SECRET` env var, constant-time comparison

| Endpoint | What it returns |
|----------|----------------|
| `GET /v1/admin/stats` | Users (total, 7d/30d signups), transactions (24h/7d/30d), revenue, top 10 capabilities, recent signups, 30-day daily volume |
| `GET /v1/admin/users` | All users with transaction counts and wallet balances |
| `GET /v1/admin/wallet-health` | Wallet distribution: exhausted/low/healthy counts |
| `GET /v1/admin/request-analytics` | MCP client breakdown, referrers, user agents, IPs, capabilities, payment methods, languages |
| `GET /v1/admin/platform-status` | Lifecycle states, circuit breakers, free tier health, suspended/validating caps, recent transitions, anomalies |
| `GET /v1/admin/external-transactions` | Detailed transaction log for external users (input, output, error, latency, user_agent, ip_hash) |
| `POST /v1/admin/digest` | Triggers daily digest email |

### Frontend admin UI
**None.** No admin page exists in the frontend repo. All admin data is API-only, consumed via curl or the daily digest email.

## 2. Data in DB — Surfaced vs Not Surfaced

| Data | Exists in DB | Table | Surfaced anywhere? |
|------|-------------|-------|---------------------|
| Daily capability call counts | Yes | `transactions` | Admin /stats (top 10 only), daily digest |
| By authenticated vs anonymous | Yes | `transactions.user_id` null check | Admin /external-transactions (implicitly) |
| Signup events with timestamps | Yes | `users.created_at` | Admin /stats (recent 10), digest |
| Signup referral source | **Partial** | `users.signup_ip_hash` only — no referrer | Not surfaced |
| Stripe payment events | Yes | `wallet_transactions` (type: top_up) | Not surfaced in any UI |
| x402 payment events | Yes | `transactions.payment_method = 'x402'` | Not surfaced |
| Solution execution counts | Yes | `transactions.solution_slug` | Digest (solutionExecutions section) |
| Top-up history | Yes | `wallet_transactions` WHERE type = 'top_up' | Not surfaced |
| Per-user activity timelines | Yes | `transactions` JOIN `users` | Not surfaced (admin /users has counts only) |
| Failed calls by error category | Yes | `failed_requests.failure_type` | Not surfaced |
| Test suite runs + outcomes | Yes | `test_results`, `test_run_log` | Digest (pass rate), admin /platform-status (test count) |
| SQS history per capability | Yes | `sqs_daily_snapshot` | Digest (grade changes), not in any UI chart |
| Circuit breaker state | Yes | `capability_health` | Admin /platform-status |
| Health events / auto-fixes | Yes | `health_monitor_events` | Not surfaced |
| Activation funnel stages | Yes | `users.activation_email_stage`, `activation_completed_at`, `first_transaction_at` | Not surfaced |

## 3. External Data — Integration Status

| Source | Integration today | Where |
|--------|------------------|-------|
| **Umami web analytics** | Script tag installed on strale.dev (Apr 3). **No API integration.** Public dashboard at cloud.umami.is but backend doesn't read from it. | Frontend only |
| **X / @strale_io** | **None.** No Twitter API integration. | Not connected |
| **GitHub stars/PRs** | **Yes.** `fetch-ecosystem.ts` queries GitHub API for 4 repos (stars, forks, issues, PRs, commits). Requires `GITHUB_TOKEN`. | Daily digest |
| **npm downloads** | **Yes.** `fetch-ecosystem.ts` queries npm API for strale-mcp, straleio, strale-semantic-kernel. | Daily digest |
| **PyPI downloads** | **Yes.** `fetch-ecosystem.ts` queries PyPI stats API for 7 packages. | Daily digest |
| **Dev.to post views** | **None.** No Dev.to API integration. | Not connected |
| **MCP registry statuses** | **None.** Glama, Smithery, mcp.so, official registry statuses are manually tracked in Notion. | Notion page only |
| **x402 ecosystem listings** | **None.** PR statuses tracked in Notion. | Notion page only |
| **Notion priorities/decisions** | **Yes.** `fetch-notion.ts` queries Decisions DB and Journal DB. | Daily digest |
| **Beacon scans** | **Yes.** `fetch-beacon.ts` queries Supabase. | Daily digest |

## 4. Cron Jobs and Aggregations

| Job | Frequency | Produces |
|-----|-----------|---------|
| **Test scheduler** | Every 5 min (DB-driven poll) | test_results, capabilities.matrixSqs updates, health_monitor_events |
| **Invariant checker** | Every 2 hours | Auto-fixes, health_monitor_events, capability updates |
| **Refresh stale scores** | Every 2 hours | capabilities freshness/SQS decay updates |
| **Activation drip** | Every 6 hours | Day-2 and Day-5 nudge emails |
| **Daily digest** | Manually triggered (POST /admin/digest) or scheduled | Email to petter@strale.io, digest_snapshots row |

**Missing scheduled jobs:**
- No automatic daily digest trigger (requires manual POST or external cron)
- No automated PR status checker
- No automated npm/PyPI download trend alerting

## 5. Daily Digest Sections

**File:** `apps/api/src/lib/daily-digest/render-email.ts`

| Section | Data source |
|---------|-------------|
| AI situation assessment | Claude Sonnet analysis of all data |
| Strategic focus | AI-generated priorities |
| Ship log (journal, commits, social) | Notion API + GitHub API |
| Platform activity (signups, calls, revenue) | `transactions` + `users` tables |
| Solution executions | `transactions` WHERE solution_slug IS NOT NULL |
| Platform health (breakers, test rate, SQS changes) | `capability_health` + `test_results` + `sqs_daily_snapshot` |
| Beacon activity | Supabase (scan counts, subscribers) |
| Ecosystem metrics (stars, downloads) | GitHub API + npm API + PyPI API |
| Distribution surfaces | Notion database |
| Priorities (unreviewed decisions, action items) | Notion databases |
| Scoreboard (totals) | All tables |

**Could the digest be a dashboard?** Yes — the data assembly (`gatherDigestData()`) already produces a structured `DigestData` object. A dashboard would call this function and render it as a web page instead of an email. The 8-source data aggregation is the hard part and it's already built.

## 6. Technical Options for a Dashboard

### Option A: Admin page in Lovable frontend
- Add a `/admin` route in the existing strale-frontend
- Fetch from `/v1/admin/stats`, `/v1/admin/platform-status`, etc.
- Auth: simple secret in URL param or localStorage (solo founder)
- **Pros:** Same stack, same deploy, no new infrastructure
- **Cons:** Lovable's no-code model makes complex dashboards harder

### Option B: Separate Next.js admin app
- Standalone Vercel project (e.g. admin.strale.dev)
- Fetches from admin API + Umami API + GitHub API directly
- Auth: environment variable or simple password
- **Pros:** Full control, can use charting libraries (recharts, Chart.js)
- **Cons:** Another deploy to maintain

### Option C: Metabase connected to Postgres
- Railway add-on or self-hosted container
- Direct SQL queries against production DB (read replica recommended)
- **Pros:** No code needed, powerful SQL-based exploration, embeddable
- **Cons:** Separate service, Railway hosting cost, read-replica needed for safety

### Option D: Extend the daily digest into an API
- Add `GET /v1/admin/digest-data` that returns the `DigestData` JSON directly
- Any frontend (or curl) can consume the same data the email gets
- **Pros:** Trivial to build (one new endpoint calling existing `gatherDigestData()`)
- **Cons:** Not a real dashboard, just JSON — needs a renderer

**Recommendation for solo founder:** Option D first (30 min to build), then Option A or B for visualization.

## 7. Honest Assessment

If Petter wanted one screen showing "what happened in Strale in the last 24 hours across all channels," here's what he could get today **without building anything new:**

**Available now (via admin API or digest email):**
- Signup count and emails ✅
- API call count, revenue, unique users ✅
- Top capabilities by call volume ✅
- Solution execution counts ✅
- Circuit breaker status ✅
- Test pass rate ✅
- SQS grade changes ✅
- GitHub stars/forks/PRs ✅
- npm/PyPI downloads ✅
- Beacon scan activity ✅
- Notion journal entries ✅
- Recent git commits ✅

**Missing — easy to add (hours):**
1. **Umami page views + referrers** — Umami has a REST API. One fetch to add to the digest. Would answer "where are visitors coming from?"
2. **Activation funnel metrics** — Data exists in `users.first_transaction_at` + `activation_email_stage`. One SQL query to count: signups → nudged → activated.
3. **Wallet health summary** — Already exists at `/v1/admin/wallet-health`. Not in the digest.
4. **Failed request demand signals** — Data in `failed_requests`. Not aggregated anywhere.

**Missing — medium effort (days):**
5. **Dev.to post metrics** — Requires Dev.to API integration (article views, reactions). New fetch module.
6. **X/Twitter mentions** — Requires Twitter API v2 integration. New fetch module + API key.
7. **Per-user activity timelines** — Data exists but no query to produce a "user journey" view.
8. **Payment event tracking** — Stripe webhook events are captured but not surfaced in any report.

**Missing — hard (weeks):**
9. **Real-time anonymous→signup conversion tracking** — Need to match IP hashes across `transactions` and `users` tables. Technically possible but privacy-sensitive.
10. **A/B testing for nudge effectiveness** — No framework exists. Would need variant tracking + outcome measurement.
11. **Cohort retention analysis** — Data exists in transactions but no query infrastructure for weekly cohort tables.

**The single biggest gap** is the lack of any visual dashboard. All the data exists and is aggregated — it arrives in a daily email. But there's no way to look at it on demand, filter by date range, drill into a specific user, or see trends over time. The daily digest is the dashboard, and it's an email.
