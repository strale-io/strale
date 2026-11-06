# n8n Creator Portal submission — prepared contents (D8)

Prepared 2026-10-29 and refreshed 2026-11-06 for Petter, who signs up or logs in at
<https://creators.n8n.io/nodes>, accepts n8n's terms and clicks submit
(DEC-20261027-C). n8n does not publish the form's fields, so this lists what a
submission is known to need; copy what the form asks for.

**Updated 2026-11-06: both preconditions are met.** `n8n-nodes-strale@1.0.0` was
published on 2026-11-06 (release run 42205800264, trusted publishing with
provenance), and `@n8n/scan-community-package` reported "has passed all security
checks (provenance, source github.com/strale-io/strale@99e00a4, tarball)":
`archive/receipts/2026-11-06-check-npm-four-packages-production-smoke.json`.
That receipt does not cover the `client_meta.client_header` of a first paid call
through the node (it needs a funded key in n8n), so the header is still
unchecked. The submission is Petter's act, not a session's; see the click-path in
`docs/research/2026-11-06-distribution-listings-audit.md`.

| Field | Value |
|---|---|
| npm package | `n8n-nodes-strale` |
| Version | `1.0.0` |
| npm URL | <https://www.npmjs.com/package/n8n-nodes-strale> (1.0.0 is the latest tag) |
| Website | <https://strale.io> |
| Repository | <https://github.com/strale-io/strale> (package directory `packages/n8n-nodes-strale`) |
| Documentation | <https://github.com/strale-io/strale/tree/main/packages/n8n-nodes-strale#readme> |
| Licence | MIT |
| Node display name | Strale |
| Service | Strale (one service: Strale's API at `api.strale.io`) |
| Categories | Utility, Productivity |
| Authentication | API key (Strale API credential; tested against the wallet balance, no charge) |
| Contact email | the account's own email; the package author field says `hello@strale.io` |

**Short description (one line):**

> Look up companies in official registries, check EU VAT numbers and screen names, paid per call with a Strale API key.

**Longer description:**

> The Strale node adds three checks to a workflow: Look Up Company (United
> Kingdom, Sweden, Norway and Finland), Check VAT Number (EU, through VIES)
> and Screen Person Name (sanctions, then politically exposed person lists).
> Use it after a form, a new spreadsheet row or a CRM record, or on a monthly
> schedule to re-check a supplier list's VAT numbers. Each result names its
> source and fetch time; screening returns potential matches for a person to
> review. Calls are billed per call to the user's Strale wallet.

**If the form asks why this is one service and not a proxy:** the node calls
one API, Strale's, with one credential. It offers three fixed operations with
fixed inputs and outputs; it has no operation that runs an arbitrary tool or
forwards a request to a user-chosen endpoint.

**Held, not submitted (DEC-20261027-B item 8):** no monthly sanctions
re-screening template and no finance- or compliance-team targeting in this
listing, until Petter says the gate is not triggered or customer discovery has
run.
