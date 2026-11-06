Intent: Codex builder brief, run 3 of 3: close the last review findings on company-enrich structured metadata.

# Brief: company-enrich metadata, run 3 (final)

- **Requester:** the Strale orchestrator (session_01CR5YPsTtEwE3tRQtvTzerw).
- **Branch:** push only `codex/company-enrich-metadata-3`. It starts from run 2, 1cc51be5. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only. There are no secrets. Tests stay offline, with synthetic HTML and a mocked Claude call.
- **Last run.** This is the last Codex run on this change. Do every item, and keep the scope to these items.
- **Context.** Runs 1 and 2: `docs/lanes/codex/company-enrich-metadata-brief.md`, `-2-brief.md` and their reports. The independent review of run 2 confirmed that items 1 and 3 to 7 of run 2 are fixed. It found that the denial-of-service fix (run-2 item 2) is incomplete, with two measured blow-ups, plus a few leaks.

## Blockers

1. **Icon links are unbounded** (`apps/api/src/lib/company-enrich/structured-metadata.ts`, around lines 169-178).
   - Every `<link …icon…>` outside `<head>` is pushed into the jsdom input with no count or size limit.
   - Measured: 4 MB of icon links took 6.7 s and over 1 GB. 16 MB ran out of memory. One 16 MB `href` took 590 MB.
   - **Fix:**
     - keep at most 8 icon link tags;
     - drop any single tag longer than 4 KB;
     - cap the **whole** string given to jsdom at 1.5 MB (head slice plus JSON-LD blocks plus icon links), cutting JSON-LD blocks first and the head slice last.
   - Lower the head slice cap from 512 KB to 128 KB. Measured: 512 KB of tiny meta tags with no `</head>` took 2.5 s.
2. **The script scan is quadratic** (`structured-metadata.ts`, around line 159).
   - When an opening `<script` has no `</script>` after it, every later `<script` searches to the end of the page again. Measured: 1 MB took 36 s and 2 MB took 145 s.
   - **Fix:** when no closing tag is found, process the current block if it is JSON-LD, then stop scanning. Make the whole scan provably linear, so each character is visited a bounded number of times.
3. **The page-text regexes are quadratic as well** (`apps/api/src/capabilities/company-enrich.ts`, around lines 117 and 130, plus any copy).
   - The `/<script[^>]*>[\s\S]*?<\/script>/gi` style strip (and the matching style/tag strips) took 28 s on 1 MB of unclosed `<script>` tags. It runs on the same HTML right after extraction.
   - **Fix:** replace these with a linear `indexOf`-based strip of script and style blocks that stops at the first unclosed tag (drop the remainder), then a simple tag strip.
   - Cap the HTML these steps read at a fixed size (for example the first 2 MB) before any processing.

## Should-fix

4. **`seo_description` is still not metadata-only** (`company-enrich.ts`, around lines 67-70). `{...llm}` passes Claude's value through when the page has none, and the review saw "INVENTED BY MODEL" reach the output. Set `output.seo_description = structured.seo_description` unconditionally, next to `logo_url` and `email`. Also drop any key from the model output that is not in the requested schema. Add a test for each.
5. **Email domain on shared hosts** (`structured-metadata.ts`, around lines 78-79). Use `getDomain(host, { allowPrivateDomains: true })` on both sides, so `ceo@evil.vercel.app` is not accepted for `acme.vercel.app`. Test `vercel.app` and `github.io`.
6. **Prompt label.** Name the ABOUT PAGE CONTENT section in the untrusted-data label as well.
7. **Manifest text** (`manifests/company-enrich.yaml`).
   - Around lines 98 and 161, it says "homepage" only; say "the homepage and its /about page".
   - Around line 165, the workaround names a `data_sources` field that does not exist; use `provenance.field_sources`.

## Tests that must fail on run 2 (1cc51be5) and pass here

Test `buildBoundedMetadataHtml` (or whatever builds the jsdom input) directly, and assert that the parser input length is **greater than 0** as well as under the cap. The run-2 test passed on run 1 because the parser input was never captured. Cases:
- 4 MB of `<link rel="icon" href="/a">`;
- one icon link with a 16 MB `href`;
- 2 MB of `<script>` with no closing tag. Assert it finishes, and assert the scan's step count or input bound, not wall time.
- 1 MB of tiny `<meta>` tags with no `</head>`;
- the page-text strip on 2 MB of unclosed `<script>`.

Keep all existing company-enrich and structured-metadata tests passing.

## Done when

- The new tests pass, and each fails on 1cc51be5.
- `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first.
- `docs/lanes/codex/company-enrich-metadata-3-report.md` maps each numbered item to its change and test, and lists anything not done.
