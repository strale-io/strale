Intent: Codex builder brief: image-to-text detects the image type from the bytes and refuses what is not a supported image, instead of sending a wrong media_type to Anthropic.

# Brief: image-to-text sends the right media type, or refuses

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-08. Source: robustness T4 item 5 (`docs/programs/robustness/tracks.yaml`) and the daily run of 2026-11-07, which found 4 paid failures of the form "Anthropic 400 on base64 payload".
- **Branch:** push only `codex/image-to-text-media-type`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. **All tests run offline** with a mocked Anthropic client and a mocked `safeFetch`. Never call Anthropic or the network from a test. Tiny synthetic images are fine: build them from bytes in the test, or commit a few-byte fixture.
- **Read first:** `apps/api/src/capabilities/image-to-text.ts`, `apps/api/src/lib/resource-limits.ts` (`checkedBase64`, `normalizeBase64`), `apps/api/src/lib/capability-refusal.ts`, `manifests/image-to-text.yaml`, and any existing `image-to-text` tests.

## Why (the cause is likely but unverified; the fix is right either way)

On the `base64` input path, `image-to-text.ts` takes the media type from a `data:image/...;base64,` header and otherwise **defaults to `image/png`**. It never checks the type against `ALLOWED_MEDIA`, and it never checks the bytes. Anthropic answers 400 when `media_type` does not match the image, or is not one of `png`, `jpeg`, `gif` or `webp`. That happens on these inputs:

- raw JPEG, GIF or WebP base64 with no header, sent as `image/png`;
- `data:image/jpg;base64,...`, which sends `image/jpg`, not a valid value;
- `data:image/svg+xml` (it does not match `\w+`, so it is sent as png), HEIC, a PDF, or any other non-image;
- corrupt base64.

These are caller-input problems, but today they surface as an upstream 400 that counts against the tool. The URL path already checks `ALLOWED_MEDIA` against the response's content-type, but it never checks the bytes either.

## What to change

1. **Add a small pure helper**, for example `sniffImageMediaType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null`, using magic bytes:
   - PNG: `89 50 4E 47 0D 0A 1A 0A`
   - JPEG: `FF D8 FF`
   - GIF: `47 49 46 38 37 61` or `47 49 46 38 39 61`
   - WebP: `52 49 46 46` followed by 4 bytes, then `57 45 42 50`

   Read only the first 16 bytes. Decoding the leading base64 characters is enough; do not decode the whole payload twice.
2. **Base64 path:** after `checkedBase64`, sniff the bytes.
   - **The bytes are one of the four types:** use the sniffed type as `media_type`, whatever the header says. A header that disagrees is not an error; the bytes win.
   - **They are none of the four:** throw `inputRefusal` naming `base64`. Wording: "'base64' must be a PNG, JPEG, GIF or WebP image." Hint: "Send the image as PNG, JPEG, GIF or WebP, base64-encoded, with or without a data: header." Throw it before any Anthropic call.
   - **Malformed base64**, meaning normalisation leaves something that is not valid base64: the same refusal, before the call.
3. **URL path:** after the bytes are read, sniff them too. Use the sniffed type when it is one of the four; otherwise refuse, naming `image_url`, before the Anthropic call. Keep the existing content-type check and cap, and keep the error for a failed fetch. A server that labels a JPEG as `image/png` now works.
4. **Output and provenance unchanged.** No new output fields. No change to the prompt, the model role, or the response parsing.
5. **Manifest** (`manifests/image-to-text.yaml`): add or adjust one limitation, "Accepts PNG, JPEG, GIF and WebP; the type is read from the image itself."

## Tests (offline; each must fail against origin/main)

1. Raw JPEG base64 with no header: the mocked Anthropic call receives `media_type: "image/jpeg"`.
2. `data:image/jpg;base64,<jpeg>` is sent as `image/jpeg`.
3. A PNG header over GIF bytes is sent as `image/gif`.
4. WebP bytes are sent as `image/webp`.
5. A PDF (`%PDF-`), SVG text, random bytes and invalid base64 are each refused, naming `base64`, and the Anthropic mock is **never called**. The refusal satisfies `isCapabilityRefusal`, `isUserInputError` and `classifyTransactionFailure(...) === "caller_input"`. Use the same assertions as `apps/api/src/capabilities/fx-unsupported-currency.test.ts`.
6. URL path: a server answering `content-type: image/png` with JPEG bytes is sent as `image/jpeg`. HTML bytes with an image content-type are refused, naming `image_url`, before the call.
7. The size cap still refuses an oversized payload before the call. Keep the existing behaviour.

## Done when

- `cd apps/api && npx vitest run src/capabilities/image-to-text src/lib/resource-limits` passes, using the paths that exist.
- `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first (`npm --workspace=packages/mcp-server run build`, `npm --workspace=packages/sdk-typescript run build`).
- The full `npx vitest run` in `apps/api` passes. Report every failing file.
- `docs/lanes/codex/image-to-text-media-type-report.md` lists the files changed, each test and what it pins, the exact commands run with their results, and anything not done.
