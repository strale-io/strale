# Accounts, credentials and email: how sessions act for Moonlighter AB

Authority: DEC-20261027-A. Petter directed it in session on 2026-10-27: "as long as no spend is involved i'm ok with you taking such actions", and "if you send emails you also need to be responsible for monitoring my inbox. and this needs to work regardless of which claude account im working from."

This page is the procedure. Any session, Claude Code or Codex, on any Claude account, follows it. Nothing here depends on the memory of one account or one session.

## What a session may do without asking

- **Create free accounts** for Moonlighter AB: developer portals, free API tiers and public-data registries. It may accept their click-through terms.
- **Send email from petter@strale.io** to registries, vendors and data providers. The subject is always access, terms, permission, credentials or support for a source or tool.
- **Read the confirmation emails** those sign-ups send, and set up authenticator-app (TOTP) two-factor authentication.
- **Store every credential** in the Bitwarden Secrets Manager project `strale-portfolio`. Never store one anywhere else.

## What stays Petter's

- **Anything that costs money.** That includes entering card details and "free trials" that need a card.
- **Signed agreements with a named counterparty.** These are agreements that carry liability, audit rights, an indemnity or a signature. The session prepares the agreement and a one-paragraph summary, then puts it to Petter.
- **CAPTCHAs.** A session never solves or bypasses a CAPTCHA, and never uses a solving service. It fills the form up to the CAPTCHA and asks Petter to complete that step.
- **SMS or phone verification**, and **identity checks with personal documents**.
- **Public posts and listings.** These are one-way public acts (CHARTER.md).
- **Writing to customers or prospects.** The customer-data boundary in CHARTER.md is unchanged.

## Before a sign-up

1. **Check the inbox first.** Search petter@strale.io for earlier contact with the organisation. It is common that an account, key or request already exists. Both the Japanese NTA key and the HMRC application were found this way.
2. **Check the terms.** Read the provider's terms for resale, as the data-access rule DEC-20261023-A requires. A sign-up is not permission to resell, and `vendor-terms.ts` still records the terms before any executor is built.

## Credentials

- **Where they live.** Bitwarden Secrets Manager, EU region (`vault.bitwarden.eu`), project `strale-portfolio`. The machine account's access token is set as the environment variable `BWS_ACCESS_TOKEN` in each Claude cloud environment Petter uses. It is never set in the repository, a receipt, a handoff or chat.
- **Naming.** Use one secret per value, named `<provider>-<what>`, for example `nta-houjin-app-id`, `hmrc-client-secret` or `data-gov-in-api-key`. The note field holds the account email, the sign-up date and the purpose.
- **Keys the API needs.** These go to Railway. Until a Railway token is delegated, Petter adds the variable himself, and the session tells him the exact name and where in Bitwarden the value is. The variable is always registered in `config/env-manifest.yaml` first.

## Sending email and owning the reply

Every email a session sends, and every email Petter sends that a session drafted, gets a row in `docs/company/OUTBOX.yaml` in the same session. Each row records:
- who it was sent to;
- what was asked;
- the decision, track or tool it unblocks;
- the date it was sent;
- the date to follow up by.

The session that sends an email owns it until it is closed. After that, the daily run owns it.

## Inbox monitoring

This is part of every daily run (DAILY-RUN.md, Part 1), and of any session that sent email.

1. **Search the inbox, Junk Email included,** for replies to every row in `docs/company/OUTBOX.yaml` whose status is `awaiting_reply`. Junk matters: the datacircle.dev and probe402 threads both sat there unseen for weeks.
2. **Sweep the inbox and Junk** for new mail since the last run that concerns Strale's tools, sources, vendors, registries, accounts or listings. Ignore marketing and resellers.
3. **When a reply arrives:**
   - record it on the row: date, outcome, next step;
   - act on it if the action is within delegated authority;
   - otherwise put it to Petter through the decision queue or the brief.
4. **When a follow-up date passes without a reply:** send one polite follow-up if the matter is still open, and set the next date. After two follow-ups with no reply, put it to Petter.
5. **When a matter is finished:** close the row (`status: closed`, with the outcome).

## Working from any Claude account

The repository, Bitwarden and Petter's mailbox are the only state; each Claude account only needs a way in. On each Claude account Petter works from, set up these three things once:

1. Connect the **Microsoft 365** connector for petter@strale.io (claude.ai → Settings → Connectors). The account needs `Mail.ReadWrite` and `Mail.Send`.
2. In the cloud environment's settings, add the variable `BWS_ACCESS_TOKEN`, using the same token value.
3. Point the morning scheduled task at `docs/company/DAILY-RUN.md`. That keeps the inbox sweep running, whichever account owns the task.

A session that finds one of these missing says so once, in one line, and carries on with what it can do.
