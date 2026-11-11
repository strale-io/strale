Intent: Codex builder brief: the Japanese registry (NTA) response is checked for nesting depth and element count in one linear pass before jsdom parses it.

# Brief: NTA XML gets a linear shape check before jsdom

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-11.
  - Source: robustness T1 item (3), the sweep of the places that hand fetched markup to jsdom.
- **Branch:** push only `codex/nta-xml-shape-bound`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. Tests run offline with a mocked fetch and no NTA credentials, like `apps/api/src/capabilities/japanese-company-data.test.ts`.
- **Read first:**
  - `apps/api/src/lib/nta-corporate.ts`, especially `parseResponse` and its existing pre-checks for DOCTYPE, `<count>` and `<corporation` before `new JSDOM(xml, { contentType: "application/xml" })`;
  - `apps/api/src/capabilities/japanese-company-data.test.ts`;
  - `apps/api/src/lib/resource-limits.ts`.

## Why

`parseResponse` already caps the body at 1 MiB (`MAX_RESPONSE_BYTES`) and the record count at 50. It does not bound nesting depth or the number of elements. On 2026-11-11 the Strale master timed jsdom's XML parse on this repository's own jsdom:

| Input | Time |
|---|---|
| 16 KiB of unclosed `<a>` nesting | 2.7 s |
| 64 KiB of unclosed `<a>` nesting | 21.4 s |
| 1 MiB of unclosed `<a>` nesting | 20.4 s |
| 64 KiB of closed `<a>` nesting | 12.7 s |
| 1 MiB of flat `<b/>` elements | 1.3 s |

Each of these blocks the event loop for every caller.

The XML comes from the official NTA API over HTTPS, not from the caller, so the risk is low. But a malformed or hostile upstream body should be refused in milliseconds, not parsed for 20 seconds.

A real NTA type-12 response is three levels deep (`corporations` > `corporation` > field) and holds at most 50 records of roughly 30 fields.

## What to change

1. **A pure helper:** `assertXmlShape(xml: string, { maxDepth, maxElements })`.
   - It makes one forward, linear scan of the markup.
   - Opening tags add one to the depth, closing tags take one away, and self-closing tags and `<?…?>` declarations do not change it.
   - Comments, CDATA and processing instructions are skipped linearly, with an `indexOf` that only ever moves forward.
   - It throws when the depth exceeds `maxDepth` or the element count exceeds `maxElements`.
   - Each character is visited a bounded number of times; no regex backtracking over the whole body.
2. **Call it in `parseResponse`** after the existing DOCTYPE and count checks and before `new JSDOM`.
   - Use `maxDepth: 8` and `maxElements: 5000`, as named constants.
   - A failure throws the same `ntaError("execution_failed", "NTA returned an unexpected response. Retry later.")` the function already uses. It names no internals and holds none of the body.
3. **No change** to the request, the cool-down, the in-flight limit, the output shape, or the attribution.

## Tests (offline; each must fail against origin/main)

1. **Deep nesting is refused fast:** 64 KiB of unclosed `<a>` nesting inside `<corporations>` is refused with the existing error in under 100 ms. The mocked fetch returns it.
2. **Too many elements is refused:** 6,000 sibling `<x/>` elements are refused with the same error.
3. **A real-shaped response still parses:** 50 records of about 30 fields each give the same mapped output as before. Build it in the test.
4. **The helper alone:**
   - a comment or CDATA section containing `<a><a><a>` adds no depth;
   - a self-closing tag adds no depth;
   - an unclosed comment ends the scan without a hang;
   - a 1 MiB hostile input finishes in under 200 ms.
5. **Existing tests still pass.**

## Done when

- `cd apps/api && npx vitest run src/capabilities/japanese-company-data` passes, plus any test file you add.
- `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first.
- The full `npx vitest run` in `apps/api` passes. Report every failing file.
- `docs/lanes/codex/nta-xml-shape-bound-report.md` exists and lists:
  - the files changed;
  - the measured times, before and after;
  - each test and what it pins;
  - the commands run, with their results.
