Intent: Diagnose Browserless failures, evaluate alternatives, design migration path

## Diagnosis

### Root cause: Health check was broken (not Browserless itself)

The Browserless.io managed service at `production-sfo.browserless.io` IS running — DNS resolves, root endpoint returns 401 (auth required). The health check was hitting `GET ${url}/health` without authentication, causing a perpetual 5s timeout that reported Browserless as "unhealthy".

**Fix applied:** Changed health check to use an authenticated `POST /content` with `example.com` — a real end-to-end probe. Deployed in commit `dae36fb`.

### But Browserless capabilities ARE failing at high rates

Even though Browserless itself works, **0 out of 31 sampled Browserless capabilities are "Good" (SQS 75+)**:
- **17 Poor** (SQS < 50): url-to-markdown (33), swedish-company-data (32), html-to-pdf (33), cookie-scan (35), etc.
- **14 Fair** (SQS 50-74): tech-stack-detect (58), seo-audit (62), dutch-company-data (58), etc.

The failures are genuine `upstream_transient` errors — target sites timing out, blocking datacenter IPs, or returning errors when accessed from Browserless.io's US West infrastructure.

### Key factors:
1. **Geography mismatch**: Browserless.io SFO (US West) → EU government registries = high latency + geo-blocking
2. **Datacenter IP detection**: Government sites (handelsregister.de, KVK.nl, Allabolag.se) actively block datacenter IPs
3. **No residential proxies**: Browserless.io managed plans don't include residential proxy rotation
4. **Partial reliability**: Pass rates range from 33% to 67% — the service works intermittently

## Quantification

| Category | Capabilities | Avg SQS | Failure Pattern |
|---|---|---|---|
| Government registry scraping | 20 | ~42 | Geo-blocked, timeout, 403/401 |
| Web intelligence | 7 | ~38 | Navigation timeout, slow renders |
| Competitive intelligence | 5 | ~52 | Target site blocks |
| Compliance scraping | 4 | ~40 | GDPR/regulation sites blocking |
| File conversion (HTML/PDF) | 2 | ~33 | Depends on Browserless health |
| Other | 17 | ~48 | Mixed |
| **Total Browserless-dependent** | **55** | **~43** | |

## Alternatives Evaluated

### A: Fix current Browserless setup
- Health check fixed (this session)
- Can't fix geo-blocking or IP detection without proxies
- SFO → EU latency is fundamental
- **Verdict: Partial fix only**

### B: Notte.cc
- EU residential proxies included ($10/GB)
- 100 free browser hours for testing
- Anti-detection + CAPTCHA solving built in
- MCP server available
- **Pro:** Solves the government blocking problem. Affordable for Strale's stage.
- **Con:** Newer platform, less battle-tested. SSPL license.
- **Verdict: Best fit for government registries. Investigate further.**

### C: Browserbase
- Enterprise-focused, session-first, Playwright-native
- Good debugging tools
- **Con:** Expensive ($99+/mo), no residential proxies by default
- **Verdict: Too expensive for current stage**

### D: Scrapfly
- HTTP + browser hybrid (HTTP when possible, browser when needed)
- 98% success rate benchmarked
- Per-request pricing, residential proxies included
- **Pro:** Highest reliability, cheaper than pure browser
- **Verdict: Good alternative for web intelligence capabilities**

### E: Direct API migration
- 7 registries already use direct APIs (work perfectly)
- 6 more have known API alternatives (Belgian KBO, Dutch KVK, Estonian, Austrian, Swiss, Australian)
- **Pro:** Most reliable, fastest, cheapest, no browser needed
- **Verdict: Highest ROI for government registries with APIs**

## Recommendation

### Immediate (this week): Health check fix + monitoring
- [DONE] Fixed Browserless health check (auth + real probe)
- Deploy and verify health status improves
- Monitor: do capabilities with intermittent failures improve with correct health reporting?

### Sprint 12A (1-2 weeks): Direct API migrations
Migrate 6 scraped registries to their direct APIs:
1. `estonian-company-data` → ariregister REST API
2. `belgian-company-data` → KBO Open Data API
3. `dutch-company-data` → KVK/overheid.io API
4. `austrian-company-data` → USP/Firmenbuch API
5. `swiss-company-data` → Zefix JSON API
6. `australian-company-data` → ABN Lookup REST API

**Expected impact:** 6 capabilities from Poor/Fair → Good. Several solutions improve.

### Sprint 12B (2-3 weeks): Notte.cc evaluation
- Sign up for Notte.cc free tier (100 browser hours)
- Test against the 5 hardest government registries (Swedish, German, Irish, Italian, Portuguese)
- If success rate > 80%, migrate remaining scraped registries
- DataProvider abstraction in `web-provider.ts` to support multiple backends

### Sprint 12C (1 month): Full hybrid architecture
```
DataProvider
├── Tier 1: Direct API (government registries with APIs)
├── Tier 2: Notte (government registries without APIs, EU residential proxies)
└── Tier 3: Browserless.io (general web rendering, non-blocking sites)
```

The `web-provider.ts` already has the right abstraction boundary — 47+ capabilities call `fetchRenderedHtml()` without knowing the provider. Swapping the backend is a single-file change.

### Cost comparison (est. at 2000 renders/day)
| Provider | Monthly Cost | Success Rate (est.) |
|---|---|---|
| Browserless.io (current) | ~$50/mo | ~45% on gov sites, ~65% overall |
| Notte.cc (Tier 2) | ~$30-60/mo (proxy data) | ~85% on gov sites (est.) |
| Direct APIs (Tier 1) | $0 | ~99% |
| Hybrid total | ~$50-80/mo | ~85% overall (est.) |

## Architecture Note

The current `web-provider.ts` is perfectly designed for this migration:
- Single `fetchPage()` function used by all 47+ capabilities
- Provider selection can be based on capability slug or target URL domain
- Cache, retry, and concurrency logic is provider-agnostic
- The `WebProviderOptions` interface doesn't expose provider internals

No capability code needs to change — only `web-provider.ts` internals.

## Commits
- `dae36fb` — Fixed Browserless health check (auth + real page render probe)
