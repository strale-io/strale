---
description: Analyze recent external (non-test) activity on the Strale platform — calls, signups, x402 — and produce a short synthesis.
argument-hint: "[since-last | <N>d | today]   (default: today)"
---

# /activity — platform activity snapshot

Argument: `$ARGUMENTS` (empty = today, `since-last` = incremental, `7d` = N days, `today` = explicit today)

## What to do

1. **Pick the right scripts based on the argument**, then run them from `apps/api/`. All scripts need `--env-file=../../.env` (the root env file, not `apps/api/.env`):

   - **`since-last`** — run only `since-last-ext.ts`:
     ```
     cd apps/api && npx tsx --env-file=../../.env scripts/since-last-ext.ts
     ```
     This reads the last-checked timestamp from `.claude/state/last-activity-check.json`, shows activity since then, and updates the state file. If the user wants a preview without advancing the marker, add `--no-update`.

   - **`today`** or empty — run the three "today" scripts + daily context:
     ```
     cd apps/api && npx tsx --env-file=../../.env scripts/today-overview.ts
     cd apps/api && npx tsx --env-file=../../.env scripts/today-signups.ts
     cd apps/api && npx tsx --env-file=../../.env scripts/today-x402.ts
     cd apps/api && npx tsx --env-file=../../.env scripts/daily-ext.ts
     ```
     Run them in parallel in a single message.

   - **`<N>d`** (e.g. `7d`, `3d`) — run `daily-ext.ts`. It defaults to 3 days; for other windows, inline a quick SQL query via a one-off `tsx -e` or ask the user if they want the script updated.

2. **All queries already exclude internal emails** (`petter@strale.io`, `test@strale.io`, `test2@strale.io`, `system@strale.internal`) and `status = 'health_probe'` rows. Data reflects real external traffic only.

3. **After scripts complete, produce a synthesis** — 5 bullets max, covering:
   - Volume: total external calls + completed/failed split
   - Traffic mix: free-tier vs wallet vs x402 vs solutions
   - Signups: count + notable emails/balances
   - Notable patterns: failure bursts, single capability dominating, new users, unusual domains
   - Anything that needs follow-up (e.g. `failed_requests` spiking → capability gaps)

4. **Then inspect the actual inputs** — what emails, URLs, domains, IBANs, etc. are being checked, AND what people searched for on the capability/solutions pages. Run both in parallel:
   ```
   cd apps/api && npx tsx --env-file=../../.env scripts/window-inputs.ts <from-iso> <to-iso>
   cd apps/api && npx tsx --env-file=../../.env scripts/window-searches.ts <from-iso> <to-iso>
   ```
   - For `since-last`: use the window boundaries printed by `since-last-ext.ts` (from → to).
   - For `today`: use start-of-day CET to now.
   - For `<N>d`: use N days ago to now.

   `window-inputs.ts` reads `transactions` (what they actually called). `window-searches.ts` reads `suggest_log` (what they typed into the capability/solutions search boxes — includes `/v1/suggest` and `/v1/suggest/typeahead`).

   After both complete, produce a second short block — "What we're seeing":
   - Emails being checked: pick out real-looking vs synthetic; call out domain themes (corporate, country, industry)
   - URLs/domains: group by theme (which registries? which countries? which Fortune-500 names?)
   - IBAN fixtures: note country mix + any non-real fixtures (indicates synthetic test rig)
   - **Searches on the website**: top queries + any zero-result queries (these are direct capability-gap signals — someone wanted it, we didn't have it). Note which queries filter by `solution` vs `capability` vs both.
   - A one-line read on **who this looks like and what they're building** — e.g. "KYB agent targeting EU suppliers", "someone prototyping on free tier", "bot/scraper probing error cases", "browser user shopping for compliance solutions". Use judgement; flag capability gaps worth filling.

5. **Do NOT** synthesize before the scripts finish. Wait for actual numbers.

6. **Do NOT** invent metrics that aren't in the script output. If the user asks for something not covered (revenue, latency, etc.), say so and suggest adding a script.
