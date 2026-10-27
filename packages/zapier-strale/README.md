# Strale for Zapier

Strale is a tool library for company lookups, EU VAT validation, name screening
and invoice issuer checks.

Pay per call with your Strale API key. The app is built locally and has not
been published.

## Usage

Replaying a Zap can repeat completed checks and charges. Review your Strale
transactions before rerunning; screening uses two separately billed checks.

Use a Strale checking step when a supplier or customer is added, or when
an invoice arrives. Results provide source evidence for a person to review.
Potential name matches do not establish identity or determine whether to pay.

| Action | Inputs | Mapped tools | Availability |
|---|---|---|---|
| Look Up a Company | Country, registration number or company name | `uk-company-data`, `swedish-company-data`, `norwegian-company-data`, `finnish-company-data` | Visible; name lookup in GB, NO and FI; SE requires a number |
| Check Company Status | Country, registration number | `company-status-check` | Hidden pending public availability |
| Check an EU VAT Number | EU VAT number including country prefix | `vat-validate` | Visible |
| Screen a Name | Person’s name, optional country context and birth date | `sanctions-check` then `pep-check` | Visible |
| Check an Invoice Issuer | Tax ID, optional country, registry ID and invoice name | `invoice-counterparty-check` | Hidden pending public availability |

The action descriptions in the Zap editor are the listing action copy. They
are defined with the fixed inputs, output fields and samples in `lib/jobs.js`.
That platform-independent module is exported as `zapier-strale/jobs` for
later n8n and Sheets adapters. It accepts an injected executor returning a
completed Strale result. It never accepts an arbitrary tool slug from users.
The app name is **Strale**, category **Business Intelligence**. The opening
paragraph is its short listing description; the paragraph beginning “Use a
Strale checking step” is its long description. Copy is narrowed from the integration listing draft to
match the actual schemas; invoice output has no generated summary or verdict,
and name screening has no numerical match score.

Name lookups in GB, NO and FI return the best fuzzy match; check the returned
`registration_number` before relying on the result. Company lookup returns
name, status and address where supplied. Status
checks include whether insolvency was checked and the notice count. VAT
returns validity, country and available company details. Screening returns
separate match counts, matches, lists, source and source times for both
checks. Invoice issuer returns each check’s status, available tax and registry
fields, name comparison, findings and completed/unavailable/errored check
lists. Missing evidence stays empty, rather than becoming a negative result.
Arrays and structured list evidence are JSON strings with named output fields.

## Connect and test locally

Use Node.js 20.12.1 or later for local tests and CI; Zapier uses Node.js 22
for its runtime. From the repository root:

```sh
npm ci
npm test --workspace=packages/zapier-strale
npm run validate --workspace=packages/zapier-strale
node apps/api/scripts/check-framework-packages.mjs
```

Core and the on-demand CLI are pinned to `19.2.1`, read from npm on 2026-10-27. Tests use
Zapier’s `createAppTester`, official app-schema validation and offline HTTP
fixtures with synthetic values following the manifests and real API envelope.
Network access is disabled during tests. No paid calls are made.

The workspace audit still reports vulnerabilities, including findings in
the production dependency tree, so they are not all dev-only. See the handoff
for the audit scope and follow-up.

Connect using the API key password field in Zapier. The auth test calls
`GET /v1/wallet/balance`; execution uses `POST /v1/do`. Every request includes
`Authorization: Bearer`, `X-Strale-Client: zapier-strale/<package version>`
and `?src=zapier`. Each call has a maximum price of 100 cents and a 20-second
requested execution timeout. A shared 25-second action deadline includes
transaction polling and both screening calls. If the second screening call
fails, the first may already have been billed. Pending responses are polled through the authenticated transaction endpoint.
If they remain pending at the deadline, the action halts with the transaction
ID; review it before rerunning. There is no payment-rail setup.

Caller-fix errors halt the action and display Strale’s `details.fix` or
`details.next_step`. Non-retryable caps halt; retryable rate limits delay the
Zap using the API retry delay or `Retry-After` header.
Invalid keys expire the connection and ask the user to reconnect. Temporary
service errors retain their error code and status for Zapier troubleshooting.
API keys have no automatic refresh endpoint.

## Starter Zaps (text only)

**Check every new supplier before first payment**

New supplier row in a sheet → Look Up a Company using country and registry
number → Check an EU VAT Number if supplied → write the returned evidence
back to the row → notify the owner to review missing records or mismatches
before deciding on the first payment. When public, Check Company Status can
also supply registry status and available insolvency evidence.
Screen a Name screens people only; use it for a supplier's individual person,
not for screening the supplier company.

**VAT check on every inbound invoice**

New invoice from an inbox or invoice parser → Check an EU VAT Number using
the parsed issuer VAT number → write validity, available name/address and
source to the invoice row → route invalid numbers or missing evidence for
human review.

## Publication handoff

No Zapier account, registration, push or public submission was made. Follow
[the handoff](../../handoff/_general/from-code/2026-10-27-zapier-integration.md)
for public GET results, remaining release checks and publishing instructions.
See [Zapier CLI docs](https://docs.zapier.com/integrations/build-cli/overview)
and [publishing requirements](https://docs.zapier.com/integrations/publish/integration-publishing-requirements).
