# DRAFT — outreach emails (not sent)

**Status: DRAFT. Nothing here has been sent.** Each email names its owner
under DEC-20261027-A: **[D]** a session may send it from petter@strale.io once
the precondition holds, and must add an `OUTBOX.yaml` row the same session;
**[P]** Petter decides. No email here goes to a customer or prospect, and none
is derived from transaction data (CHARTER.md customer-data boundary).
Written 2026-10-27 for `docs/research/2026-10-27-distribution-strategy.md` §8.

---

## 1. Coinbase CDP — Bazaar curation (featured tier)

- **Owner:** [D] if Petter answers yes to research §9 item 1; otherwise [P].
- **Precondition:** experiment D2 deployed and the CDP validator returns
  `valid: true` with no advisory failures on at least the five sample routes
  below. Do not send before.
- **Channel:** CDP support **email only** (no form is documented). Not the
  CDP Discord or any forum: a message there is a public post, which is
  Petter's.

> Subject: Bazaar curation request — Strale (api.strale.io)
>
> Hello,
>
> We sell pay-per-call tools over x402 at api.strale.io and would like to be
> considered for the curated tier of the Bazaar described in your "Get
> discovered" guide.
>
> - Live on Base mainnet with settled payments; 135 of our tools are in the
>   index today. [re-count on the day]
> - Every v2 route passes `POST /v2/x402/validate` with `serviceName`, tags,
>   icon, input and output examples. Sample routes: `/x402/v2/email-validate`,
>   `/x402/v2/vat-validate`, `/x402/v2/sanctions-check`,
>   `/x402/v2/company-status-check`, `/x402/v2/url-to-markdown`.
> - Category coverage: official company records by registration number in
>   25 countries, sanctions and PEP screening, EU VAT checks, plus web and
>   document tools. In Bazaar search today we are the top result for "PEP
>   check". [re-check on the day; drop the line if no longer true]
>
> Is there anything else you need from us to be reviewed?
>
> Petter Lindström
> Strale (Moonlighter AB) · petter@strale.io

Notes: no availability figure is quoted (`uptime-sla-percentage` and
`sla-commitment` are forbidden claims). If CDP asks for availability, answer
with the measured figure and its source, not a promise.

---

## 2. x402scan — origin description refresh

- **Owner:** [D]. Free registration with wallet sign-in; listing text is ours.
  Sign in with a dedicated zero-balance wallet created for directory accounts,
  its key stored in Bitwarden (project `strale`); never with the wallet that
  receives payments.
- **Precondition:** research D1 source texts merged.
- **Action, not email:** update the origin record at
  `https://www.x402scan.com/resources/register`; description = draft G short
  form from `01-listing-texts.md`. If an edit is not possible through the
  form, send:

> Subject: Update to the Strale origin description
>
> Hello, our origin "Strale API" (api.strale.io) shows a description from
> April that no longer matches the product. Could you replace it with:
> "Pay-per-call tools for agents: company records, sanctions and PEP
> screening, EU VAT and email checks, web page reading. Most tools payable
> over x402." Thank you. — Petter Lindström, Strale

---

## 3. 402 Index — domain claim

- **Owner:** [D]. API claim flow (`POST /api/v1/claim` → serve token →
  `POST /api/v1/claim/verify`); no email needed unless it fails.
- **Precondition:** none. After the claim, recategorise the "uncategorized"
  rows and replace names with draft H job lines.

---

## 4. Smithery — listing edit

- **Owner:** [D] for the edit through our own account; the listing is
  `strale/agent-tools`.
- **Text:** draft G from `01-listing-texts.md`; remove every mention of SQS,
  "dual-profile" and "never billed".
- **Fallback email** (only if the account cannot edit the listing):

> Subject: Correcting the description of strale/agent-tools
>
> Hello, the description on strale/agent-tools describes a scoring system we
> retired in May. We would like to replace it with the text below. Is that
> possible from our side, or can you update it? [draft G] — Petter Lindström,
> Strale

---

## 5. datacircle.dev — no new email

An open thread exists (`OUTBOX.yaml` id `datacircle-benchmark`, follow-up due
2026-11-10). Do not add a second email; when following up, add only that the
benchmark link to Strale should carry `?src=bench-datacircle` if they link to
our API, so their traffic is countable.

---

## 6. Clay — partner programme intake

- **Owner:** [P] (research §9 item 4; involves a partnership agreement).
- **Precondition:** D9 template live with at least three accounts calling.

> Subject: Integrations Partner Program — Strale (official company records)
>
> Hello, Strale returns company records by registration number from
> official business registers and register-backed sources in 25 countries,
> plus EU VAT checks and sanctions screening, per call. Clay users already
> call it through an HTTP API column with a published template [link]. We
> would like to discuss a native listing. — Petter Lindström, Strale

Claim note: "official business registers and register-backed sources" is the
needs-evidence-safe wording (some countries come through vendors that wrap the
register).
