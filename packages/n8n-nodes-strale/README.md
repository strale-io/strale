# n8n-nodes-strale

Strale for n8n. Look up a company in its national business registry, check an
EU VAT number, or screen a person's name, as a step in your workflow. Each
check is paid per call from your prepaid Strale wallet.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/)
workflow automation platform.

[Installation](#installation) · [Operations](#operations) ·
[Credentials](#credentials) · [Usage](#usage) · [Example workflows](#example-workflows) ·
[Compatibility](#compatibility) · [Resources](#resources) · [Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)
in the n8n community nodes documentation and install `n8n-nodes-strale`.

## Operations

| Resource | Operation | What it does | Strale tools used |
|---|---|---|---|
| Company | Look Up | Finds a company in the United Kingdom, Sweden, Norway or Finland by registration number, or by name outside Sweden. Returns its name, registration number, status and registered address. | `uk-company-data`, `swedish-company-data`, `norwegian-company-data`, `finnish-company-data` |
| VAT Number | Check | Checks an EU VAT number through VIES and returns whether it is valid, with the name and address where VIES supplies them. | `vat-validate` |
| Person | Screen Name | Screens a person's name against sanctions lists, then against politically exposed person lists. Returns potential matches for you to review. | `sanctions-check`, then `pep-check` |

Every result includes the source and the time it was fetched, and the Strale
transaction ID of each check.

The node offers these fixed operations only. It does not run arbitrary Strale
tools.

## Credentials

You need a Strale API key.

1. Create an account at [strale.dev](https://strale.dev) and top up your wallet.
2. Copy your API key from the dashboard.
3. In n8n, create a **Strale API** credential and paste the key.

n8n tests the credential with an authenticated read of your wallet balance,
which costs nothing. Every check the node runs is billed to the wallet of the
key you use.

## Usage

- **Billing and reruns.** Each item runs one paid check (two for Screen Name).
  Retrying a failed node, rerunning a workflow or turning on **Retry On Fail**
  repeats completed checks and their charges. Each check is capped at 100
  cents; review your Strale transactions before rerunning.
- **Name lookups.** In the United Kingdom, Norway and Finland, a name lookup
  returns the best match from the registry. Check the returned
  `registration_number` before you rely on it. Swedish lookups need a
  registration number.
- **Screening.** Screen Name returns `name` and two objects, `sanctions` and
  `pep`, each with `match_count`, the potential `matches`, the `lists` checked,
  `source`, `checked_at` and `transaction_id`. A potential match does not
  establish identity; a person reviews it. The optional country is returned as
  context and does not narrow the matches.
- **Missing data.** Fields the source did not supply are returned empty
  (`null`) rather than as a negative result.
- **Slow checks.** A check still running after 20 seconds is followed by its
  transaction ID for up to 60 seconds per item, without resubmitting it. If it
  is still running then, the item fails with the transaction ID to review.
- **Errors.** Invalid input fails before any call is made. Errors from Strale
  show its message and, where it gives one, the fix. With **Continue On Fail**
  on, a failed item returns an `error` field and the rest of the items run.
- **AI agents.** The node can be used as a tool by n8n's AI Agent.

Requests go to `https://api.strale.io` with your key as a bearer token, the
header `X-Strale-Client: n8n-nodes-strale/<version>` and `?src=n8n`.

## Example workflows

Import these from the `workflows` folder:

- [`look-up-company.json`](workflows/look-up-company.json): look up a United
  Kingdom company by its company number.
- [`check-vat-number.json`](workflows/check-vat-number.json): check an EU VAT
  number.

- [`monthly-vat-recheck.json`](workflows/monthly-vat-recheck.json): on the
  first of each month, read a supplier sheet with a `vat_number` column, check
  each number and pass the ones that are not valid to a review step. Each row
  is one paid check a month.

In the first two, replace the manual trigger with the step that brings in the
supplier or customer, for example a form submission, a new spreadsheet row or
a new CRM record.

## Compatibility

Built and tested against `n8n-workflow` 2.16 with `@n8n/node-cli` 0.54. Uses
n8n nodes API version 1.

## Development

From the root of the Strale repository:

```sh
npm ci
npm test --workspace=packages/n8n-nodes-strale
npm run lint --workspace=packages/n8n-nodes-strale
node apps/api/scripts/check-framework-packages.mjs
```

The tests run offline against recorded responses and make no paid calls. They
drive the node through `n8n-workflow`'s parameter resolution and error classes,
and check that the operations match the Strale Zapier app's jobs.

Releases are published to npm with provenance from this repository's GitHub
Actions release workflow.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Strale API documentation](https://strale.dev/docs)
- [Source](https://github.com/strale-io/strale/tree/main/packages/n8n-nodes-strale)

## Version history

### 1.0.0

Rebuilt from scratch. Breaking: the previous Search, Execute, Trust Profile,
Execute Solution and Balance operations are removed. The node now offers three
fixed operations (Look Up a Company, Check an EU VAT Number, Screen a Name),
requires an API key, follows pending checks without resubmitting them and
identifies itself to Strale. Source moved to the Strale repository.

### 0.1.x

Earlier releases from `strale-io/n8n-nodes-strale`. They call endpoints that
no longer exist; upgrade to 1.0.0.
