# Activation Funnel Ground Truth — 2026-04-06

## 1. Funnel Stages

### Stage 1: First Touch
- **Where:** strale.dev landing page, Dev.to posts, GitHub README, MCP client tool discovery, Glama/Smithery/mcp.so listings
- **What they see:** "5 capabilities are free with no account. Try them now →" with interactive FreeTierShowcase
- **CTAs:** "Get API Key (free)" → /signup, "Try free — no signup" → /docs#free-tier
- **Data captured:** Nothing until they make an API call

### Stage 2: First API Call (anonymous free tier)
- **Where:** `POST /v1/do` with no auth header
- **What they see:** Full execution result + `upgrade` block with contextual nudges + `usage` block showing daily call count
- **Data captured:** Transaction row in DB with `user_id: NULL`, `is_free_tier: true`, IP hash in `audit_trail.request_context.ipHash`
- **Limits:** 10 calls/day per IP (in-memory counter, resets at midnight UTC). **NOTE:** The limit is currently reported but NOT enforced — a TODO comment at do.ts:902 says "For now, just report the counter — don't block requests over the limit"

### Stage 3: Hitting the free tier "limit"
- **Where:** After 10+ calls per day
- **What they see:** Usage counter shows `calls_today: 11, daily_limit: 10` but **calls still succeed**. Rate limit headers are set but no 429 is returned.
- **Data captured:** Counter is in-memory, not persisted

### Stage 4: Signup
- **Where:** `POST /v1/auth/register` with `{email, name?}`
- **Requirements:** Email only. No password, no card.
- **What they get:** API key (shown once), €2.00 trial credits, `getting_started` block with 3 pre-built curl commands
- **Email sent:** Welcome email with API key, 1 free example, 3 paid examples, GitHub star CTA
- **Data captured:** User row, wallet row (200c), wallet_transaction (trial_credit)

### Stage 5: Activation drip (if no call after signup)
- **Day 2 (48h):** "Your API key is ready — try a free call" with IBAN validation example
- **Day 5 (120h):** "5 capabilities you can try for free" with all 5 listed
- **On first call:** "First call complete — here's what's next" with related capability suggestions

### Stage 6: First authenticated call
- **Where:** `POST /v1/do` with Bearer token
- **What happens:** If free-tier capability: no charge. If paid: deducted from €2.00 credits.
- **Data captured:** Transaction with user_id set, activation_completed_at updated, activation success email sent

### Stage 7: First paid call
- **Where:** Same endpoint, paid capability
- **What happens:** Wallet debited. Cheapest paid capabilities: €0.02 (sanctions-check, vat-format-validate, etc.)
- **€2.00 gets you:** 100 sanctions checks, or 40 VAT validations, or 2-3 company lookups

### Stage 8: Top-up / second paid call
- **Where:** Stripe Checkout (SANDBOX mode — not live). x402 USDC payments on Base.
- **What happens:** Stripe is sandbox-only. x402 is live but requires crypto wallet.
- **Gap:** No way to add real money via card right now.

## 2. Free Tier Mechanics

| Mechanism | Implementation | File:line |
|-----------|---------------|-----------|
| **Free capabilities** | 5 fixed: email-validate, dns-lookup, json-repair, url-to-markdown, iban-validate | `is_free_tier` column on capabilities table |
| **Daily IP limit** | 10/day per IP, in-memory counter, **NOT ENFORCED** (counter reported but calls not blocked) | do.ts:902 — TODO comment |
| **€2 trial credits** | 200 cents on signup, spent on any paid capability | auth.ts:13 — `TRIAL_CREDITS_CENTS = 200` |
| **Cheapest paid caps** | €0.02: sanctions-check, vat-format-validate, several utility caps | capabilities table `price_cents` |
| **Free cap rotation** | Fixed, not rotated | Hardcoded in DB `is_free_tier` flag |
| **When exhausted** | Usage block reports count but no hard block; upgrade nudge in response | do.ts:890-899 |

## 3. Welcome Email

**Subject:** "Your Strale API key"
**From:** Petter at Strale <petter@strale.io>
**File:** `welcome-email.ts:79-225`

**Content (text version):**
```
Hey,

Welcome to Strale. Here's your API key:

{apiKey}

Save it somewhere safe — this is the only copy. If you lose it, reply to this email and I'll help.

YOUR FIRST CALL (copy-paste into a terminal — takes 2 seconds):

curl -X POST https://api.strale.io/v1/do \
  -H "Authorization: Bearer {apiKey}" \
  -H "Content-Type: application/json" \
  -d '{"capability_slug": "iban-validate", "inputs": {"iban": "DE89370400440532013000"}, "max_price_cents": 100}'

That validates a German IBAN — free, no credits used.

THREE MORE THINGS TO TRY:

1. Screen a name against sanctions lists (€0.02):
[curl command with their API key]

2. Look up a Swedish company (€0.80):
[curl command with their API key]

3. Audit an npm package for vulnerabilities (€0.15):
[curl command with their API key]

Browse all 270+ capabilities: https://api.strale.io/v1/capabilities
Docs: https://strale.dev/docs

HELP US GET DISCOVERED:
If Strale is useful, a GitHub star helps us get listed in developer directories:
https://github.com/strale-io/strale

Questions? Just reply — this goes straight to me.

— Petter
Founder, Strale
https://strale.dev
```

**CTAs:** 4 curl commands (1 free + 3 paid), Browse capabilities link, Docs link, GitHub star link

## 4. Nudges and Error Messages

**Upgrade block (every free-tier response):**
```json
{
  "message": "You're using a free capability. Sign up for €2 free credits to access 270+ paid capabilities...",
  "signup_url": "https://strale.dev/signup",
  "paid_examples": [contextual based on input],
  "x402_note": "Or pay per call with USDC on Base — no signup needed."
}
```

**Contextual nudges (8 categories):** Privacy → GDPR tools, Banking → sanctions/KYB, Company → registry data, Crypto → smart contract audit, E-commerce → Trustpilot, Tech → package audit, Business email → domain reputation, IBAN → country-specific KYB.

**Error nudges (also in free-tier error responses since commit 765602f).**

## 5. Landing Page CTAs

**File:** `strale-frontend/src/pages/Index.tsx`

| CTA | Target |
|-----|--------|
| "Get API Key (free)" | /signup |
| "Try free — no signup" | /docs#free-tier |
| "Try it free" | /docs#free-tier |
| "Get your API key" | /signup |
| "Read integration guide" | /docs |
| FreeTierShowcase (interactive) | Live API calls, no auth |

## 6. Tracking Inventory

| Question | Can we answer it? | How |
|----------|-------------------|-----|
| How many anonymous IPs called in last 7 days? | **Yes** | `transactions` WHERE `user_id IS NULL AND is_free_tier = true`, group by IP hash from audit_trail |
| Which capabilities each IP called? | **Yes** | JOIN capabilities on capability_id |
| Which IPs came back a second day? | **Yes** | COUNT(DISTINCT DATE(created_at)) per IP hash |
| How many signups in last 14 days made a call? | **Yes** | JOIN users → transactions. **Answer: 1** (only our test account) |
| How many signups made 2+ calls? | **Yes** | Same query with COUNT >= 2. **Answer: 1** |
| What's the conversion rate from anon → signup? | **No** | Can't link anonymous IP hash to a later signup (IP hash on signup is stored in `users.signup_ip_hash` but we'd need to match it against transaction IP hashes) |
| Which Dev.to post drove which visitor? | **No** | No UTM tracking, no referrer in most programmatic calls, Umami just installed |

**Umami:** Script tag installed in frontend (2026-04-03), but **zero custom events configured**. No `data-umami-event` attributes found in frontend code. Umami tracks pageviews and referrers only.

## 7. The Anonymous IPs

Top 15 anonymous IPs (last 14 days):

| IP (anon) | Calls | Caps | Days | Period | Capabilities |
|-----------|-------|------|------|--------|-------------|
| acde8cd4**** | 23 | 3 | 2 | Apr 3-4 | dns-lookup, email-validate, url-to-markdown |
| 28d69354**** | 20 | 4 | 4 | Apr 2-5 | dns-lookup, email-validate, json-repair, url-to-markdown |
| 85a8e902**** | 17 | 4 | 4 | Apr 2-6 | dns-lookup, email-validate, iban-validate, url-to-markdown |
| 635b2cc6**** | 16 | 4 | 4 | Apr 2-5 | dns-lookup, email-validate, iban-validate, url-to-markdown |
| dde5d22d**** | 16 | 4 | 2 | Apr 4-5 | dns-lookup, email-validate, iban-validate, url-to-markdown |
| 9bf3bff3**** | 14 | 4 | 2 | Apr 4-5 | dns-lookup, email-validate, iban-validate, url-to-markdown |
| 93d62808**** | 14 | 4 | 4 | Apr 2-5 | dns-lookup, email-validate, iban-validate, url-to-markdown |
| 93fc935b**** | 13 | 4 | 2 | Apr 4-5 | dns-lookup, email-validate, iban-validate, url-to-markdown |
| adcd06d1**** | 13 | 4 | 3 | Apr 2-5 | dns-lookup, iban-validate, json-repair, url-to-markdown |
| 3dadb67f**** | 12 | 3 | 3 | Apr 3-5 | dns-lookup, email-validate, url-to-markdown |
| e4740bca**** | 12 | 2 | 4 | Mar 31-Apr 5 | email-validate, url-to-markdown |
| 6d680b01**** | 12 | 4 | 3 | Apr 2-4 | dns-lookup, email-validate, iban-validate, url-to-markdown |
| 012b3a0d**** | 12 | 4 | 3 | Apr 3-5 | dns-lookup, email-validate, iban-validate, url-to-markdown |
| 4a6f9fb2**** | 11 | 3 | 3 | Apr 2-5 | dns-lookup, email-validate, url-to-markdown |
| 4034e2a3**** | 10 | 4 | 2 | Apr 3-4 | dns-lookup, email-validate, iban-validate, url-to-markdown |

**Key observations:**
- Every top IP uses url-to-markdown and dns-lookup (the research toolkit)
- Most use all 4 of the non-json-repair free capabilities
- Multi-day retention is common: 8 of 15 returned for 3+ days
- Nobody uses only 1 capability — the minimum is 2

**Funnel conversion from this cohort:**
- 15 active anonymous IPs → 0 signups → 0 paid calls

## 8. Honest Assessment

If a new user lands on strale.dev from a Dev.to post right now, the path of least friction to a paid call is:

1. Click "Try free — no signup" → lands on /docs#free-tier
2. Copy a curl command from the FreeTierShowcase → makes a free call
3. See the upgrade nudge in the response JSON → maybe clicks signup URL
4. Fill in email → gets API key + €2.00 credits
5. Copy a paid capability curl from the welcome email → makes a paid call (€0.02-€0.80)

**Where the funnel actually breaks:**

**Break 1: Step 2 → Step 3.** The upgrade nudge is a JSON field in the API response. Programmatic `node` users (85% of our traffic) parse specific output fields and likely never read the `upgrade` block. The nudge is invisible to the actual audience.

**Break 2: Step 3 → Step 4.** There is no reason to sign up. The free tier has no hard limit (the 10/day cap is reported but not enforced). Users get everything they need without an account. The nudge says "sign up for 270+ paid capabilities" but the user came for url-to-markdown, not KYB.

**Break 3: Step 5 → Step 6 (top-up).** Even if someone exhausts their €2.00 trial credits, Stripe is in SANDBOX mode. They literally cannot add money. The only payment path that works is x402 USDC on Base, which requires a crypto wallet — not something a typical developer has set up for a $0.02 API call.

**The fundamental problem** is that the free tier fully serves the audience that's finding us (researchers, scrapers), while the paid capabilities serve an audience that hasn't found us yet (compliance teams, fintech devs). The funnel isn't broken — it's pointed at the wrong audience.
