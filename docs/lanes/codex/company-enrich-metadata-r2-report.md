# company-enrich structured metadata round 2 report

## Result

All blocker, should-fix, and small nit items in the round-2 brief were implemented. The work remains offline-testable: the page fixtures are synthetic and the LLM extractor is mocked.

## Brief item mapping

1. **Title-derived company names:** `company_name` now comes only from a JSON-LD Organization name or `og:site_name`. Open Graph, Twitter, and document titles are passed to Claude only as explicitly untrusted hints. The enrichment helper rejects a title-only/null-model result before it can become billable. Tests cover an nginx title with null model output, Claude's clean name on a title-only page, and `og:site_name` precedence.
2. **Bounded jsdom input:** extraction constructs a bounded document with a 512 KiB head/leading-fragment cap, up to 20 JSON-LD blocks capped at 256 KiB each, and icon links found outside the head. The scan uses `indexOf`, jsdom receives only that bounded document, and the window closes in `finally`. A 10 MiB fixture puts JSON-LD at the tail, asserts successful extraction, and captures/asserts the parser input at no more than 6 MiB.
3. **Social host matching:** LinkedIn, Twitter/X, and GitHub links now require an exact domain or subdomain match. Tests reject `dropbox.com` and `notlinkedin.example` while accepting a real Twitter subdomain.
4. **Prompt framing:** the structured block is labeled as page-extracted, untrusted data; the prior “authoritative; preserve” direction was removed. The merge remains responsible for precedence. The prompt assertion covers both changes.
5. **Empty-page short circuit:** when homepage/about text and structured metadata are all empty, enrichment throws the existing access error before invoking Claude. The test asserts the mock was not called.
6. **`/about` fetch:** the executor again performs the same guarded, timeout-bound `scrapeUrl` path for `/about`, tolerates failure, and sends bounded about text to Claude. Structured metadata is still extracted only from the homepage. Tests assert about content appears in the prompt, and the existing guarded site-access executor suite passes.
7. **Specialty bounds:** both structured prompt values and merged output use 100-character item limits and a 2,000-character joined limit (with the existing 50-item ceiling). Tests assert output item and joined bounds; structured-metadata tests exercise prompt-source extraction.
8. **Metadata-only SEO description:** `seo_description` was removed from Claude's requested output schema. It continues to be populated and enforced from page metadata by the merge. The prompt-schema test guards the removal.

### Small nits

- JSON-LD recognizes `Organization`, `Corporation`, `LocalBusiness`, and `Store` in plain, `schema:`, and schema.org IRI forms, including Organizations nested under `publisher`.
- When multiple Organizations exist, the node whose `url` or `@id` host matches the requested site is preferred.
- Addresses accept arrays, country `{ name }` objects, and plain strings (mapped to `street`).
- Tests cover the added type, node-selection, and address behavior.

## Verification

- `node ../../node_modules/vitest/vitest.mjs run --project code src/capabilities/company-enrich.test.ts src/lib/company-enrich/structured-metadata.test.ts` — passed, 27 tests.
- `node ../../node_modules/vitest/vitest.mjs run --project code src/capabilities/site-access-executors.test.ts` — passed, 34 tests.
- `npm run build --workspace=packages/mcp-server` — passed.
- `npm run build --workspace=packages/sdk-typescript` — passed.
- `npm run typecheck` — passed after both required package builds.
- `git diff --check` — passed.

## Not done

Nothing from the implementation brief was omitted.
