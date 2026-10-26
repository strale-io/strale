Intent: DEC-20261023-A adoption, work item 3. Record Serper.dev's and Jina
Reader's terms on resale in `apps/api/src/lib/vendor-terms.ts`, and queue
the decision a non-permitting answer needs.

## What changed

- `VENDOR_TERMS_RECORDS` (new, in `vendor-terms.ts`) records, per vendor:
  - the hosts, and the executors that call them (held to the source by
    `vendor-terms.test.ts`);
  - the resale verdict;
  - the terms URL and access date;
  - how the text was read;
  - the findings;
  - the decision reference.
- **Serper.dev, `unverified`:** serper.dev was unreachable from this session
  (network policy). The search engine's cached copy (about 878 days old) has
  no resale grant. It forbids mirroring materials "as-is with
  no-value-added", and calls the data "web-scraped". **Eight** executors call
  it: the proposal named four; `backlink-check`, `google-news-search`,
  `keyword-rank-check` and `serp-related-questions` were found in the code.
- **Jina Reader, `unverified`, removed:** off every fetch path since PR #723.
  `r.jina.ai` is added to `PROHIBITED_UPSTREAM_HOSTS`, so it cannot return
  unnoticed.
- **DQ-39** (`your_call`) in `docs/company/DECISION-QUEUE.md`:
  - Options: ask Serper in writing; move to a per-call vendor whose terms
    permit resale (DataForSEO, Brave Search API to check; SerpApi is
    excluded as a defendant); or switch the eight off.
  - Recommendation: ask Serper today, and keep the tools running for a
    two-week time-boxed exception that only Petter can grant.

## Open

- Re-read serper.dev/terms live once a session can reach it, and update the
  record (`accessed`, findings, verdict).
- Candidate replacement vendors' terms are unverified; checking them is
  technical groundwork and can start without contacting anyone.
