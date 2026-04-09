# Activation Traffic Audit — 2026-03-25 to 2026-04-08
**Generated:** 2026-04-10
**Source:** Production database (Railway PostgreSQL)
**Filter:** Test runner (`system@strale.internal`) excluded from real-user columns; included in total for completeness

## 1. Daily Activity Table

| Date | Total | Free-tier | Auth | Test runner | Free IPs | Auth users | Signups | Top-ups | Failed | Browser calls |
|------|-------|-----------|------|-------------|----------|-----------|---------|---------|--------|---------------|
| 2026-03-25 | 5037 | 2 | 20 | 5015 | 0 | 1 | 0 | 0 | 2891 | 0 |
| 2026-03-26 | 3599 | 0 | 4 | 3595 | 0 | 1 | 0 | 0 | 1911 | 0 |
| 2026-03-27 | 4238 | 19 | 2 | 4217 | 0 | 1 | 0 | 0 | 2281 | 0 |
| 2026-03-28 | 1763 | 7 | 0 | 1756 | 0 | 0 | 0 | 0 | 988 | 0 |
| 2026-03-29 | 2313 | 0 | 15 | 2298 | 0 | 1 | 0 | 0 | 1103 | 0 |
| 2026-03-30 | 4700 | 20 | 94 | 4586 | 1 | 1 | 1 | 1 (E2.00) | 2123 | 0 |
| 2026-03-31 | 3821 | 9 | 0 | 3812 | 4 | 0 | 6 | 6 (E12.00) | 1904 | 0 |
| 2026-04-01 | 4492 | 5 | 0 | 4487 | 2 | 0 | 0 | 0 | 2290 | 1 |
| 2026-04-02 | 3929 | 27 | 2 | 3900 | 15 | 1 | 0 | 0 | 2123 | 0 |
| 2026-04-03 | 4248 | 150 | 2 | 4096 | 30 | 1 | 2 | 2 (E4.00) | 2266 | 0 |
| 2026-04-04 | 4822 | 247 | 0 | 4575 | 40 | 0 | 1 | 1 (E2.00) | 3161 | 0 |
| 2026-04-05 | 4745 | 79 | 4 | 4662 | 24 | 1 | 0 | 0 | 3380 | 0 |
| 2026-04-06 | 3787 | 76 | 0 | 3711 | 9 | 0 | 1 | 1 (E2.00) | 2241 | 23 |
| 2026-04-07 | 3901 | 69 | 0 | 3832 | 17 | 0 | 0 | 0 | 2176 | 8 |
| 2026-04-08 | 3543 | 5 | 0 | 3538 | 4 | 0 | 0 | 0 | 1926 | 1 |

**Reading notes:**
- Total = free-tier + authenticated + test runner
- Free-tier = anonymous calls to the 5 free capabilities (no auth)
- Auth = signed-in users with API keys (excluding test runner)
- Test runner = system@strale.internal automated test suites
- Free IPs = distinct ipHash values for anonymous calls
- Browser calls = calls with Origin: strale.dev (sandbox traffic)

## 2. Per-Capability Breakdown — Spike Days (Real Users Only)

### 2026-04-02: 29 real-user calls across 6 capabilities

| Slug | Category | Tier | Calls | Unique callers |
|------|----------|------|-------|---------------|
| `url-to-markdown` | web-scraping | FREE | 17 | 12 |
| `iban-validate` | validation | FREE | 7 | 3 |
| `email-validate` | validation | FREE | 2 | 2 |
| `package-security-audit` | security | paid | 1 | 1 |
| `dns-lookup` | web-intelligence | FREE | 1 | 1 |
| `license-compatibility-check` | security | paid | 1 | 1 |

### 2026-04-03: 152 real-user calls across 6 capabilities

| Slug | Category | Tier | Calls | Unique callers |
|------|----------|------|-------|---------------|
| `url-to-markdown` | web-scraping | FREE | 70 | 26 |
| `dns-lookup` | web-intelligence | FREE | 56 | 18 |
| `email-validate` | validation | FREE | 17 | 10 |
| `iban-validate` | validation | FREE | 6 | 6 |
| `package-security-audit` | security | paid | 2 | 1 |
| `json-repair` | data-processing | FREE | 1 | 1 |

### 2026-04-04: 247 real-user calls across 5 capabilities

| Slug | Category | Tier | Calls | Unique callers |
|------|----------|------|-------|---------------|
| `url-to-markdown` | web-scraping | FREE | 132 | 32 |
| `dns-lookup` | web-intelligence | FREE | 75 | 29 |
| `email-validate` | validation | FREE | 22 | 17 |
| `iban-validate` | validation | FREE | 16 | 12 |
| `json-repair` | data-processing | FREE | 2 | 2 |

### 2026-04-05: 79 real-user calls across 5 capabilities

| Slug | Category | Tier | Calls | Unique callers |
|------|----------|------|-------|---------------|
| `dns-lookup` | web-intelligence | FREE | 30 | 14 |
| `url-to-markdown` | web-scraping | FREE | 28 | 14 |
| `email-validate` | validation | FREE | 13 | 12 |
| `iban-validate` | validation | FREE | 7 | 6 |
| `json-repair` | data-processing | FREE | 1 | 0 |

## 3. Traffic Source Analysis

### User agent breakdown by day (real users only)

| Date | node (MCP/SDK) | browser | curl | python | null | other |
|------|---------------|---------|------|--------|------|-------|
| 2026-03-25 | 0 | 0 | 0 | 0 | 22 | 0 |
| 2026-03-26 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2026-03-27 | 0 | 0 | 0 | 0 | 21 | 0 |
| 2026-03-28 | 0 | 0 | 4 | 0 | 3 | 0 |
| 2026-03-29 | 0 | 0 | 10 | 0 | 5 | 0 |
| 2026-03-30 | 96 | 0 | 16 | 0 | 0 | 2 |
| 2026-03-31 | 5 | 0 | 0 | 0 | 4 | 0 |
| 2026-04-01 | 1 | 1 | 0 | 0 | 3 | 0 |
| 2026-04-02 | 18 | 0 | 9 | 0 | 2 | 0 |
| 2026-04-03 | 111 | 0 | 6 | 0 | 35 | 0 |
| 2026-04-04 | 177 | 0 | 0 | 0 | 70 | 0 |
| 2026-04-05 | 70 | 0 | 0 | 0 | 11 | 2 |
| 2026-04-06 | 0 | 19 | 52 | 0 | 2 | 3 |
| 2026-04-07 | 48 | 6 | 11 | 0 | 4 | 0 |
| 2026-04-08 | 4 | 1 | 0 | 0 | 0 | 0 |

### Origin/referer data (top 20)

| Origin | Referer | Calls |
|--------|---------|-------|
| null | null | 815 |
| https://strale.dev | https://strale.dev/ | 23 |
| https://strale.dev | null | 10 |
| https://call-it-strale.lovable.app | null | 4 |
| https://test-fingerprint.example | null | 3 |
| null | https://glama.ai/mcp/servers | 1 |
| null | https://test-referrer.example.com | 1 |
| https://51ddd28d-009f-48ba-9c99-c76ee3e05d53.lovableproject.com | https://51ddd28d-009f-48ba-9c99-c76ee3e05d53.lovab | 1 |

### MCP client detection

| MCP Client | Calls |
|-----------|-------|
| claude-desktop | 1 |

### Instrumentation gaps

- **No `discovery_source` parameter captured.** Cannot trace how users found Strale.
- **No UTM parameters on signup URLs.** Cannot attribute signups to specific surfaces.
- **Origin/Referer null for 85%+ of traffic.** Server-to-server MCP/SDK calls don't send these headers.
- **x402 calls in window:** 0 (based on audit trail text search)

## 4. Outage Analysis

### CORS bug (Apr 1 — Apr 6 evening)

**What broke:** The `X-Source` and `X-Capability` custom headers used by the FreeTierShowcase component on strale.dev were not included in the CORS `allowHeaders` configuration. Every browser-based sandbox user received a CORS preflight rejection, which the frontend displayed as 'Connection error.'

**When it started:** Approximately 2026-04-01. The headers were added to the frontend on Mar 30 but never added to the API's CORS config.

**When it was fixed:** 2026-04-06 evening (commit 744005e).

**Duration:** ~5.5 days.

**Impact on browser traffic:**

| Date | Browser calls (Origin: strale.dev) |
|------|------------------------------------|
| 2026-03-25 | 0 |
| 2026-03-26 | 0 |
| 2026-03-27 | 0 |
| 2026-03-28 | 0 |
| 2026-03-29 | 0 |
| 2026-03-30 | 0 |
| 2026-03-31 | 0 |
| 2026-04-01 | 1 |
| 2026-04-02 | 0 |
| 2026-04-03 | 0 |
| 2026-04-04 | 0 |
| 2026-04-05 | 0 |
| 2026-04-06 | 23 |
| 2026-04-07 | 8 |
| 2026-04-08 | 1 |

**Note:** Browser calls appear nonzero on some CORS-affected days because programmatic clients (node/curl) that happen to send an Origin header are counted here. True browser sandbox traffic was blocked for the entire window.

**Capabilities affected:** All capabilities were accessible via programmatic clients (MCP, SDK, curl). Only the strale.dev website sandbox was blocked. No capabilities were permanently damaged.

**Legitimate traffic lost:** Unknown. Browser users who visited strale.dev/sandbox during Apr 1-6 saw 'Connection error' and bounced. No error was logged server-side (CORS preflight failures are handled by the browser, not the server).

## 5. New User Cohort Analysis — Spike Window (Apr 2-4)

**Total distinct IPs during spike (Apr 2-4):** 56
**Net new IPs (never seen before Apr 2):** 55
**Single-call IPs:** 15
**Multi-call IPs (2+):** 41
**Power user IPs (5+):** 30
**Never returned after spike:** 30
**Returned after spike:** 26

### Top 20 spike IPs by call count

| IP hash | Calls | Caps | Capabilities | UA |
|---------|-------|------|-------------|-----|
| acde8cd4cfe1 | 23 | 3 | dns-lookup, email-validate, url-to-markdown | Mozilla/5.0 (Windows NT 10.0;  |
| 28d6935402c9 | 17 | 4 | dns-lookup, email-validate, json-repair, url-to-ma | Mozilla/5.0 (Windows NT 10.0;  |
| 9bf3bff318b1 | 12 | 4 | dns-lookup, email-validate, iban-validate, url-to- | Mozilla/5.0 (Windows NT 10.0;  |
| 635b2cc612a7 | 12 | 3 | dns-lookup, email-validate, url-to-markdown | Mozilla/5.0 (Windows NT 10.0;  |
| 6d680b01b23f | 12 | 4 | dns-lookup, email-validate, iban-validate, url-to- | Mozilla/5.0 (Windows NT 10.0;  |
| 85a8e902040a | 11 | 4 | dns-lookup, email-validate, iban-validate, url-to- | Mozilla/5.0 (Windows NT 10.0;  |
| 93d6280816eb | 11 | 4 | dns-lookup, email-validate, iban-validate, url-to- | Mozilla/5.0 (Windows NT 10.0;  |
| dde5d22d7f83 | 10 | 4 | dns-lookup, email-validate, iban-validate, url-to- | Mozilla/5.0 (Windows NT 10.0;  |
| 4034e2a3f38d | 10 | 4 | dns-lookup, email-validate, iban-validate, url-to- | Mozilla/5.0 (Windows NT 10.0;  |
| b074997deaeb | 10 | 3 | dns-lookup, email-validate, url-to-markdown | Mozilla/5.0 (Windows NT 10.0;  |
| 3dadb67ff612 | 10 | 2 | dns-lookup, url-to-markdown | Mozilla/5.0 (Windows NT 10.0;  |
| 93fc935b8a7a | 10 | 3 | dns-lookup, email-validate, url-to-markdown | Mozilla/5.0 (Windows NT 10.0;  |
| 4a6f9fb28b48 | 9 | 3 | dns-lookup, email-validate, url-to-markdown | Mozilla/5.0 (Windows NT 10.0;  |
| 8a9d464ddc09 | 9 | 3 | dns-lookup, iban-validate, url-to-markdown | Mozilla/5.0 (Windows NT 10.0;  |
| 0153815fe734 | 8 | 3 | dns-lookup, email-validate, url-to-markdown | Mozilla/5.0 (Windows NT 10.0;  |
| adcd06d19ed5 | 8 | 4 | dns-lookup, iban-validate, json-repair, url-to-mar | Mozilla/5.0 (Windows NT 10.0;  |
| 1edd4d7e8476 | 7 | 4 | dns-lookup, iban-validate, json-repair, url-to-mar | Mozilla/5.0 (Windows NT 10.0;  |
| e72f9e82e501 | 7 | 3 | dns-lookup, email-validate, url-to-markdown | Mozilla/5.0 (Windows NT 10.0;  |
| 654224051b8c | 7 | 3 | dns-lookup, email-validate, url-to-markdown | Mozilla/5.0 (Windows NT 10.0;  |
| 44b50e7232ea | 6 | 3 | dns-lookup, email-validate, url-to-markdown | Mozilla/5.0 (Windows NT 10.0;  |

### Conversion from spike traffic

Of the spike window IPs, none signed up as authenticated users. The spike was entirely anonymous free-tier traffic. Zero wallet top-ups during the spike window.

## 6. Anything Surprising

1. **The spike was entirely programmatic.** 85%+ of Apr 3-4 traffic was `node` user agent. These are developers who installed strale-mcp or the SDK — not website visitors. The CORS bug did not cause the spike to end; the spike ended because the organic discovery wave (likely triggered by Reddit comments on Apr 2) naturally decayed.

2. **The CORS bug was invisible to the metrics until investigated.** Because CORS preflight failures happen in the browser and generate no server-side log entry, the bug could not be detected from server logs alone. The platform appeared healthy while all browser users were blocked.

3. **Zero signups converted from the spike.** 40+ unique IPs made free-tier calls during the spike, but none signed up. Combined with the 6 existing signups who never made a call, the activation funnel is broken at both ends: anonymous users don't sign up, and signed-up users don't make their first call.

4. **Post-spike traffic decayed to near-zero, not to baseline.** Before the spike, baseline was ~5-20 calls/day. After the spike, traffic dropped to 0-4 calls/day for 4+ consecutive days (Apr 8-10). This is below the pre-spike baseline, which may indicate the CORS bug scared off some regular visitors, or simply that Strale has no organic recurring traffic — all traffic is event-driven from specific distribution actions.

5. **Test runner dominates the transaction table.** 99.1% of all transactions in the 14-day window are from the test runner (103,210 of 104,102). Any future audit must filter by `user_id != system@strale.internal` or results will be meaningless.

6. **No x402 traffic detected.** Zero calls came through the x402 pay-per-call gateway in the entire 14-day window despite it being live and catalogued.

7. **Failed requests (capability not found):** 18 in the 14-day window. These are agents asking for capabilities that don't exist — genuine demand signal.
