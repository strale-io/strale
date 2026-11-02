# Strale connector for Claude

Strale is a library of pay-per-call tools: company registry lookups, VAT,
IBAN and email checks, sanctions and PEP screening, web page reading, and
bundles that combine several checks in one call. The Strale connector lets
Claude find and run these tools inside a conversation.

- **Server URL:** `https://api.strale.io/mcp/connector`
- **Works in:** claude.ai, Claude Desktop, Claude mobile, Cowork and Claude Code
- **Privacy policy:** https://strale.dev/privacy
- **Support:** hello@strale.io

## Set it up

1. In Claude, open **Customize → Connectors** and add **Strale** from the
   directory. Before it is listed, choose **Add custom connector** and paste
   `https://api.strale.io/mcp/connector`.
2. Start using it. Searching the library, reading how sources are tested, and
   the free tools work straight away, with no account.
3. The first time Claude calls a paid tool, Claude shows a **Connect**
   button. Click it. A Strale page opens and asks for your Strale API key.
   No key yet? Get one at https://strale.dev/signup.
4. Paste the key and click **Allow**. You return to Claude, and the call
   that needed your account runs.

In Claude Code: `claude mcp add --transport http strale https://api.strale.io/mcp/connector`,
then run `/mcp` to connect your account when a paid tool asks for it.

## What connecting does

- Strale checks your key and stores nothing from it. Claude never sees the key.
- Strale creates a separate key named **Claude connector**, with a spending
  limit of €5 an hour, and Claude acts through that key. To use your own
  limits instead, paste an additional key you created with
  `POST /v1/api-keys`. Claude then acts through that key and its limits.
- Claude can run paid tools, which are charged to your Strale wallet, and
  read your balance and transaction records. It cannot top up your wallet,
  create or change keys, or manage your account.
- To disconnect, remove the connector in Claude, or revoke the
  **Claude connector** key with your primary key:
  `DELETE https://api.strale.io/v1/api-keys/{id}` (list keys with
  `GET /v1/api-keys`). Revoking the key ends the connection at once.

## Tools

| Tool | What it does | Needs a connected account |
|---|---|---|
| `strale_search` | Finds tools and bundles by keyword; lists each one's inputs and price | No |
| `strale_execute` | Runs a tool by its slug | Only for paid tools |
| `strale_getting_started` | Lists the free tools with example inputs | No |
| `strale_methodology` | Explains how sources are tested and what a result contains | No |
| `strale_trust_profile` | Current test and availability signals for one tool | No |
| `strale_transaction` | Reads the record of a past call | No |
| `strale_balance` | Your wallet balance | Yes |
| `strale_ping` | Checks the connection | No |

Prices are per call in EUR and shown by `strale_search` before anything runs.
Claude asks before running `strale_execute`, because a paid call spends from
your wallet.

The connector leaves out Strale's cryptocurrency tools.

## Example prompts

1. "Check whether the VAT number SE556703748501 is valid and which company it belongs to."
2. "Look up the Swedish company with organisation number 556703-7485 and tell me its status and registered address."
3. "Screen the company name 'Rosneft' against sanctions lists and tell me which lists matched."
4. "Is DE89370400440532013000 a well-formed IBAN?"
5. "Read https://example.com and summarise the page."

Screening results (sanctions, PEP, adverse media) are signals for a person to
review, not decisions about anyone.

## Troubleshooting

- **"This tool needs a connected Strale account."** Click **Connect** in
  Claude, or run `/mcp` in Claude Code.
- **"That key was not accepted."** Paste an active key that starts with
  `sk_live_`. If you lost it, recover it with `POST /v1/auth/recover`.
- **Free allowance reached.** Free tools share a monthly allowance per
  network address, and Claude's servers send many users' calls from the
  same addresses. Connect your account; free tools then run without the
  shared allowance.
- **Spending limit reached.** The **Claude connector** key's hourly limit
  was hit. Raise it with your primary key
  (`PATCH /v1/api-keys/{id}`), or wait for the hour to pass.
- **Insufficient balance.** Top up at https://strale.dev.

Anything else: hello@strale.io.
