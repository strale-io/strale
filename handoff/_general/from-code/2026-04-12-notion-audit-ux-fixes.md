Intent: Audit Notion workspace for accuracy against codebase, fix company-data UX issues from first real user.

## Done

### Notion cleanup
- Read all 8 sections + sub-pages. No stubs.
- Removed stale placeholder notes from 5 parent pages
- Added Rules 9-11 to governance (confirmed facts, done=archive, cross-cutting)
- Created Archive > Completed To-dos (34067c87-082c-814e-a45c-fa8d851c8f12)
- Moved 51 Done/Cancelled items out of To-do DB
- Added checklist step in CLAUDE.md for clearing done items

### Factual audit — 7 errors fixed
1. Test tiers inverted (A=pure-computation, C=scraping, not reverse)
2. SQS recovery immediate (not 3-5 days)
3. Stripe is LIVE (confirmed sk_live_ on Railway)
4. MCP HTTP is stateless (not session-based)
5. A2A cache is 1 hour (not 5 min)
6. rateLimitByIp (not rateLimitFreeTierByIp)
7. DEC-22 async fully implemented (was claimed missing)

Counts updated to 290+ everywhere (was 233/256/269/270 in various places).
Deleted stale memory files (capabilities.md, architecture.md).

### MCP Registry
- Published to GitHub MCP Registry via mcp-publisher
- Updated server.json schema to 2025-12-11

### Company data UX fixes (4 commits)
- All 18 company-data schemas: added company_name field, no required fields
- German: LLM expands abbreviations ("BMW" -> "Bayerische Motoren Werke AG")
- German: court auto-extracted from northdata HTML
- Polish: switched from broken Browserless KRS to northdata name search
- Error messages humanized (VIES, Danish quota, Browserless)

### User analysis
- kshitij.mandloi@gmail.com: only active external user, 27 calls, 78% failure rate
- Sent Reddit DM with fix summary + EUR 10 credit offer

## Phase 2: Company intelligence capabilities (same session, continued)

### 3 new capabilities built and live on production
- **sec-filing-events**: 8-K events from SEC EDGAR. Free API, no auth. Tested: Tesla → TSLA, 127 filings.
- **company-news**: Global news via GDELT. Free, 100+ languages, 15-min updates. Timeout set to 25s (GDELT is slow).
- **uk-filing-events**: Filing history from Companies House. Free with API key. Tested: Rolls-Royce → 1001 filings.

All three: manifests created, onboarded via pipeline, activated via admin PATCH.

### Admin endpoint extended
- PATCH /v1/admin/capability-schema now accepts lifecycle_state, visible, is_active
- Needed because onboarding creates capabilities as validating/invisible

### Langchain PR lint fix
- Pushed em dash fix to langchain-ai/docs PR #3445 (Vale LangChain.DashesSpaces)
- CI should pass now

### Reddit engagement
- Posted reply to r/AI_Agents "Where are your agents breaking in production?" thread
- Focus: silent data degradation, the missing data verification layer
- No product mention, following brand voice guidelines

## Phase 3: SDR Intelligence (same session, continued)

### 3 more capabilities built and live
- **tech-stack-detect**: Lightweight HTTP header + HTML pattern matching (replaces old Browserless+LLM version). Zero external cost. €0.03.
- **officer-search**: Company directors from UK Companies House, US SEC EDGAR, and EU northdata. Routes by country. €0.05.
- **email-pattern-discover**: DNS MX records + website scraping for public emails. Detects provider (Google Workspace, Microsoft 365). €0.03.

### Bundled solution live
- **company-intelligence-sdr**: 9-step solution, €2.50/call, global coverage
- Steps: SEC filings, company news, officers, tech stack, email patterns, domain reputation, job board search, social profile check, WHOIS
- Tested on production: 7/9 passing (SEC fails for private companies, GDELT rate-limited)
- Country-specific variants (US, UK, EU) added to Notion To-do as P1

### Admin infrastructure
- Extended PATCH /v1/admin/capability-schema to accept lifecycle_state, visible, is_active
- Added POST /v1/admin/create-solution endpoint (with step insertion)

### Reddit engagement
- Posted in r/AI_Agents "Where are your agents breaking in production?" — silent data degradation angle
- Posted in r/SaaS "APIs you secretly hate" — email validation free-tier angle

## Session totals
- **19 commits** pushed to main
- **6 new capabilities** built and live (sec-filing-events, company-news, uk-filing-events, tech-stack-detect, officer-search, email-pattern-discover)
- **1 new solution** built and live (company-intelligence-sdr)
- **18 company-data schemas** updated on production
- **7 factual errors** fixed across Notion + CLAUDE.md + memory
- **51 to-do items** cleared from Notion
- **MCP Registry** published
- **Langchain PR** lint fix pushed

## Outstanding
- datacvr.virk.dk API access: application email sent, waiting for response
- Claude Chat memory: needs manual sync (message provided in session)
- Country-specific SDR variants: US, UK, EU (Notion To-do P1)
- GDELT reliability: rate-limited today, monitor
- test-solution-delete-me: orphaned DB row, needs manual cleanup
- Tier 2 capabilities not yet built: French BODACC, USPTO patents, EPO patents
- Kshitij: waiting for Reddit DM reply, offer EUR 10 credit if he responds
- Reddit: monitor both threads for engagement
- Allegro (Polish): northdata doesn't have it — edge case
