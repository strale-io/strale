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

## Outstanding
- datacvr.virk.dk API access: application email sent to cvrselvbetjening@erst.dk
- Claude Chat memory: needs manual sync (message provided in session)
- MCP security wedge: identified as best activation channel, Reddit reply posted
- Allegro (Polish): northdata doesn't have it with a Polish KRS — edge case
- GDELT latency: works but 15-20s response times. Monitor after timeout fix deploys.
- Tier 2 capabilities not yet built: French BODACC events, USPTO patents, EPO patents
- Reddit reply: monitor for responses, follow up if asked about the quality signal approach
- KnowThat.ai + Dominion Observatory: added as watch items, not competitors
