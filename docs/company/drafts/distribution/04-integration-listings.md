# DRAFT — listing texts for the top three integrations (not submitted)

**Status: DRAFT.** Nothing here is built, submitted or published. Texts are
written for integrations that do not exist yet; every operation named must
exist and pass its tests before a text ships (DEC-20260422-A). Research:
`docs/research/2026-10-27-distribution-strategy.md` §7. Same claim rules as
`01-listing-texts.md` (no typed counts except where marked "re-read on the
day", no "verified/trusted/compliant", x402 never implied for all tools).

The three integrations share one set of five job operations, so the texts
describe the same thing everywhere:

| Operation | Strale tools behind it | Input | Returns |
|---|---|---|---|
| Look up company | country company-data tools | country, registration number | name, status, address and directors where the source provides them, source name |
| Check company status | `company-status-check` | country, registration number | registered/active status, insolvency notices where an official source exists |
| Check EU VAT number | `vat-validate` | VAT number | valid or not, name and address where VIES returns them |
| Screen a name | `sanctions-check`, `pep-check` | person or company name | matches with list and score, for a person to review |
| Check an invoice issuer | `invoice-verify-{cc}` bundle | country, issuer details, VAT, IBAN | each step's result and an AI-generated summary for a person to review; billed even if only some steps succeed (refunded only if every step fails) |

---

## 1. Zapier (experiment D5)

*Superseded for D5 on 2026-10-29 by `packages/zapier-strale/README.md` (0.2.0): five visible actions ship (Look Up a Company, Check an EU VAT Number, Check an IBAN, Check an Email Address, Screen a Name), because the company status and invoice issuer tools are not public. The listing short description is the package description.*

**App name:** Strale
**Category:** Business Intelligence (a finance or accounting category waits for research §9 item 8)
**Short description (≤140):**

> Check companies, VAT numbers and sanctions lists from your Zaps. Pay per call with your Strale API key.

**Long description:**

> Strale gives your Zaps a checking step for the moments money or data
> changes hands:
>
> - **New supplier or customer:** look up the company in its business
>   register by registration number and check that it is still active.
> - **Every incoming invoice:** check the issuer's EU VAT number, or run a
>   full invoice-issuer check in one step (its summary is AI-generated, for a
>   person to review).
> - **Any time:** screen a name against sanctions and politically exposed
>   person lists.
>
> Each result names its source. Screening matches and summaries are for a
> person to review; Strale does not approve or reject anyone. You pay per call from your
> Strale balance — no subscription.

**Actions:** Look Up Company · Check Company Status · Check EU VAT Number ·
Screen a Name · Check an Invoice Issuer
**Searches:** Find Company by Registration Number
**Triggers:** none in v1 (Strale has no event source; use Zapier Schedule
for re-checks)
**Starter Zap templates (one per job):** "New row in Google Sheets → Check
EU VAT Number → update row"; "New supplier in Airtable → Look Up Company →
Slack alert if not active". A monthly re-screening template is held until
research §9 item 8 is answered.

Claim notes: "business register" covers vendor-wrapped sources; if the
claims row for "official records" lands as allowed, the long description may
say "official business register".

---

## 2. n8n verified community node (experiment D8)

*Superseded for D8 on 2026-10-29 by [05-n8n-creator-portal-submission.md](05-n8n-creator-portal-submission.md): three operations ship (two of the five tools are not public), and the monthly template re-checks VAT numbers.*

**Package:** `n8n-nodes-strale` (major version bump; the 0.1.x node calls a
removed route and is replaced, not patched)
**Display name:** Strale
**Node description (≤ 1 line):**

> Look up companies in business registers, check EU VAT numbers and screen names against sanctions and PEP lists.

**README opening:**

> The Strale node adds five checks to your workflows: Look Up Company, Check
> Company Status, Check EU VAT Number, Screen a Name and Check an Invoice
> Issuer. Use it after a form, an invoice parser or a CRM trigger, or on a
> Cron schedule to re-screen a list every month. Results name their source;
> screening matches are for a person to review. Calls are billed per call to
> your Strale API key.

**Verification checklist (n8n rules, from research §7.2):** no runtime
dependencies; no environment or file-system access; MIT; public repo;
`npx @n8n/scan-community-package` passes; published from a GitHub Action with
provenance; one service (Strale's checking API) with fixed operations — no
generic "run any capability" operation.

**Starter workflow:** "Monthly supplier status check" — Cron (1st of month)
→ Google Sheets (read list) → Strale: Check Company Status → IF not active →
email. (A sanctions re-screening workflow is held until research §9 item 8.)

---

## 3. Clay HTTP API template (experiment D9)

**Template name:** Strale — company record by registration number
**Template description:**

> Add the company's register record to every account: legal name, status,
> address and directors where the register provides them, and the source.
> Uses your own Strale API key in an HTTP API column; Strale bills per call.

**Columns produced:** `strale_legal_name`, `strale_status`,
`strale_address`, `strale_directors` (where available), `strale_source`,
`strale_fetched_at`
**Second template:** "Strale — EU VAT check" (`strale_vat_valid`,
`strale_vat_name`, `strale_source`)
**Request:** `POST https://api.strale.io/v1/do?src=clay-template` with
`capability_slug`, `inputs`, `max_price_cents`.

Notes: name fields per country differ; the template must map only
documented output fields and leave a column empty where a country's source
lacks it. Test on a sample table covering at least three countries before
publishing.
