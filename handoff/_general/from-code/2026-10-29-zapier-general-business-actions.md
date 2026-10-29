Intent: Finish distribution T6 (D5) in code: five visible, typed Zapier actions positioned as general business tools, tested offline, and leave Petter the exact steps to push, publish and measure the app.

# What changed

`packages/zapier-strale` 0.1.0 (PR #778) shipped five actions, but two of
them (Check Company Status, Check an Invoice Issuer) were hidden because
their tools are not public. On 2026-10-29 `GET /v1/capabilities/<slug>`
still returned 404 for `company-status-check` and
`invoice-counterparty-check`, and 200 for `iban-validate` and
`email-validate`. So a listing would have shown three actions, one of them
name screening.

0.2.0 has five visible actions, each mapped to fixed tools:

| Action | Tool(s) |
|---|---|
| Look Up a Company | `uk-company-data`, `swedish-company-data`, `norwegian-company-data`, `finnish-company-data` (one per country) |
| Check an EU VAT Number | `vat-validate` |
| Check an IBAN | `iban-validate` (new) |
| Check an Email Address | `email-validate` (new) |
| Screen a Name | `sanctions-check` then `pep-check` |

Name screening is listed last, as one action of five, matching distribution
strategy §9 item 8. No template or listing text targets compliance or
finance teams. The two hidden actions were removed rather than kept hidden;
their mappings stay in git history (PR #778) for when the tools go public.
`iban-validate` and `email-validate` are free-tier tools, so an API-key call
to them does not debit the wallet today; the free status is not stated in
listing text because it can change. Free-tier authenticated calls still
record `client_meta`, including `X-Strale-Client`
(`apps/api/src/lib/do/dispatch.ts`, `executeFreeTierAuthenticated`), so they
count in the measurement below.

Listing short description (package description, 126 characters, starts
"Strale is a"): "Strale is a tool library for company lookups, EU VAT, IBAN
and email checks, and name screening. Pay per call with an API key."

Unchanged from 0.1.0: API-key auth tested with `GET /v1/wallet/balance`,
`X-Strale-Client: zapier-strale/<version>`, `?src=zapier`, a 100-cent
maximum price per call, the 25-second action deadline with polling and the
error mapping.

# Verification

See the PR for the command list and results. Offline tests use
`zapier-platform-core`'s `createAppTester` and `validateApp`, nock with
network disabled, and schema snapshots checked against the manifests. CI
runs them in the existing package test step.

# For Petter: publish on Zapier

Nothing below has been done; each step needs your Zapier account or a
public act. Times are yours to choose.

1. **Developer account.** Sign up at https://developer.zapier.com with
   petter@strale.io. Zapier requires an admin whose email is on the API's
   domain.
2. **Install.** On your computer, with Node.js 22 installed, open a
   terminal in a clone of the repository on `main` after this PR merges, then
   run each line:
   ```sh
   npm ci
   cd packages/zapier-strale
   npm test
   npx -y zapier-platform-cli@19.2.1 login
   npx -y zapier-platform-cli@19.2.1 register "Strale"
   npx -y zapier-platform-cli@19.2.1 push
   ```
   `login` asks for your Zapier email and password (or a deploy key).
   `register` asks for a description, homepage (`https://strale.dev`),
   category (choose **Business Intelligence**) and audience (choose
   **private**); it writes `.zapierapprc`, which git ignores. `push` uploads
   version 0.2.0. Expect "Push complete!".
3. **Private test.** In Zapier, make one Zap per action (five Zaps), connect
   Strale with a Strale API key, and run each once. Turn each on so a
   successful run stays in its history; Zapier's reviewers check for that.
   Paid calls cost a few cents each; IBAN and email cost nothing.
4. **Reviewer access.** Zapier's review needs a non-expiring Strale account
   with a small balance for `integration-testing@zapier.com`. Creating it is
   an account action, so it is yours.
5. **Submit.** Run `npx -y zapier-platform-cli@19.2.1 validate
   --fail-for-publishing`, fix anything it lists (or send the output to a
   session), then in the Developer Platform: Strale → Publish → fill in the
   form → Submit for review. Approval puts the app in public beta first.

# Measuring D5 (installs and weekly repeat callers)

D5 success: published, at least 5 accounts with live Zaps and at least 2
calling weekly by day 90. Kill: refused, or under 2 accounts 30 days after
publishing.

- **Installs and active users (Zapier side):** the integration's pages in
  the Developer Platform show users and Zap usage once it is live
  (confidence: moderate on the exact page names; read them after pushing).
- **Accounts and calls (Strale side), aggregate only:**
  ```sql
  -- Accounts and calls through Zapier per week (weeks start Monday, UTC)
  SELECT date_trunc('week', created_at) AS week,
         COUNT(DISTINCT user_id) AS accounts,
         COUNT(*) AS calls
  FROM transactions
  WHERE client_meta->>'client_header' LIKE 'zapier-strale/%'
    AND status = 'completed'
  GROUP BY 1 ORDER BY 1;

  -- Repeat callers: accounts calling through Zapier in at least 4 weeks
  SELECT COUNT(*) AS repeat_accounts FROM (
    SELECT user_id
    FROM transactions
    WHERE client_meta->>'client_header' LIKE 'zapier-strale/%'
      AND status = 'completed'
    GROUP BY user_id
    HAVING COUNT(DISTINCT date_trunc('week', created_at)) >= 4
  ) r;

  -- Calling weekly (the day-90 "at least 2" test): accounts with Zapier
  -- calls in each of the last 4 complete weeks
  SELECT COUNT(*) AS weekly_accounts FROM (
    SELECT user_id
    FROM transactions
    WHERE client_meta->>'client_header' LIKE 'zapier-strale/%'
      AND status = 'completed'
      AND created_at >= date_trunc('week', now()) - interval '4 weeks'
      AND created_at <  date_trunc('week', now())
    GROUP BY user_id
    HAVING COUNT(DISTINCT date_trunc('week', created_at)) = 4
  ) w;
  ```
  The first query's "4 weeks" is the D5 repeat-caller definition (same key
  in at least 4 weeks, at any time); the last one is the stricter weekly
  test for day 90.
  Exclude Strale's own test accounts with the `externalCustomers` rule in
  `apps/api/src/lib/metrics/commercial.ts`. Counts only; no outreach from
  these rows (charter customer-data boundary).
