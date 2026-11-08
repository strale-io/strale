# Image-to-text media-type report

## Result

`image-to-text` now derives the Anthropic `media_type` from the image signature rather than trusting a data-URI header, a default, or an HTTP `content-type`. PNG, JPEG, GIF, and WebP are accepted. Other bytes and malformed base64 are caller-input refusals before the Anthropic client is called. Output, provenance, OCR prompt, model role, response parsing, URL content-type allow-list, fetch error, and size cap are unchanged.

## Files changed

- `apps/api/src/capabilities/image-to-text.ts` — adds the pure `sniffImageMediaType` magic-byte helper; validates base64 syntax; sniffs only the leading decoded base64 bytes; uses byte-derived types on base64 and URL paths; emits typed, actionable refusals for unsupported bytes.
- `apps/api/src/capabilities/image-to-text.media-type.test.ts` — adds the brief's offline media detection and refusal coverage with mocked Anthropic and `safeFetch`.
- `apps/api/src/capabilities/input-byte-limits.test.ts` — updates the shared byte-limit positive fixtures for `image-to-text` to contain a real PNG signature, while retaining its existing cap and normalisation coverage; pins the newly required malformed-base64 refusal.
- `apps/api/src/lib/actionable-errors-round2.test.ts` — permits the brief's exact base64 hint, which names the encoding directly rather than quoting the schema field.
- `manifests/image-to-text.yaml` — documents the four accepted formats and that type is read from the image itself.
- `docs/lanes/codex/image-to-text-media-type-report.md` — this report.

## Tests added or adjusted and what they pin

All image-to-text tests are offline: the Anthropic messages call and `safeFetch` are mocked.

- Raw headerless JPEG base64 is sent as `image/jpeg`.
- `data:image/jpg;base64,...` containing JPEG bytes is normalised to `image/jpeg`.
- A PNG data-URI header over GIF bytes is sent as `image/gif`, proving bytes win over labels.
- WebP RIFF/WEBP bytes are sent as `image/webp`.
- PDF, SVG, random bytes, and syntactically invalid base64 each produce the exact `base64` refusal before Anthropic is called.
- Each base64 refusal satisfies `isCapabilityRefusal`, `isUserInputError`, and transaction classification `caller_input`.
- A URL response labelled `image/png` but containing JPEG bytes is sent as `image/jpeg`.
- HTML bytes labelled as an image are refused naming `image_url` before Anthropic is called.
- A decoded payload over 4 MiB remains refused before Anthropic is called.
- Existing shared resource-limit tests still pin exact normalised payload forwarding, unpadded base64 tolerance for valid images, SSRF-safe URL fetching, and URL/base64 caps.
- The actionable-error inventory pins that the mandated base64 hint remains an actionable `Send ...` instruction.

## Commands and results

- `npm ci` — **failed** because the `c2pa-node` postinstall attempted to download test certificates from GitHub and the environment returned `ENETUNREACH`.
- `npm ci --ignore-scripts` — **passed**; installed 1,051 packages. npm reported the repository's existing audit findings and Node 20 engine warnings for dependencies requiring Node 22.
- `cd apps/api && npx vitest run src/capabilities/image-to-text src/lib/resource-limits` — **passed**, 2 files and 23 tests.
- `npm --workspace=packages/mcp-server run build` — **passed**.
- `npm --workspace=packages/sdk-typescript run build` — **passed**.
- `npm run typecheck` — **passed** across the API, API scripts, SDK, LangChain, Semantic Kernel, MCP, AI SDK, and CLI workspaces.
- `cd apps/api && npx vitest run src/capabilities/input-byte-limits.test.ts src/capabilities/image-to-text.media-type.test.ts src/lib/resource-limits` — **passed**, 3 files and 124 tests.
- `cd apps/api && npx vitest run src/lib/company-enrich/structured-metadata.test.ts` — **passed**, 1 file and 58 tests (rerun of a full-suite timing failure).
- `cd apps/api && npx vitest run` — **failed**, 4 of 10,499 tests failed in 3 files after 427.37 seconds. The files were:
  - `src/lib/actionable-errors-round2.test.ts`: its static source evaluator could not evaluate the initial field-parameterized refusal helper. The implementation was changed to direct `inputRefusal` calls and this file passed in the subsequent targeted run.
  - `src/capabilities/lib/web-provider-text-check.test.ts`: performance threshold miss, 505.77 ms against a 500 ms limit.
  - `src/lib/company-enrich/structured-metadata.test.ts`: two performance threshold misses, 1,129.33 ms and 1,115.03 ms against 1,000 ms limits. The file passed alone immediately afterward.
- `cd apps/api && npx vitest run src/capabilities/image-to-text src/capabilities/input-byte-limits.test.ts src/lib/resource-limits src/lib/actionable-errors-round2.test.ts && npx tsc --noEmit --project tsconfig.json` — **passed**, 4 files and 235 tests plus API TypeScript compilation.
- `git diff --check` — **passed**.

## Anything not done

- No Anthropic or real-network call was made by a test, as required.
- The full API suite was not run a third time after fixing the actionable-error test. Its remaining observed failures were unrelated wall-clock performance thresholds; the structured-metadata file passed on immediate isolated rerun. Every changed/relevant test and TypeScript compilation passed afterward.
