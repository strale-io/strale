# Strale in Clay: registry status and VAT checks per row

Two Clay HTTP API enrichment columns that call Strale with your own API key.
Each row of your table gets the company's official registry status, and the
name and address its VAT registration carries, with the source and the time
it was checked.

| Column recipe | Strale tool | Price per row | Your table needs |
|---|---|---|---|
| Company registry status | `company-status-check` | €0.08 | a country code and the company's registry number |
| VAT check | `vat-validate` | €0.02 | a VAT number with its country prefix |

Prices are the tools' list prices on the day this template was published; each
recipe also sends a price cap (`max_price_cents`), so a price change can never
charge a row more than the cap. You pay Strale per row. An HTTP API column
with your own key should use no Clay credits on paid Clay plans; check yours.

The exact configuration of both columns is in [`recipes.json`](recipes.json).

## Before you start

1. A Strale API key. Sign up at [strale.dev/signup](https://strale.dev/signup?utm_source=clay-template&utm_medium=listing&utm_campaign=d9);
   trial credit is available where eligible.
2. A Clay table with the input columns. [`sample-table.csv`](sample-table.csv)
   is a three-row table you can import to try it.
3. Set the **Company number** column to text, not number. Registry numbers
   such as `00445790` (UK) lose their leading zeros as numbers, and the
   registry then cannot find the company.

## Column 1: Company registry status

1. In your table, click **Add column** → **Add enrichment** → search for
   **HTTP API**.
2. **Method:** `POST`
3. **Endpoint:** `https://api.strale.io/v1/do?src=clay-template`
4. **Headers:** add three.

   | Key | Value |
   |---|---|
   | `Content-Type` | `application/json` |
   | `Authorization` | `Bearer ` followed by your Strale API key |
   | `X-Strale-Client` | `clay-template/1.0.0` |

5. **Body:** paste the text below. Then replace `{{Country code}}` and
   `{{Company number}}` with your columns: delete the placeholder, type `/`
   and pick the column. Keep the quotation marks around each one.

   ```json
   {
     "capability_slug": "company-status-check",
     "max_price_cents": 10,
     "inputs": { "country": "{{Country code}}", "identifier": "{{Company number}}" }
   }
   ```

6. Under the run settings, set it to run only when **Country code** and
   **Company number** are not empty, so empty rows are not sent. Set the column's rate limit to 10 requests a second or lower. Strale
   limits calls with a valid key to 10 a second per key, whichever IP
   address Clay sends them from.
7. Run it on one row first. When the response appears, add these fields as
   columns:

   | New column | Response field | What it holds |
   |---|---|---|
   | Registry status | `result.output.status` | `active`, `inactive`, `dissolved`, `in_liquidation`, `in_insolvency`, `struck_off` or `unknown` |
   | Registry status (as published) | `result.output.registry_status_raw` | the registry's own wording; blank if the registry gives none |
   | Registered name | `result.output.company_name` | the name on the register; blank if the registry gives none |
   | Registry | `result.output.registry.name` | which official register answered |
   | Insolvency checked | `result.output.insolvency.checked` | `true` when an official insolvency source was read for this company |
   | Insolvency notices found | `result.output.insolvency.notices_found` | the number of notices; **blank when Insolvency checked is false** |
   | Registry checked at | `result.output.as_of` | when the register was read |
   | Strale transaction | `result.transaction_id` | the record of this call in your Strale account |

**Read these two columns together.** A blank *Insolvency notices found* means
no insolvency source was checked for that company. It does not mean none were
found. Some countries have no connected insolvency source.

**Active means registered.** It shows the company is on the register and not
wound up, which includes dormant companies; it does not show that the company
trades. Countries covered: the error for an unsupported country lists them.

## Column 2: VAT check

Same steps, with this body and the **VAT number** column:

```json
{
  "capability_slug": "vat-validate",
  "max_price_cents": 5,
  "inputs": { "vat_number": "{{VAT number}}" }
}
```

Run it only when **VAT number** is not empty, and add:

| New column | Response field | What it holds |
|---|---|---|
| VAT valid | `result.output.valid` | `true` or `false` from the registry |
| VAT registered name | `result.output.company_name` | the name on the VAT registration, where the country publishes it |
| VAT registered address | `result.output.company_address` | the address, where the country publishes it |
| VAT country | `result.output.country_code` | the country prefix |
| Strale source | `result.provenance.source` | which service answered |
| Strale checked at | `result.provenance.fetched_at` | when it was checked |
| Strale transaction | `result.transaction_id` | the record of this call |

Some countries do not publish the name or address through their VAT
service, so those cells can be blank. A repeated check can be answered from
a recent cached result; *Strale checked at* then shows when it was fetched.
UK VAT numbers return an error for now.

## When a row fails

Strale answers with a JSON error that Clay shows in the cell:

| `error_code` | Meaning | What to do |
|---|---|---|
| `unauthorized` | the key is missing or wrong | check the `Authorization` header |
| `insufficient_balance` | the wallet is empty | top up at strale.dev |
| `execution_failed` | the tool could not answer this row, for example a number in the wrong format, an unsupported country or a registry that is down; you are not charged | `details.error` says why; retry later if `details.retryable` is true |
| `invalid_input` | the request itself is malformed, for example a missing input | compare the body with the recipe |
| `budget_exceeded` | the tool now costs more than the recipe's price cap | check the new price, then raise `max_price_cents` if you accept it |
| `rate_limited` | more than 10 calls a second on one key (or, without a valid key, 60 a minute from one IP address) | lower the column's rate limit in Clay's run settings |

Errors also carry a `details.fix` or `details.next_step` line saying what to do.

## What the template sends

Each request carries `src=clay-template` on the URL and the header
`X-Strale-Client: clay-template/1.0.0`. Strale uses these to count how many
calls come from this template, as a channel total. It does not use them to
identify or contact you.

## How this template is checked

`node --test examples/clay-enrichment/template.test.mjs` runs in CI. It fails
if a recipe sends an input the tool's schema does not take, if a mapped column
is not a field the tool documents, if the price cap falls below the tool's
price, or if the sample table no longer renders and maps as above. With a
Strale API key, `node examples/clay-enrichment/run-sample.mjs` sends the
sample table to production and prints the cells Clay would add.
