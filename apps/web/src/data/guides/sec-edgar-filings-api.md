---
slug: sec-edgar-filings-api
title: "SEC EDGAR filings API: find 10-K, 10-Q and 8-K documents"
description: "Find recent SEC filing links by ticker or CIK using Strale. Filter by form type, distinguish filing dates from report dates and understand the recent-filings limit."
group: companies
framework: "REST API"
language: "cURL"
tools: [sec-edgar-filings]
---
Use `sec-edgar-filings` to retrieve recent filing metadata and document links from the SEC. Give it a ticker or CIK and optionally a form type. The Strale call costs {{price:sec-edgar-filings}} with an API key; it returns JSON for your app or agent, not the filing’s contents or extracted financial figures.

## Find an annual report

Set `STRALE_API_KEY` to your API key, then run:

```bash cURL
curl -X POST https://api.strale.io/v1/do \
  -H "Authorization: Bearer $STRALE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "capability_slug": "sec-edgar-filings",
    "inputs": { "ticker": "AAPL", "form_type": "10-K", "limit": 1 },
    "max_price_cents": 3
  }'
```

Use `10-Q` for quarterly filings or `8-K` for current reports. The form filter is exact: `10-K` does not also select `10-K/A`. Omit `form_type` to include all recent forms. `limit` accepts 1 to 50 and defaults to 20.

## Use a CIK when needed

Replace `ticker` with `"cik":"320193"` to look up the same filer by its SEC Central Index Key. A CIK can have up to ten digits, including leading zeros. If both inputs are supplied, CIK takes priority. Use it when a filer is missing from the SEC ticker index.

## Read the links and dates

In the response's `output`, `filings` holds the matching records and `returned` gives their count. Each record can include a document `url`, an `index_url`, an accession number, a `filing_date` and a `report_date`. The filing date and the period or event date are different; the report date may be absent.

Open the document URL to read the source. The tool does not parse the filing’s financial statements, return XBRL facts or monitor filings on a schedule. Your application decides when to call and can use accession numbers to avoid processing the same filing twice.

## Understand the search window

Only the recent filings in the SEC submissions response are searched. Older archive pages are not traversed, so a low result count or empty list is not evidence that no older filings exist. Use the returned `edgar_url` to explore the filer’s full history.

See [SEC EDGAR Filings](/tools/sec-edgar-filings) for all inputs, output fields and current limitations.
