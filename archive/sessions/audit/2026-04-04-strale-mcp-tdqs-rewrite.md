# strale-mcp TDQS Audit — 2026-04-04

## Before (pre-rewrite scores)

| Tool | Purpose | Usage | Behavior | Semantic Params | Concise | Context | Total |
|---|---|---|---|---|---|---|---|
| strale_ping | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | 4/6 |
| strale_getting_started | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | 4/6 |
| strale_execute | ✅ | ⚠️ | ✅ | ✅ | ❌ | ✅ | 4/6 |
| strale_search | ✅ | ❌ | ❌ | ✅ | ❌ | ⚠️ | 3/6 |
| strale_balance | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | 3/6 |
| strale_methodology | ✅ | ❌ | ⚠️ | ✅ | ❌ | ⚠️ | 3/6 |
| strale_trust_profile | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | 5/6 |
| strale_transaction | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |

Average: 4.0/6

## After (post-rewrite scores)

| Tool | Purpose | Usage | Behavior | Semantic Params | Concise | Context | Total |
|---|---|---|---|---|---|---|---|
| strale_ping | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |
| strale_getting_started | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |
| strale_execute | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |
| strale_search | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |
| strale_balance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |
| strale_methodology | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |
| strale_trust_profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |
| strale_transaction | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/6 |

Average: 6.0/6

## Changes made

No parameter renames. All existing parameter names preserved: slug, inputs, max_price_cents, query, category, offset, transaction_id, type.

### strale_ping (4/6 → 6/6)
- Added usage guidance: "Call this before a series of capability executions to verify connectivity"
- Added auth context: "No API key required"

### strale_getting_started (4/6 → 6/6)
- Added usage guidance: "Call this on first connection"
- Fixed count: "271 paid capabilities"
- Shortened from ~55 words inline list to structured sentence

### strale_execute (4/6 → 6/6)
- Removed 12+ inline capability examples
- Added clear usage: "Use this when you need to perform any verification, validation, lookup, or data extraction"
- Added wallet check guidance: "check strale_balance first for high-value calls"

### strale_search (3/6 → 6/6)
- Removed verbose category listing (120+ words of inline examples)
- Added usage: "Use this when you need to find the right capability for a task"
- Added return shape: "slug, name, description, category, price in EUR cents, and current SQS quality score"
- Fixed count: "271 capabilities"

### strale_balance (3/6 → 6/6)
- Added usage: "Call this before executing paid capabilities to verify sufficient funds"
- Added auth context: "returns an auth instruction if none is configured"

### strale_methodology (3/6 → 6/6)
- Replaced dynamic template string with static description
- Added usage: "Call this when you need to understand how capability quality scores are computed"
- Added return shape: "Returns a markdown document covering..."

### strale_trust_profile (5/6 → 6/6)
- Tightened from ~70 words to ~55 words
- Preserved existing usage guidance and safety framing

### strale_transaction (6/6 → 6/6)
- No changes (already passed all criteria)

## Word counts (post-rewrite)

| Tool | Words |
|---|---|
| strale_ping | 47 |
| strale_getting_started | 56 |
| strale_execute | 80 |
| strale_search | 65 |
| strale_balance | 43 |
| strale_methodology | 60 |
| strale_trust_profile | 55 |
| strale_transaction | 45 |

All under 200 words. All in 43-80 range (target: 60-120).
