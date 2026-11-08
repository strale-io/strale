Intent: stop `image-to-text` sending Anthropic a `media_type` that does not match the image. Robustness T4 item 5: 4 paid "Anthropic 400 on base64" failures in the 7 days to 2026-11-07. The cause is likely but not verified against the failed inputs.

[BACKFILL] Cloud session; no Notion write was made.

## What changed

- **The type comes from the bytes.** It is read from the first 16 bytes (PNG, JPEG, GIF, WebP) on both the base64 and URL paths, and it overrides the data-URI header or the server's content-type label.
- **Refusals before any Anthropic call.** Non-images and malformed base64 get an `inputRefusal`, classified `caller_input`.
- **URL-safe base64 is now refused** (`-`, `_`). It most likely failed at Anthropic before anyway.

## How it was built

- **Codex `image-to-text-media-type`, 8cc0b9ff.** Independent review: PASS-WITH-NITS.
  - **M1:** Codex had carved an exception for this file into the all-capability guard in `actionable-errors-round2.test.ts`, because the brief's hint wording did not quote the field.
- **Claude follow-up commit.** It reverts that test file to `origin/main` and rewords the hint to "Send 'base64' as …".

## R4: container-track (decision prepared, not taken)

- **Terms unread.** A terms check on 2026-11-08 could not read MSC's, CMA CGM's or Hapag-Lloyd's terms or legal pages; every one answered 403 to automated reads.
- **robots.txt:**
  - CMA CGM disallows only `/api/*` and some document paths;
  - Hapag-Lloyd disallows nothing;
  - MSC's could not be read (403).
- **Official APIs exist:**
  - MSC: developerportal.msc.com, with a "Track and Trace" API; access goes through a request form.
  - CMA CGM: api-portal.cma-cgm.com.
  - Hapag-Lloyd: api-portal.hapag-lloyd.com, which did not resolve from the cloud.
- **Next (morning run, needs the DB):** read `container-track`'s paid calls over 30 days.
  - **Near zero:** delist it (the session's call under the charter) until it runs on official APIs.
  - **It earns:** registering for the carriers' APIs is Petter's call. Until then it stays listed with `data_access` checks pending.

## Still open

- **On the PC:** `validate-capability` and `smoke-test` for `image-to-text`.
- **After deploy:** `who-called --slug image-to-text --days 7 --errors` shows no `Anthropic 400` on base64, only `caller_input` refusals for non-images.
