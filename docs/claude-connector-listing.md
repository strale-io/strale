# Claude connector directory: submission contents

The exact text for each step of the developer portal at
claude.ai/directory/manage (**Submit new → MCP connector**), as the
[requirements record](research/2026-10-29-claude-connector-directory-requirements.md)
lists them. This file is scanned by `npm run claims:check`. Change listing
text here first, then paste it.

Petter does the submission (DEC-20261027-B §9 item 2): a paid Claude plan,
the directory terms for Moonlighter AB, and the seven acknowledgements in
step 9.

## 1. Connection

- **How users connect:** Universal URL
- **Server URL:** `https://api.strale.io/mcp/connector`

## 2. Tools

Synced from the server. Eight tools, each with a title. Read-only:
`strale_search`, `strale_getting_started`, `strale_methodology`,
`strale_trust_profile`, `strale_transaction`, `strale_balance`,
`strale_ping`. Write (spends from the wallet): `strale_execute`. The portal
should flag nothing. If it flags a tool, stop and fix the server.

## 3. Listing

- **Server name:** Strale
- **One-liner:**

  Company registry lookups, VAT and IBAN checks, sanctions screening and web page reading for Claude, paid per call.

- **Description:**

  Strale is a library of pay-per-call tools that Claude can find and run in a conversation. It covers official company registry lookups in many countries, VAT, IBAN and email validation, sanctions, PEP and adverse-media screening, web page reading, and bundles that run several checks in one call, such as a supplier check.

  Searching the library and the free tools work without an account. Paid tools are priced per call in EUR and charged to your Strale wallet. The first time Claude runs one, you connect your Strale account by pasting your API key on a Strale page. Strale then gives Claude its own key with a spending limit of €5 an hour. Claude can run tools and read your balance and past calls. It cannot top up your wallet or manage your keys, and you can revoke its access at any time.

  Each result says which source it came from and when it was fetched. Screening results are signals for a person to review, not decisions about anyone.

- **Categories (1–5):** pick the closest matches in the portal's list, in
  this order: data or research, finance, business operations. The list is
  only visible inside the portal.
- **Documentation URL:** https://github.com/strale-io/strale/blob/main/docs/claude-connector.md
- **Privacy policy URL:** https://strale.dev/privacy
- **Support contact:** hello@strale.io
- **Icon:** the Strale mark from https://strale.dev/favicon.svg. If the
  portal asks for PNG, export it at 512×512.
- **Listing slug (permanent):** `strale`

## 4. Use cases

- **Primary use cases:**
  1. Check a supplier or customer before paying or onboarding: registry status, VAT number, sanctions screening.
  2. Validate an IBAN, VAT number or email address found in an invoice or a form.
  3. Read a web page and return its text for Claude to summarise.
- **What users need before connecting:** nothing for search and the free
  tools. For paid tools, a Strale API key from https://strale.dev/signup
  and a wallet balance.
- **Reads or writes:** reads only. The one write is the charge for a paid
  call to the user's own Strale wallet.

## 5. Company

- **Company name:** Moonlighter AB
- **Website:** https://strale.dev
- **Primary contact for review updates:** petter@strale.io

## 6. Authentication

- **Authentication requirement:** Required when the server asks
- **Authentication method:** OAuth sign-in, with Claude registering itself
  (Client ID Metadata Document, or Dynamic Client Registration as the
  fallback). Do **not** choose Anthropic-held client credentials: the
  server has no client secret to hold.

## 7. Data handling

- **Underlying API:** our own, `https://api.strale.io`. It calls official
  registries and data vendors under their terms of use.
- **Personal health data:** no.
- **Sponsored content:** no.

## 8. Test and launch

Before this step, Petter adds the server as a custom connector in Claude
(**Customize → Connectors → Add custom connector**, URL above), runs each of
the example prompts below, and connects the reviewer account once. Then
paste:

  Connect the Strale connector, then try the example prompts. Search and the free tools (IBAN, email and DNS checks, page reading) work without an account. When Claude first runs a paid tool it shows a Connect button: click it, paste the reviewer API key below into the Strale page, and click Allow. The reviewer account holds a wallet balance for testing. strale_search shows each tool's price before it runs.

  Reviewer API key: [Petter pastes the reviewer account's key here. It is entered only in the portal, which shows it to reviewers alone, and is not stored anywhere else.]

**Example prompts** (policy §3E asks for at least three):

1. "Check whether the VAT number SE556703748501 is valid and which company it belongs to."
2. "Look up the Swedish company with organisation number 556703-7485 and tell me its status and registered address."
3. "Screen the company name 'Rosneft' against sanctions lists and tell me which lists matched."
4. "Is DE89370400440532013000 a well-formed IBAN?"
5. "Read https://example.com and summarise the page."

Tick "I have run every tool" only after the custom-connector test.

## 9. Compliance

Seven acknowledgements: directory guidelines, first-party API usage,
financial transactions, AI media generation, prompt injection, conversation
data collection, public documentation. Petter decides and ticks each one.
The facts behind them:

- **Financial transactions:** the connector does not move money or crypto.
  A paid call debits a prepaid EUR wallet that the user tops up outside
  Claude, through Stripe Checkout. Claude asks before every paid call,
  because `strale_execute` is marked destructive. The connector leaves out
  Strale's x402 payment route and its cryptocurrency tools.
- **First-party API:** every tool calls `api.strale.io`.
- **AI media generation:** none.
- **Prompt injection:** tool descriptions say what each tool does. Results
  carry no instructions to call other software.
- **Conversation data:** tools receive only their arguments. Strale logs
  which tool was called and the client's name, not the conversation.
- **Public documentation:** the documentation URL above.
